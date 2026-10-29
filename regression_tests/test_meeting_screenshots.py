"""No browser or meeting is contacted by these worker regression tests."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('capture_runtime', ROOT / 'meeting_capture_worker.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class ScreenshotPolicy(unittest.TestCase):
    def test_default_skips_hanging_screenshot_and_continues_join(self):
        class Page:
            def screenshot(self, **kwargs):
                raise AssertionError('Optional screenshot should not run')
        original = runtime.install_screenshot_policy(Page)
        events = []
        page = Page()
        page.screenshot(path='lobby.png')
        events.append('request-admission')
        page.screenshot(path='joined.png')
        events.append('start-original-recorder')
        self.assertEqual(events, ['request-admission', 'start-original-recorder'])
        Page.screenshot = original

    def test_debug_timeout_is_bounded_and_nonfatal(self):
        observed = []
        class Page:
            def screenshot(self, **kwargs):
                observed.append(kwargs)
                raise TimeoutError('Page.screenshot: Timeout exceeded')
        runtime.install_screenshot_policy(Page, enabled=True)
        self.assertIsNone(Page().screenshot(path='lobby.png', timeout=30000))
        self.assertEqual(observed[0]['timeout'], 2000)
        self.assertEqual(observed[0]['animations'], 'disabled')

    def test_successful_debug_screenshot_returns_original_bytes(self):
        class Page:
            def screenshot(self, **kwargs):
                return b'png'
        runtime.install_screenshot_policy(Page, enabled=True)
        self.assertEqual(Page().screenshot(path='lobby.png'), b'png')

    def test_adapter_calls_original_worker_with_same_inputs_and_restores_page(self):
        class Page:
            def screenshot(self, **kwargs):
                return b'png'
        original = Page.screenshot
        run = Mock()
        worker = types.SimpleNamespace(run_bot=run, write_meta=Mock())
        modules = {'patchright': types.ModuleType('patchright'),
                   'patchright.sync_api': types.SimpleNamespace(Page=Page),
                   'routes': types.SimpleNamespace(meet_bot_worker=worker)}
        job_dir = Path('/tmp/mock-meeting-job')
        with patch.dict(sys.modules, modules):
            runtime.main('https://meet.google.com/abc-defg-hij', job_dir)
        run.assert_called_once_with('https://meet.google.com/abc-defg-hij', job_dir)
        self.assertIs(Page.screenshot, original)

    def test_startup_failure_marks_job_failed_and_restores_page(self):
        class Page:
            def screenshot(self, **kwargs):
                return b'png'
        original = Page.screenshot
        worker = types.SimpleNamespace(run_bot=Mock(side_effect=RuntimeError('browser failed')), write_meta=Mock())
        modules = {'patchright': types.ModuleType('patchright'),
                   'patchright.sync_api': types.SimpleNamespace(Page=Page),
                   'routes': types.SimpleNamespace(meet_bot_worker=worker)}
        with patch.dict(sys.modules, modules), self.assertRaises(RuntimeError):
            runtime.main('https://meet.google.com/abc-defg-hij', Path('/tmp/mock-job'))
        self.assertEqual(worker.write_meta.call_args.args[1]['status'], 'error')
        self.assertIs(Page.screenshot, original)


if __name__ == '__main__':
    unittest.main()
