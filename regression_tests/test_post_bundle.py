import base64,io,json,unittest
from PIL import Image
from fastapi import HTTPException
from unittest.mock import AsyncMock,patch
from types import SimpleNamespace
from routes import post_bundle as p

def image():
 out=io.BytesIO();Image.new('RGB',(16,16),'blue').save(out,'JPEG');return 'data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()
class AlbumTests(unittest.TestCase):
 def test_album_normalizes_five_photos(self):
  result=p.validate_images({'images':[image()]*5});self.assertEqual(result['kind'],'post');self.assertEqual(len(result['images']),5)
 def test_rejects_external_urls_empty_and_too_many(self):
  for payload in [{'images':[]},{'images':[image()]*6},{'images':['https://external.test/a.jpg']},{'images':'bad'}]:
   with self.assertRaises(HTTPException):p.validate_images(payload)
class AlbumAccessTests(unittest.IsolatedAsyncioTestCase):
 async def test_friendship_denial_precedes_provider_delivery(self):
  with patch.object(p.profile,'settings',return_value=('cloud','key','secret')),patch.object(p,'record',new_callable=AsyncMock,side_effect=HTTPException(403,'denied')):
   with self.assertRaises(HTTPException) as e:await p.read('alice','12345678901234567890',SimpleNamespace())
   self.assertEqual(e.exception.status_code,403)
 async def test_upload_requires_owned_unpublished_post(self):
  for uid,kind,published in [('bob','post',False),('alice','story',False),('alice','post',True)]:
   doc={'kind':{'stringValue':kind},'published':{'booleanValue':published}}
   with patch.object(p.profile,'settings',return_value=('cloud','key','secret')),patch.object(p,'record',new_callable=AsyncMock,return_value=(uid,doc)):
    with self.assertRaises(HTTPException) as e:await p.upload('alice','12345678901234567890',SimpleNamespace())
    self.assertEqual(e.exception.status_code,403)
 async def test_draft_stores_private_album_and_poster(self):
  async def stream():yield json.dumps({'images':[image(),image()]}).encode()
  doc={'kind':{'stringValue':'post'},'published':{'booleanValue':False}}
  with patch.object(p.profile,'settings',return_value=('cloud','key','secret')),patch.object(p.profile,'reserve_upload'),patch.object(p,'record',new_callable=AsyncMock,return_value=('alice',doc)),patch.object(p,'upload_manifest',new_callable=AsyncMock) as upload,patch.object(p,'provider_upload',new_callable=AsyncMock) as poster:
   result=await p.upload('alice','12345678901234567890',SimpleNamespace(stream=stream));self.assertEqual(result['mediaId'],'kimkim/social/alice/12345678901234567890');self.assertEqual(len(json.loads(upload.call_args.args[4])['images']),2);poster.assert_awaited_once()
