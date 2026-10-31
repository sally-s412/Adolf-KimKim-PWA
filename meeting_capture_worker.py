"""Deployment adapter for the original Meet worker; AI/audio logic stays intact.

Lobby/after-join screenshots are optional diagnostics. A screenshot must never
prevent host admission or delay starting the original audio recorder.
"""
import os
import sys
from pathlib import Path


def install_screenshot_policy(page_class, enabled=False):
    original = page_class.screenshot

    def diagnostic_screenshot(page, *args, **kwargs):
        if not enabled:
            return None
        kwargs.update(timeout=2000, animations="disabled")
        try:
            return original(page, *args, **kwargs)
        except Exception:
            # No audio, participant or AI processing depends on these images.
            return None

    page_class.screenshot = diagnostic_screenshot
    return original


def main(meet_url, job_dir):
    from patchright.sync_api import Page
    from routes import meet_bot_worker

    original = install_screenshot_policy(
        Page, enabled=os.getenv("MEET_DEBUG_SCREENSHOTS") == "1"
    )
    original_profile = getattr(meet_bot_worker, "PROFILE_DIR", None)
    try:
        profile_path = os.getenv("MEET_GOOGLE_PROFILE_DIR", "").strip()
        if profile_path:
            profile = Path(profile_path).expanduser().resolve()
            if not profile.is_dir():
                raise RuntimeError("MEET_GOOGLE_PROFILE_DIR must be an existing private browser profile directory")
            # Use the operator's separately provisioned profile on this host.
            # This does not log in, copy cookies, or change meeting admission rules.
            meet_bot_worker.PROFILE_DIR = profile
        meet_bot_worker.run_bot(meet_url, job_dir)
    except Exception:
        # Startup can fail before the original worker enters its own try block.
        # Mark the job terminal instead of leaving the UI stuck at "joining".
        meet_bot_worker.write_meta(job_dir, {
            "status": "error",
            "message": "Không thể khởi động trình duyệt KimKim. Vui lòng thử lại.",
            "elapsed_sec": 0, "participants": [], "speaker_timeline": []
        })
        raise
    finally:
        Page.screenshot = original
        if original_profile is not None:
            meet_bot_worker.PROFILE_DIR = original_profile


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: meeting_capture_worker.py <meet_url> <job_dir>")
    main(sys.argv[1], Path(sys.argv[2]))
