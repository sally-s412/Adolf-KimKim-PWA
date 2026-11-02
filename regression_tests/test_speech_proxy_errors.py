import asyncio,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import transcription
class SpeechProxyTests(unittest.TestCase):
 def setUp(self):
  app=FastAPI();app.include_router(transcription.router);self.client=TestClient(app)
 def tearDown(self):self.client.close()
 def post(self,response=None,error=None):
  class Upstream:
   def __init__(self,*a,**kw):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*a):pass
   async def post(self,*a,**kw):
    if error:raise error
    return response
  with patch.object(transcription.httpx,"AsyncClient",Upstream):
   return self.client.post("/api/transcribe",files={"file":("clip.webm",b"audio","audio/webm")})
 def test_502_html_keeps_status_and_hides_html(self):
  r=self.post(httpx.Response(502,text="<!DOCTYPE html><script>secret diagnostic</script>"))
  self.assertEqual(r.status_code,502);self.assertNotIn("html",r.text);self.assertNotIn("secret diagnostic",r.text)
 def test_non_200_status_is_not_converted_to_500(self):
  for status in [400,413,429,503,504]:
   self.assertEqual(self.post(httpx.Response(status,text="private upstream")).status_code,status)
 def test_timeout_is_504(self):self.assertEqual(self.post(error=httpx.ReadTimeout("secret")).status_code,504)
 def test_connection_error_is_503_without_internal_port(self):
  r=self.post(error=httpx.ConnectError("localhost:2609"));self.assertEqual(r.status_code,503);self.assertNotIn("2609",r.text)
 def test_invalid_200_payload_is_safe_502(self):
  self.assertEqual(self.post(httpx.Response(200,text="<html>bad</html>")).status_code,502)
  self.assertEqual(self.post(httpx.Response(200,json={"status":"error","message":"<script>bad</script>"})).status_code,502)
 def test_success_is_unchanged(self):
  data={"segments":[{"speaker":"SPEAKER_00","start":0,"text":"hello"}]}
  self.assertEqual(self.post(httpx.Response(200,json=data)).json(),data)
 def test_meeting_failure_keeps_audio_and_safe_status(self):
  fake=types.ModuleType("routes.summary_service");fake.summarize_meeting=AsyncMock()
  with patch.dict(sys.modules,{"routes.summary_service":fake}):
   from routes import meet_bot
  with tempfile.TemporaryDirectory() as d:
   folder=Path(d);wav=folder/"audio.wav";wav.write_bytes(b"a"*100)
   meet_bot.JOBS["test"]={"job_dir":folder}
   class Upstream:
    def __init__(self,*a,**kw):pass
    async def __aenter__(self):return self
    async def __aexit__(self,*a):pass
    async def post(self,*a,**kw):return httpx.Response(502,text="<!DOCTYPE html>private diagnostic")
   with patch.object(meet_bot.httpx,"AsyncClient",Upstream):asyncio.run(meet_bot._post_process_job("test"))
   job=meet_bot.JOBS.pop("test");self.assertEqual(job["status"],"error");self.assertNotIn("html",job["message"]);self.assertNotIn("private",job["message"]);self.assertTrue(wav.exists())
if __name__=="__main__":unittest.main()
