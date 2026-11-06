"""Exercise the beta presentation layer without AI, Firebase or external calls."""
import ast
import os
import unittest
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


class SpeechErrors(unittest.TestCase):
    def setUp(self):
        source = ast.parse((Path(__file__).resolve().parents[1] / 'beta.py').read_text())
        function = next(node for node in source.body if isinstance(node, ast.AsyncFunctionDef) and node.name == 'beta_auth')
        function.decorator_list = []
        async def verify(fn, token):
            return {'sub': 'test-user'}
        namespace = {'Request': Request, 'JSONResponse': JSONResponse, 'os': os,
                     'run_in_threadpool': verify, 'verify_token': lambda token: None,
                     'consume_quota': lambda uid: True}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'beta.py', 'exec'), namespace)
        app = FastAPI()
        app.middleware('http')(namespace['beta_auth'])
        self.status = 503
        @app.post('/api/transcribe')
        async def transcribe():
            if self.status != 200:
                raise HTTPException(self.status, 'Legacy backend detail: port 2609')
            return {'segments': [{'speaker': 'SPEAKER_00', 'text': 'Tiếng Việt'}]}
        self.client = TestClient(app)

    def test_unavailable_does_not_expose_implementation_instructions(self):
        response = self.client.post('/api/transcribe', headers={'Authorization': 'Bearer test'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('back online', response.json()['detail'])
        self.assertNotIn('2609', response.text)

    def test_timeout_remains_504(self):
        self.status = 504
        response = self.client.post('/api/transcribe', headers={'Authorization': 'Bearer test'})
        self.assertEqual(response.status_code, 504)
        self.assertIn('timed out', response.text)

    def test_success_payload_is_untouched(self):
        self.status = 200
        response = self.client.post('/api/transcribe', headers={'Authorization': 'Bearer test'})
        self.assertEqual(response.json(), {'segments': [{'speaker': 'SPEAKER_00', 'text': 'Tiếng Việt'}]})

    def test_authentication_still_required(self):
        self.assertEqual(self.client.post('/api/transcribe').status_code, 401)


if __name__ == '__main__':
    unittest.main()
