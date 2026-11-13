import asyncio, importlib.util, sys, types, tempfile, unittest, os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from pydantic import BaseModel
from fastapi.testclient import TestClient

root = Path(__file__).resolve().parent.parent
fake = types.ModuleType('routes.meet_bot')
class Join(BaseModel):
    meet_url: str
    title: str = ''
fake.JoinMeetRequest = Join
fake.JOBS = {}
fake.JOBS_DIR = Path(tempfile.mkdtemp())
fake.join_meet_endpoint = AsyncMock(return_value={'status':'ok','job_id':'abc123'})
fake.stop_meet_endpoint = AsyncMock(return_value={'status':'ok'})
routes = types.ModuleType('routes'); routes.meet_bot=fake
sys.modules['routes']=routes; sys.modules['routes.meet_bot']=fake
beta=types.ModuleType('beta'); beta.verify_token=lambda token: {'sub':token}
sys.modules['beta']=beta
spec=importlib.util.spec_from_file_location('capture',root/'meeting_server.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
client=TestClient(m.app)
class Checks(unittest.TestCase):
 def test_auth_required(self):
  self.assertEqual(client.post('/api/meet-bot/join',json={'meet_url':'https://meet.google.com/abc-defg-hij'}).status_code,401)
 def test_url_rejects_other_host(self):
  self.assertEqual(client.post('/api/meet-bot/join',headers={'Authorization':'Bearer alice'},json={'meet_url':'https://example.com/abc-defg-hij'}).status_code,400)
 def test_join_normalizes_and_preserves_title(self):
  r=client.post('/api/meet-bot/join',headers={'Authorization':'Bearer alice'},json={'meet_url':'meet.google.com/abc-defg-hij','title':'Họp thử'})
  self.assertEqual(r.status_code,200)
  arg=fake.join_meet_endpoint.call_args.args[0]
  self.assertEqual(arg.meet_url,'https://meet.google.com/abc-defg-hij');self.assertEqual(arg.title,'Họp thử')
 def test_other_user_cannot_stop(self):
  m.owners['owned']='alice'
  self.assertEqual(client.post('/api/meet-bot/stop/owned',headers={'Authorization':'Bearer bob'}).status_code,404)
 def test_capture_needs_no_ai_secret(self):
  self.assertTrue(client.get('/health').json()['meeting_configured'])
 def test_recording_transfers_to_original_processor(self):
  import httpx
  from unittest.mock import patch
  spec=importlib.util.spec_from_file_location('dispatch',root/'routes/meet_dispatch.py')
  d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
  fake.JOBS.clear()
  fake._post_process_job=AsyncMock()
  wav=b'RIFF'+b'0'*100
  def handle(req):
   self.assertEqual(req.headers['Authorization'],'Bearer alice')
   if '/audio/' in str(req.url): return httpx.Response(200,content=wav)
   return httpx.Response(200,json={'status':'recorded','title':'Họp thử','meta':{'elapsed_sec':10,'participants':['A']}})
  original=httpx.AsyncClient
  def factory(**kw): return original(transport=httpx.MockTransport(handle),**kw)
  async def run():
   req=SimpleNamespace(url=SimpleNamespace(path='/api/meet-bot/status/abc123'),state=SimpleNamespace(uid='alice'),method='GET',headers={'authorization':'Bearer alice'},body=AsyncMock(return_value=b''))
   with patch.dict(os.environ,{'MEET_WORKER_URL':'https://worker.example'}),patch.object(d.httpx,'AsyncClient',factory):
    response=await d.dispatch(req)
    await asyncio.sleep(0)
   self.assertEqual(response.status_code,200)
   self.assertEqual((fake.JOBS_DIR/'abc123'/'audio.wav').read_bytes(),wav)
   fake._post_process_job.assert_awaited_once_with('abc123')
  asyncio.run(run())
if __name__=='__main__': unittest.main()
