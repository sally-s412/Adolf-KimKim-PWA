import sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from routes import social_media as media
class SocialMediaTests(unittest.IsolatedAsyncioTestCase):
 async def test_denied_firestore_access_never_grants_image_access(self):
  request=SimpleNamespace(headers={'authorization':'Bearer token'})
  with patch.object(media.profile,'authenticate',new_callable=AsyncMock,return_value='stranger'),patch.object(media,'document',new_callable=AsyncMock,side_effect=HTTPException(403,'media/not-a-member')):
   with self.assertRaises(HTTPException) as result:await media.record(request,'alice','12345678901234567890',None)
   self.assertEqual(result.exception.status_code,403)
 async def test_owner_and_post_path_forwarded_with_callers_token(self):
  request=SimpleNamespace(headers={'authorization':'Bearer bob-token'})
  with patch.object(media.profile,'authenticate',new_callable=AsyncMock,return_value='bob'),patch.object(media,'document',new_callable=AsyncMock,return_value={'published':True}) as doc:
   uid,_=await media.record(request,'alice','12345678901234567890',None)
   self.assertEqual(uid,'bob');self.assertEqual(doc.call_args.args[1],'communityProfiles/alice/posts/12345678901234567890');self.assertEqual(doc.call_args.args[2],'bob-token')
if __name__=='__main__':unittest.main()
