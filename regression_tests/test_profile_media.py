import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from routes import profile_media as media

class MediaTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(media.router)
        self.client = TestClient(self.app)
        media._recent.clear()
        self.env = patch.dict(os.environ, {'PROFILE_MEDIA_CLOUD_NAME':'test-cloud',
            'PROFILE_MEDIA_API_KEY':'test-key','PROFILE_MEDIA_API_SECRET':'test-secret'})
        self.env.start()
        self.auth = patch.object(media, 'verify_user', return_value='alice')
        self.auth.start()
    def tearDown(self):
        self.env.stop(); self.auth.stop(); self.client.close()
    def post(self, raw=b'bad', purpose='cover'):
        return self.client.post('/api/profile-media/'+purpose, content=raw,
            headers={'Authorization':'Bearer test-token','Content-Type':'image/jpeg'})
    def jpg(self):
        out=io.BytesIO(); Image.new('RGB',(32,32),'blue').save(out,'JPEG'); return out.getvalue()
    def test_missing_auth(self):
        self.assertEqual(self.client.post('/api/profile-media/cover').status_code,401)
    def test_expired_or_forged_auth(self):
        with patch.object(media,'verify_user',side_effect=ValueError):
            self.assertEqual(self.post().status_code,401)
    def test_not_configured_fails_without_provider_call(self):
        with patch.dict(os.environ,{'PROFILE_MEDIA_API_SECRET':''}), patch.object(media,'send_image',new_callable=AsyncMock) as send:
            self.assertEqual(self.post().json()['detail'],'media/not-configured'); send.assert_not_called()
    def test_only_profile_purposes(self):
        self.assertEqual(self.post(purpose='chat').status_code,404)
    def test_invalid_image_and_size(self):
        self.assertEqual(self.post().status_code,422); media._recent.clear()
        self.assertEqual(self.post(b'x'*(media.MAX_BYTES+1)).status_code,413)
    def test_owner_from_token_and_rate_limit(self):
        url='https://res.cloudinary.com/test-cloud/image/upload/v1/kimkim/covers/alice/cover.jpg'
        with patch.object(media,'send_image',new_callable=AsyncMock,return_value=url) as send:
            r=self.post(self.jpg()); self.assertEqual(r.json(),{'url':url})
            self.assertEqual(send.call_args.args[3:5],('alice','cover'))
            self.assertEqual(self.post(self.jpg()).status_code,429)
    def test_normalizer_reencodes_and_bounds_dimensions(self):
        out=io.BytesIO(); Image.new('RGB',(1000,1000)).save(out,'PNG')
        result=media.normalize_image(out.getvalue(),'avatar')
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.format,'JPEG'); self.assertEqual(image.size,(512,512))
    def test_token_rejects_wrong_issuer_and_path_uid(self):
        for claim in [{'sub':'../bob','iss':'https://securetoken.google.com/adolfkimkim','auth_time':0},
                      {'sub':'alice','iss':'https://other.example','auth_time':0}]:
            with patch.object(media.id_token,'verify_firebase_token',return_value=claim):
                with self.assertRaises(ValueError):
                    # test unpatched implementation
                    self.auth.stop()
                    try: media.verify_user('token')
                    finally: self.auth.start()

if __name__=='__main__': unittest.main()
