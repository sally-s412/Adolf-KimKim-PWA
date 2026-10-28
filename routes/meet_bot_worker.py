"""
Google Meet Bot Worker.

Launched as a subprocess under `xvfb-run -a`:
    xvfb-run -a python routes/meet_bot_worker.py <meet_url> <job_dir>

1. Routes Chromium audio to PulseAudio `virtual_sink`.
2. Joins the Google Meet using `./google_meet_record/meet_bot_profile`.
3. Waits for host admission, then starts FFmpeg recording `virtual_sink.monitor`
   to `<job_dir>/audio.wav` (16kHz mono PCM).
4. Scrapes participant names and active speaker timeline from the Meet DOM,
   updating `<job_dir>/meta.json` every ~0.5s.
5. On meeting end or SIGINT/SIGTERM, gracefully finalizes `audio.wav` and exits.
"""

import json
import os
import random
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from patchright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
PROFILE_DIR = BASE_DIR / "google_meet_record" / "meet_bot_profile"
SINK_NAME = "virtual_sink"

BOT_SELF_NAMES = {
    "nguyên bình thiên",
    "bình thiên nguyên",
    "notetaker bot",
    "adolf kimkim",
    "you",
    "bạn",
}

stop_requested = False


def _handle_stop_signal(signum, frame):
    global stop_requested
    stop_requested = True


signal.signal(signal.SIGINT, _handle_stop_signal)
signal.signal(signal.SIGTERM, _handle_stop_signal)


