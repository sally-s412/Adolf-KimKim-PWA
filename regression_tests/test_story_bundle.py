import base64,io,unittest,wave,json
from PIL import Image
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from routes import story_bundle as s

def uri(raw,mime):return 'data:'+mime+';base64,'+base64.b64encode(raw).decode()
def audio(channels=1,seconds=1):
 out=io.BytesIO()
 with wave.open(out,'wb') as w:
  w.setnchannels(channels);w.setsampwidth(2);w.setframerate(22050);w.writeframes(b'\0\0'*22050*channels*seconds)
 return uri(out.getvalue(),'audio/wav')
class CompositionTests(unittest.TestCase):
 def test_valid_audio_geometry_and_no_public_urls(self):
  m=s.validate_manifest({'version':1,'links':[{'kind':'mention','label':'@bob','uid':'bob','x':.5,'y':.5,'w':.2,'h':.1,'rotation':12}],'audio':{'name':'My track','src':audio()}})
  self.assertEqual(m['links'][0]['uid'],'bob');self.assertEqual(m['links'][0]['rotation'],12);self.assertEqual(m['duration'],15)
 def test_external_gif_and_nan_rejected(self):
  for row in [{'src':'https://external.test/a.gif','x':.5,'y':.5,'w':.2,'h':.2},{'src':'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','x':float('nan'),'y':.5,'w':.2,'h':.2}]:
   with self.assertRaises(HTTPException):s.validate_manifest({'version':1,'gifs':[row]})
 def test_stereo_and_overlong_audio_rejected(self):
  for src in [audio(channels=2),audio(seconds=16)]:
   with self.assertRaises(HTTPException):s.validate_manifest({'version':1,'audio':{'src':src}})
 def test_too_many_links_or_unknown_link_kind_rejected(self):
  for links in [[{}]*13,[{'kind':'url','label':'malicious'}]]:
   with self.assertRaises(HTTPException):s.validate_manifest({'version':1,'links':links})
class AccessTests(unittest.IsolatedAsyncioTestCase):
 async def test_friendship_denial_happens_before_provider_read(self):
  with patch.object(s.profile,'settings',return_value=('cloud','key','secret')),patch.object(s,'record',new_callable=AsyncMock,side_effect=HTTPException(403,'denied')):
   with self.assertRaises(HTTPException) as e:await s.read('alice','12345678901234567890',SimpleNamespace())
   self.assertEqual(e.exception.status_code,403)
 async def test_valid_story_uploads_both_private_effects_and_poster(self):
  poster=io.BytesIO();Image.new('RGB',(54,96)).save(poster,'JPEG')
  payload=json.dumps({'poster':uri(poster.getvalue(),'image/jpeg'),'manifest':{'version':1,'audio':{'name':'Track','src':audio()}}}).encode()
  async def stream():yield payload
  request=SimpleNamespace(stream=stream)
  doc={'kind':{'stringValue':'story'},'published':{'booleanValue':False}}
  with patch.object(s.profile,'settings',return_value=('cloud','key','secret')),patch.object(s.profile,'reserve_upload'),patch.object(s,'record',new_callable=AsyncMock,return_value=('alice',doc)),patch.object(s,'upload_manifest',new_callable=AsyncMock) as manifest,patch.object(s,'provider_upload',new_callable=AsyncMock) as poster_upload:
   result=await s.upload('alice','12345678901234567890',request)
   self.assertEqual(result['mediaId'],'kimkim/social/alice/12345678901234567890')
   self.assertEqual(manifest.call_args.args[3],'kimkim/social/alice/12345678901234567890.json')
   self.assertIn('audio',json.loads(manifest.call_args.args[4]));poster_upload.assert_awaited_once()
 async def test_only_owner_of_unpublished_story_can_upload(self):
  for uid,doc in [('bob',{'kind':{'stringValue':'story'},'published':{'booleanValue':False}}),('alice',{'kind':{'stringValue':'post'},'published':{'booleanValue':False}}),('alice',{'kind':{'stringValue':'story'},'published':{'booleanValue':True}})]:
   with patch.object(s.profile,'settings',return_value=('cloud','key','secret')),patch.object(s,'record',new_callable=AsyncMock,return_value=(uid,doc)),patch.object(s,'upload_manifest',new_callable=AsyncMock) as upload:
    with self.assertRaises(HTTPException) as e:await s.upload('alice','12345678901234567890',SimpleNamespace())
    self.assertEqual(e.exception.status_code,403);upload.assert_not_awaited()
if __name__=='__main__':unittest.main()
