import json
import os
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.auth import crypt, jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from datetime import datetime, timedelta, timezone
import beta


class BetaTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(beta.app)
        beta._buckets.clear()

    def test_public_shell_and_health(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertIn('design-system.css', self.client.get('/').text)

    def test_all_backend_routes_require_login(self):
        for path in ('/api/chat', '/api/global-chat', '/api/summarize', '/api/mindmap', '/api/powerpoint', '/api/visualization', '/api/transcribe', '/transcribe', '/api/meet-bot/status/test'):
            self.assertEqual(self.client.post(path).status_code, 401, path)

    def test_invalid_token_is_rejected(self):
        with patch('beta.verify_token', side_effect=ValueError('invalid')):
            self.assertEqual(self.client.post('/api/chat', headers={'Authorization': 'Bearer invalid'}).status_code, 401)

    def test_auth_wrapper_preserves_ai_payload_and_response(self):
        from unittest.mock import AsyncMock
        payload = {'transcript': [{'speaker': 'Sally', 'text': 'Keep output intact', 'start': 0}]}
        engine_output = {'title': 'Engineer title', 'key_points': ['Exact'], 'summary': 'Original output'}
        engine = AsyncMock(return_value=engine_output)
        with patch('beta.verify_token', return_value={'sub': 'tester'}), patch('app.summarize_meeting', engine):
            response = self.client.post('/api/summarize', json=payload, headers={'Authorization': 'Bearer token'})
        self.assertEqual(response.json(), {'status': 'ok', **engine_output})
        engine.assert_awaited_once_with(payload['transcript'])

    def test_unavailable_meeting_worker_is_explicit(self):
        with patch('beta.verify_token', return_value={'sub': 'tester'}):
            self.assertEqual(self.client.post('/api/meet-bot/join', json={}, headers={'Authorization': 'Bearer token'}).status_code, 503)

    def test_authenticated_pptx_export_and_burst_limit(self):
        with patch('beta.verify_token', return_value={'sub': 'tester'}):
            response = self.client.post('/api/powerpoint', json={'title': 'Beta', 'summary': 'Verified export'}, headers={'Authorization': 'Bearer token'})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.content.startswith(b'PK'))
        beta._buckets.clear()
        for _ in range(beta.USER_RPM):
            self.assertTrue(beta.consume_quota('tester'))
        self.assertFalse(beta.consume_quota('tester'))
        self.assertTrue(beta.consume_quota('another-user'))

    def test_signed_firebase_claims(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'test')])
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(1).not_valid_before(datetime.now(timezone.utc)-timedelta(days=1))
                .not_valid_after(datetime.now(timezone.utc)+timedelta(days=1)).sign(key, hashes.SHA256()))
        pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        signer = crypt.RSASigner.from_string(pem, key_id='test')
        claims = {'iss': f'https://securetoken.google.com/{beta.PROJECT}', 'aud': beta.PROJECT, 'sub': 'tester', 'iat': int(time.time()), 'exp': int(time.time())+3600, 'auth_time': int(time.time())}
        class CertResponse:
            status = 200
            data = json.dumps({'test': cert.public_bytes(serialization.Encoding.PEM).decode()}).encode()
        with patch('beta.CERT_REQUEST', return_value=CertResponse()):
            self.assertEqual(beta.verify_token(jwt.encode(signer, claims).decode())['sub'], 'tester')
            for change in ({'aud': 'other-project'}, {'iss': 'https://attacker.example'}, {'sub': ''}, {'exp': int(time.time())-3600}, {'auth_time': int(time.time())+3600}):
                with self.assertRaises(ValueError):
                    beta.verify_token(jwt.encode(signer, {**claims, **change}).decode())

if __name__ == '__main__':
    unittest.main()
