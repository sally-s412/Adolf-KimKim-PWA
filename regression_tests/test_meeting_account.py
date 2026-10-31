"""Profile selection and public errors; no Google login or meeting is contacted."""
import ast
import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('account_capture', ROOT / 'meeting_capture_worker.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
tree = ast.parse((ROOT / 'meeting_server.py').read_text())
public_function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'public_meta')
scope = {}
exec(compile(ast.Module(body=[public_function], type_ignores=[]), 'meeting_server.py', 'exec'), scope)
public_meta = scope['public_meta']


class MeetingAccount(unittest.TestCase):
    def modules(self, worker):
        class Page:
            def screenshot(self, **kwargs):
                return b'png'
        return {'patchright': types.ModuleType('patchright'),
                'patchright.sync_api': types.SimpleNamespace(Page=Page),
                'routes': types.SimpleNamespace(meet_bot_worker=worker)}

    def test_configured_profile_is_used_by_original_worker_and_restored(self):
        observed = []
        worker = types.SimpleNamespace(PROFILE_DIR=Path('/original'), write_meta=Mock())
        worker.run_bot = lambda url, directory: observed.append((worker.PROFILE_DIR, url, directory))
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(sys.modules, self.modules(worker)), patch.dict('os.environ', {'MEET_GOOGLE_PROFILE_DIR': directory}):
                runtime.main('https://meet.google.com/abc-defg-hij', Path('/tmp/job'))
            self.assertEqual(observed, [(Path(directory), 'https://meet.google.com/abc-defg-hij', Path('/tmp/job'))])
        self.assertEqual(worker.PROFILE_DIR, Path('/original'))

    def test_missing_configured_profile_fails_without_launching_anonymous_browser(self):
        worker = types.SimpleNamespace(PROFILE_DIR=Path('/original'), write_meta=Mock(), run_bot=Mock())
        with patch.dict(sys.modules, self.modules(worker)), patch.dict('os.environ', {'MEET_GOOGLE_PROFILE_DIR': '/nonexistent-kimkim-profile'}):
            with self.assertRaises(RuntimeError):
                runtime.main('https://meet.google.com/abc-defg-hij', Path('/tmp/job'))
        worker.run_bot.assert_not_called()
        self.assertEqual(worker.write_meta.call_args.args[1]['status'], 'error')
        self.assertEqual(worker.PROFILE_DIR, Path('/original'))

    def test_raw_browser_diagnostics_never_reach_public_response(self):
        original = {'status': 'error', 'message': 'Lỗi bot: Locator.count: Target page, context or browser has been closed Browser logs: /private/path', 'error': 'Target page, context or browser has been closed Browser logs: /private/path'}
        public = public_meta(original)
        self.assertEqual(public['error_code'], 'browser_closed')
        self.assertNotIn('error', public)
        self.assertNotIn('/private', str(public))
        self.assertIn('/private', original['error'])

    def test_host_admission_failure_is_distinguished_from_browser_crash(self):
        public = public_meta({'status': 'error', 'error': 'Không được duyệt vào phòng họp (quá thời gian chờ 5 phút).'})
        self.assertEqual(public['error_code'], 'admission_timeout')

    def test_unknown_failure_is_short_but_recording_status_remains_unchanged(self):
        public = public_meta({'status': 'error', 'message': 'technical-log' * 1000})
        self.assertLess(len(public['message']), 180)
        active = {'status': 'recording', 'message': 'Đang ghi âm', 'elapsed_sec': 5, 'participants': ['Person']}
        self.assertEqual(public_meta(active), active)


if __name__ == '__main__':
    unittest.main()