def setup_virtual_sink() -> str | None:
    """Create PulseAudio virtual_sink if it doesn't exist yet."""
    sinks = subprocess.run(
        ["pactl", "list", "short", "sinks"], capture_output=True, text=True
    ).stdout
    if SINK_NAME in sinks:
        return None
    res = subprocess.run(
        ["pactl", "load-module", "module-null-sink", f"sink_name={SINK_NAME}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout.strip()


def start_ffmpeg(output_path: Path) -> subprocess.Popen:
    """Record virtual_sink.monitor as a 16kHz mono WAV."""
    return subprocess.Popen(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-y",
            "-f",
            "pulse",
            "-i",
            f"{SINK_NAME}.monitor",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ],
        start_new_session=True,
    )


def stop_ffmpeg(proc: subprocess.Popen | None) -> None:
    """Gracefully stop FFmpeg with SIGINT so it writes the WAV header."""
    if not proc or proc.poll() is not None:
        return
    proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait()


def write_meta(job_dir: Path, data: dict) -> None:
    """Atomically write job status metadata to meta.json."""
    tmp = job_dir / "meta.json.tmp"
    target = job_dir / "meta.json"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(target)


# JavaScript snippet evaluated inside the Google Meet page to extract:
# 1. All participant names currently visible in tiles or captions
# 2. Currently active speaker(s) from speaking rings / sound bars / live captions
DOM_INSPECT_JS = """
() => {
  const ignore = new Set([
    'more_vert', 'mic_off', 'mic', 'videocam', 'videocam_off', 'visual_effects',
    'keep', 'push_pin', 'hand', 'front_hand', 'devices', 'frame_person', 'closed_caption'
  ]);
  const cleanName = (raw) => {
    if (!raw) return '';
    const line = raw.split('\\n').map(s => s.trim()).find(
      s => s && s.length > 1 && s.length < 60 && !ignore.has(s.toLowerCase())
    );
    return line || '';
  };

  const participants = new Set();
  const activeSpeakers = new Set();

  // 1. Inspect participant tiles ([data-participant-id])
  const tiles = document.querySelectorAll('[data-participant-id]');
  for (const tile of tiles) {
    let name = '';
    const nameEl = tile.querySelector('[data-self-name], .zWGUib, .dwSJ2e, [translate="no"]');
    if (nameEl) {
      name = cleanName(nameEl.textContent || nameEl.getAttribute('data-self-name'));
    }
    if (!name) {
      name = cleanName(tile.innerText);
    }
    if (!name) continue;
    participants.add(name);

    // Check if this participant tile has an active speaking indicator:
    // Meet animates voice bars (div elements with changing height/transform) when unmuted & speaking
    const isMuted = !!tile.querySelector('[data-is-muted="true"], [aria-label*="muted" i], [aria-label*="đã tắt" i]');
    if (!isMuted) {
      const bars = tile.querySelectorAll('.IisKdb, .v3p5qe, [jscontroller] > div[style*="height"], [class*="speaking" i]');
      for (const b of bars) {
        const st = window.getComputedStyle(b);
        const h = parseFloat(st.height || '0');
        if (h > 4.5 || (st.transform && st.transform !== 'none' && !st.transform.includes('0)'))) {
          activeSpeakers.add(name);
          break;
        }
      }
    }
  }

  // 2. Inspect live captions region (if captions are enabled)
  const capBlocks = document.querySelectorAll(
    '[role="region"][aria-label*="caption" i] > div, [role="region"][aria-label*="phụ đề" i] > div, .a4cQT > div, .iOzk7 > div'
  );
  if (capBlocks.length > 0) {
    const lastBlock = capBlocks[capBlocks.length - 1];
    const spkEl = lastBlock.querySelector('.NWpY1d, .zs7s8d, img + div, span');
    const spkName = cleanName(spkEl ? spkEl.textContent : '');
    if (spkName) {
      participants.add(spkName);
      activeSpeakers.add(spkName);
    }
  }

  return {
    participants: Array.from(participants),
    active: Array.from(activeSpeakers)
  };
}
"""


def is_clean_participant(name: str) -> bool:
    norm = name.strip().lower()
    if not norm or norm in BOT_SELF_NAMES:
        return False
    # Filter out generic UI strings
    bad_substrings = (
        "đang thuyết trình",
        "is presenting",
        "ghim",
        "bỏ ghim",
        "tắt tiếng",
        "máy ảnh",
        "camera",
        "microphone",
    )
    return not any(b in norm for b in bad_substrings)


def run_bot(meet_url: str, job_dir: Path) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    output_wav = job_dir / "audio.wav"

    meta = {
        "meet_url": meet_url,
        "status": "joining",
        "message": "Đang mở trình duyệt và vào Google Meet...",
        "elapsed_sec": 0,
        "participants": [],
        "speaker_timeline": [],
        "error": None,
    }
    write_meta(job_dir, meta)

    module_id = setup_virtual_sink()
    ffmpeg_proc = None

    try:
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(PROFILE_DIR),
                headless=False,
                no_viewport=True,
                env={**os.environ, "PULSE_SINK": SINK_NAME},
                permissions=["microphone", "camera"],
                args=[
                    "--no-sandbox",
                    "--window-size=1280,720",
                    "--use-fake-ui-for-media-stream",
                    "--autoplay-policy=no-user-gesture-required",
                ],
            )
            page = context.pages[0] if context.pages else context.new_page()

            try:
                page.goto(meet_url, wait_until="domcontentloaded")
                time.sleep(5)
                page.screenshot(path=str(job_dir / "step1_lobby.png"))

                # 1. Dismiss "Got it" / "Đã hiểu" popup if visible
                got_it = page.get_by_role("button", name=re.compile(r"^(Got it|Đã hiểu)$", re.I))
                if got_it.count() and got_it.first.is_visible():
                    got_it.first.click()
                    time.sleep(0.5)

                # 2. Type guest name only if not signed in
                name_input = page.get_by_label("Your name")
                try:
                    name_input.wait_for(state="visible", timeout=3500)
                    name_input.click()
                    time.sleep(0.3)
                    name_input.press_sequentially("Adolf KimKim Bot", delay=random.randint(60, 100))
                    time.sleep(0.8)
                except Exception:
                    pass

                # 3. Mute camera & mic
                page.keyboard.press("Control+e")
                time.sleep(0.4)
                page.keyboard.press("Control+d")
                time.sleep(0.6)

                # 4. Click "Ask to join" / "Join now"
                join_btn = page.get_by_role(
                    "button",
                    name=re.compile(r"Ask to join|Join now|Yêu cầu tham gia|Tham gia ngay", re.I),
                ).first
                join_btn.wait_for(state="visible", timeout=15000)
                join_btn.click()

                meta["status"] = "waiting_admission"
                meta["message"] = "Đã gửi yêu cầu tham gia — đang chờ chủ phòng duyệt..."
                write_meta(job_dir, meta)

                # 5. Wait until actually admitted into the call:
                # The red Leave Call button appears, AND the "Asking to be let in" waiting text is gone
                leave_btn = page.locator(
                    '[aria-label="Leave call"], [aria-label="Rời khỏi cuộc gọi"], button:has(i:text-is("call_end"))'
                ).first
                in_call_indicator = page.locator(
                    '[data-participant-id], '
                    '[aria-label*="captions" i], [aria-label*="phụ đề" i], '
                    '[aria-label*="people" i], [aria-label*="mọi người" i], '
                    '[aria-label*="chat" i], [aria-label*="trò chuyện" i], '
                    '[aria-label*="hand" i], [aria-label*="giơ tay" i]'
                ).first
                waiting_text = page.get_by_text(
                    re.compile(
                        r"Asking to be let in|when someone lets you in|"
                        r"Đang yêu cầu được tham gia|khi có người cho phép",
                        re.I,
                    )
                )

                admitted = False
                deadline = time.time() + 300  # Wait up to 5 minutes for host admission
                while time.time() < deadline and not stop_requested:
                    if leave_btn.is_visible():
                        is_waiting = waiting_text.count() > 0 and waiting_text.first.is_visible()
                        if not is_waiting and in_call_indicator.count() > 0:
                            admitted = True
                            break
                    time.sleep(1.0)

                if stop_requested:
                    meta["status"] = "stopped"
                    meta["message"] = "Đã huỷ trước khi vào phòng."
                    write_meta(job_dir, meta)
                    return

                if not admitted:
                    raise RuntimeError("Không được duyệt vào phòng họp (quá thời gian chờ 5 phút).")

                # 6. Admitted! Start FFmpeg immediately
                time.sleep(1.0)
                page.screenshot(path=str(job_dir / "step2_after_join.png"))
                ffmpeg_proc = start_ffmpeg(output_wav)
                record_start = time.time()

                # Try turning on Closed Captions ('c') to help identify active speakers
                try:
                    page.keyboard.press("c")
                except Exception:
                    pass

                meta["status"] = "recording"
                meta["message"] = "Đang ghi âm cuộc họp Google Meet..."
                write_meta(job_dir, meta)

                participants_seen: list[str] = []
                speaker_timeline: list[dict] = []
                last_caption_text = ""

                # 7. Poll call status, participants, and active speakers
                while not stop_requested and not page.is_closed() and leave_btn.is_visible():
                    elapsed = round(time.time() - record_start, 1)
                    meta["elapsed_sec"] = int(elapsed)

                    try:
                        info = page.evaluate(DOM_INSPECT_JS)
                        for p_name in info.get("participants", []):
                            if is_clean_participant(p_name) and p_name not in participants_seen:
                                participants_seen.append(p_name)

                        active_now = [
                            s for s in info.get("active", []) if is_clean_participant(s)
                        ]
                        if active_now:
                            speaker = active_now[0]
                            # Merge consecutive identical speaker samples within 1.2s
                            if (
                                speaker_timeline
                                and speaker_timeline[-1]["speaker"] == speaker
                                and elapsed - speaker_timeline[-1]["end"] <= 1.2
                            ):
                                speaker_timeline[-1]["end"] = elapsed
                            else:
                                speaker_timeline.append(
                                    {"start": elapsed, "end": elapsed + 0.5, "speaker": speaker}
                                )
                    except Exception:
                        pass

                    meta["participants"] = participants_seen
                    meta["speaker_timeline"] = speaker_timeline
                    write_meta(job_dir, meta)
                    time.sleep(0.5)

                # If stopped by user while still in call, click Leave Call cleanly
                if stop_requested and not page.is_closed() and leave_btn.is_visible():
                    try:
                        leave_btn.click(timeout=3000)
                        time.sleep(0.5)
                    except Exception:
                        pass

                meta["status"] = "recorded"
                meta["message"] = "Cuộc họp đã kết thúc, đang hoàn tất file âm thanh..."
                write_meta(job_dir, meta)

            except Exception as e:
                meta["status"] = "error"
                meta["error"] = str(e)
                meta["message"] = f"Lỗi bot: {e}"
                try:
                    page.screenshot(path=str(job_dir / "debug_error.png"))
                except Exception:
                    pass
                write_meta(job_dir, meta)
            finally:
                stop_ffmpeg(ffmpeg_proc)
                context.close()
    finally:
        if module_id:
            subprocess.run(
                ["pactl", "unload-module", module_id],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python meet_bot_worker.py <meet_url> <job_dir>")
        sys.exit(1)
    run_bot(sys.argv[1], Path(sys.argv[2]))
