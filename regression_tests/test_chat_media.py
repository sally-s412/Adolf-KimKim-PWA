import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from routes import chat_media as media

class ChatMediaTests(unittest.TestCase):
 def setUp(self):
  app=FastAPI();app.include_router(media.router);self.client=TestClient(app);media.profile._recent.clear()
  self.env=patch.dict(os.environ,{'PROFILE_MEDIA_CLOUD_NAME':'my-cloud','PROFILE_MEDIA_API_KEY':'test','PROFILE_MEDIA_API_SECRET':'test'});self.env.start()
 def tearDown(self):self.env.stop();self.client.close()
 def jpg(self):
  b=io.BytesIO();Image.new('RGB',(8,8)).save(b,'JPEG');return b.getvalue()
 def test_member_bound_upload_returns_id_never_public_url(self):
  mid='12345678901234567890'
  with patch.object(media,'authorize',new_callable=AsyncMock,return_value=('alice','token')),patch.object(media,'provider_upload',new_callable=AsyncMock) as upload:
   response=self.client.post('/api/chat-media/alice~bob/'+mid,content=self.jpg(),headers={'Content-Type':'image/jpeg'})
   self.assertEqual(response.json(),{'mediaId':'kimkim/messages/alice~bob/alice/'+mid})
   self.assertEqual(upload.call_args.args[3],'kimkim/messages/alice~bob/alice/'+mid)
 def test_non_member_cannot_read_or_upload(self):
  with patch.object(media,'authorize',new_callable=AsyncMock,side_effect=HTTPException(403,'media/not-a-member')),patch.object(media,'provider_upload',new_callable=AsyncMock) as upload:
   self.assertEqual(self.client.get('/api/chat-media/alice~bob/12345678901234567890').status_code,403)
   self.assertEqual(self.client.post('/api/chat-media/alice~bob/12345678901234567890',content=self.jpg(),headers={'Content-Type':'image/jpeg'}).status_code,403)
   upload.assert_not_called()
 def test_bad_message_id_rejected_before_upload(self):
  self.assertEqual(self.client.post('/api/chat-media/alice~bob/bad').status_code,422)
 def test_signed_delivery_is_not_returned_to_browser(self):
  class FakeResponse:
   status_code=200
   content=b'jpeg-test'
  class Client:
   async def __aenter__(self):return self
   async def __aexit__(self,*args):pass
   async def get(self,url):
    assert '/image/authenticated/s--' in url
    return FakeResponse()
  record={'senderId':{'stringValue':'alice'},'mediaId':{'stringValue':'kimkim/messages/alice~bob/alice/12345678901234567890'}}
  with patch.object(media,'authorize',new_callable=AsyncMock,return_value=('bob','token')),patch.object(media,'document',new_callable=AsyncMock,return_value=record),patch.object(media.httpx,'AsyncClient',return_value=Client()):
   response=self.client.get('/api/chat-media/alice~bob/12345678901234567890')
   self.assertEqual(response.content,b'jpeg-test');self.assertEqual(response.headers['cache-control'],'private, no-store');self.assertEqual(response.headers['content-type'],'image/jpeg')
 def test_forged_media_path_never_fetched(self):
  record={'senderId':{'stringValue':'alice'},'mediaId':{'stringValue':'https://evil.example'}}
  with patch.object(media,'authorize',new_callable=AsyncMock,return_value=('bob','token')),patch.object(media,'document',new_callable=AsyncMock,return_value=record):
   self.assertEqual(self.client.get('/api/chat-media/alice~bob/12345678901234567890').status_code,404)

if __name__=='__main__':unittest.main()
