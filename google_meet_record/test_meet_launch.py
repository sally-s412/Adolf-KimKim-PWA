import os
import re
import signal
import subprocess
import sys
import time
import random
from patchright.sync_api import sync_playwright

MEET_URL = sys.argv[1] if len(sys.argv) > 1 else "https://meet.google.com/uzb-dawb-xbw"
OUTPUT_WAV = sys.argv[2] if len(sys.argv) > 2 else "meeting_audio.wav"
SINK_NAME = "virtual_sink"


def setup_virtual_sink() -> str | None:
    """Create PulseAudio virtual_sink if it doesn't exist yet."""
    sinks = subprocess.run(["pactl", "list", "short", "sinks"], capture_output=True, text=True).stdout
    if SINK_NAME in sinks:
        return None
    res = subprocess.run(
        ["pactl", "load-module", "module-null-sink", f"sink_name={SINK_NAME}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout.strip()


def start_ffmpeg(output_path: str) -> subprocess.Popen:
    """Record virtual_sink.monitor as a 16kHz mono WAV."""
    return subprocess.Popen(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel", "warning",
            "-y",
            "-f", "pulse",
            "-i", f"{SINK_NAME}.monitor",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            output_path,
        ],
        start_new_session=True,
    )


def stop_ffmpeg(proc: subprocess.Popen | None) -> None:
    """Gracefully stop FFmpeg with SIGINT so it finalizes the WAV header."""
    if not proc or proc.poll() is not None:
        return
    print("[+] Stopping FFmpeg and finalizing WAV...")
    proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait()


module_id = setup_virtual_sink()
ffmpeg_proc = None

try:
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir="./meet_bot_profile",
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
            print(f"[+] Navigating to {MEET_URL}...")
            page.goto(MEET_URL, wait_until="domcontentloaded")
            time.sleep(5)

            page.screenshot(path="step1_lobby.png")
            print("[+] Saved step1_lobby.png")

            # 1. Dismiss "Got it" popup if visible
            got_it = page.get_by_role("button", name=re.compile(r"^(Got it|Đã hiểu)$", re.I))
            if got_it.count() and got_it.first.is_visible():
                got_it.first.click()
                time.sleep(0.5)

            # 2. Type a guest name only if Meet asks for one
            name_input = page.get_by_label("Your name")
            try:
                name_input.wait_for(state="visible", timeout=4000)
                print("[+] Guest mode detected, typing name...")
                name_input.click()
                time.sleep(0.3)
                name_input.press_sequentially("Notetaker Bot", delay=random.randint(60, 110))
                time.sleep(1)
            except Exception:
                print("[+] No name field — joining as the signed-in account.")

            # 3. Mute camera & mic
            print("[+] Muting mic and camera...")
            page.keyboard.press("Control+e")
            time.sleep(0.4)
            page.keyboard.press("Control+d")
            time.sleep(0.6)

            # 4. Click "Ask to join" / "Join now"
            print("[+] Clicking join button...")
            join_btn = page.get_by_role(
                "button",
                name=re.compile(r"Ask to join|Join now|Yêu cầu tham gia|Tham gia ngay", re.I),
            ).first
            join_btn.wait_for(state="visible", timeout=15000)
            join_btn.click()

            # 5. Wait to be admitted into the meeting (detect the "Leave call" button)
            print("[+] Waiting to be admitted into the meeting...")
            leave_btn = page.locator(
                '[aria-label="Leave call"], [aria-label="Rời khỏi cuộc gọi"], button:has(i:text-is("call_end"))'
            ).first
            leave_btn.wait_for(state="visible", timeout=300000)  # up to 5 min for host admission
            print("[+] Admitted! Starting audio recording...")
            page.screenshot(path="step2_after_join.png")

            # 6. Start FFmpeg recording the moment the bot is in the call
            ffmpeg_proc = start_ffmpeg(OUTPUT_WAV)
            print(f"[+] Recording meeting audio to {OUTPUT_WAV} (press Ctrl+C to stop early)...")

            # 7. Stay in the call until the meeting ends or the bot is removed
            while not page.is_closed() and leave_btn.is_visible():
                time.sleep(2)

            print("[+] Meeting ended.")

        except KeyboardInterrupt:
            print("\n[+] Interrupted by user.")
        except Exception as e:
            print(f"[!] Error: {e}")
            page.screenshot(path="debug_error.png")
            print("[!] Saved debug_error.png")
        finally:
            stop_ffmpeg(ffmpeg_proc)
            context.close()
finally:
    if module_id:
        subprocess.run(["pactl", "unload-module", module_id], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(OUTPUT_WAV):
        print(f"[+] Saved recording: {OUTPUT_WAV}")
