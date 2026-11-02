import os, sys, time, unittest, json, logging
from pathlib import Path
from unittest.mock import patch, AsyncMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import google_calendar as gc

ENV={"GOOGLE_CALENDAR_CLIENT_ID":"test.apps.googleusercontent.com",
"GOOGLE_CALENDAR_CLIENT_SECRET":"not-a-real-secret","GOOGLE_CALENDAR_REDIRECT_URI":"https://api.example.test/api/google-calendar/callback",
"GOOGLE_CALENDAR_FRONTEND_ORIGIN":"https://app.example.test","GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY":"test-only-random-encryption-key-32-characters"}
class CalendarTests(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,ENV);self.env.start()
  app=FastAPI();app.include_router(gc.router);self.client=TestClient(app)
  self.auth=patch.object(gc,"identity",AsyncMock(return_value=("alice","Bearer firebase-test")));self.auth.start()
 def tearDown(self):self.client.close();self.auth.stop();self.env.stop()
 def state(self,uid="alice",expires=None):
  return gc.seal({"kind":"calendar-flow","uid":uid,"verifier":"pkce","expires":expires or time.time()+600})
 def test_start_contains_offline_pkce_and_scopes(self):
  data=self.client.post("/api/google-calendar/start").json()
  self.assertIn("access_type=offline",data["url"]);self.assertIn("code_challenge_method=S256",data["url"])
  self.assertEqual(gc.state_data(data["state"])["uid"],"alice")
  self.assertNotIn("firebase-test",json.dumps(data));self.assertNotIn(ENV["GOOGLE_CALENDAR_CLIENT_SECRET"],json.dumps(data))
 def test_callback_rejects_tampered_state(self):
  self.assertEqual(self.client.get("/api/google-calendar/callback?state=bad").status_code,400)
 def test_expired_and_cross_user_state_are_rejected(self):
  self.assertEqual(self.client.post("/api/google-calendar/exchange",json={"state":self.state(expires=time.time()-1),"code":"x"}).status_code,400)
  self.assertEqual(self.client.post("/api/google-calendar/exchange",json={"state":self.state("bob"),"code":"x"}).status_code,403)
 def test_callback_has_no_store_and_no_script_injection(self):
  r=self.client.get("/api/google-calendar/callback",params={"state":self.state(),"code":"</script><script>bad()"})
  self.assertEqual(r.status_code,200);self.assertNotIn("</script><script>bad()",r.text)
  self.assertIn("frame-ancestors 'none'",r.headers["content-security-policy"]);self.assertEqual(r.headers["cache-control"],"no-store")
 def test_refresh_is_saved_encrypted_and_no_tokens_in_status(self):
  record={"refresh_token":"refresh-private","expires":0,"email":"calendar@example.test"}
  async def doc(*args):return record
  with patch.object(gc,"document",AsyncMock(side_effect=doc)) as save,patch.object(gc,"google_token",AsyncMock(return_value={"access_token":"access-private","expires_in":3600})):
   r=self.client.get("/api/google-calendar/status");self.assertEqual(r.status_code,200);self.assertTrue(r.json()["connected"])
   self.assertNotIn("private",r.text);self.assertTrue(any(c.args[2:3]==("PATCH",) for c in save.call_args_list))
 def test_revoked_token_returns_reconnect(self):
  with patch.object(gc,"document",AsyncMock(return_value={"refresh_token":"x","expires":0})),patch.object(gc,"google_token",AsyncMock(side_effect=gc.HTTPException(409,"calendar/reconnect-required"))):
   self.assertEqual(self.client.get("/api/google-calendar/status").json(),{"connected":False,"reconnect":True})
 def test_ciphertext_cannot_be_read_or_tampered(self):
  sealed=gc.seal({"refresh_token":"private"});self.assertNotIn("private",sealed)
  self.assertEqual(gc.unseal(sealed)["refresh_token"],"private")
  with self.assertRaises(gc.HTTPException):gc.unseal(sealed[:-5]+"aaaaa")
 def test_exchange_stores_refresh_token_and_returns_email_only(self):
  token={"refresh_token":"r-private","access_token":"a-private","expires_in":3600,"scope":gc.SCOPE}
  class Client:
   def __init__(self,**kwargs):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*a):pass
   async def get(self,*a,**kw):
    import httpx
    return httpx.Response(200,json={"email":"other@example.test","email_verified":True})
  with patch.object(gc,"google_token",AsyncMock(return_value=token)),patch.object(gc,"document",AsyncMock()) as save,patch.object(gc.httpx,"AsyncClient",Client):
   r=self.client.post("/api/google-calendar/exchange",json={"code":"code","state":self.state()})
   self.assertEqual(r.json(),{"connected":True,"email":"other@example.test"});self.assertNotIn("private",r.text)
   self.assertEqual(save.call_args.args[0],"alice")
 def test_missing_calendar_scope_is_not_saved(self):
  with patch.object(gc,"google_token",AsyncMock(return_value={"scope":"email","refresh_token":"r"})),patch.object(gc,"document",AsyncMock()) as save:
   self.assertEqual(self.client.post("/api/google-calendar/exchange",json={"code":"x","state":self.state()}).status_code,403);save.assert_not_called()
 def test_missing_configuration_fails_closed(self):
  with patch.dict(os.environ,{"GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY":""}):
   r=self.client.get("/api/google-calendar/status");self.assertEqual(r.status_code,503);self.assertIn("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",r.text)
 def test_firestore_payload_contains_only_ciphertext(self):
  requests=[]
  class Client:
   async def __aenter__(self):return self
   async def __aexit__(self,*a):pass
   async def request(self,method,url,**kwargs):
    import httpx
    requests.append((method,url,kwargs))
    return httpx.Response(200,json=kwargs["json"])
  import asyncio
  with patch.object(gc.httpx,"AsyncClient",Client):
   result=asyncio.run(gc.document("alice","Bearer test","PATCH",{"refresh_token":"never-plaintext"}))
  self.assertEqual(result["refresh_token"],"never-plaintext")
  self.assertNotIn("never-plaintext",json.dumps(requests));self.assertIn("/users/alice/integrations/googleCalendar",requests[0][1])
 def test_callback_access_log_redacts_query(self):
  r=logging.LogRecord("uvicorn.access",20,"",0,"%s - %s %s %s %s",("ip","GET","/api/google-calendar/callback?code=private","1.1",200),None)
  gc.RedactCalendarCallback().filter(r);self.assertNotIn("private",r.getMessage())

 def test_event_proxy_only_targets_primary_calendar_and_preserves_etag(self):
  sent=[]
  class Client:
   def __init__(self,**kw):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*a):pass
   async def request(self,method,url,**kw):
    import httpx
    sent.append((method,url,kw));return httpx.Response(200,json={"id":"event123"})
  with patch.object(gc,"connection_token",AsyncMock(return_value="google-private")),patch.object(gc.httpx,"AsyncClient",Client):
   r=self.client.patch("/api/google-calendar/events/event123?conferenceDataVersion=1&sendUpdates=all",json={"summary":"Title","attendees":[{"email":"somebody@example.test"}]},headers={"If-Match":"etag1"})
  self.assertEqual(r.status_code,200);method,url,kw=sent[0]
  self.assertEqual(url,gc.GOOGLE_EVENTS+"/event123");self.assertNotIn("sendUpdates",kw["params"])
  self.assertNotIn("attendees",kw["json"]);self.assertEqual(kw["headers"]["If-Match"],"etag1")
 def test_missing_auth_is_rejected(self):
  with patch.object(gc,"identity",side_effect=gc.HTTPException(401,"sign-in")):
   self.assertEqual(self.client.get("/api/google-calendar/status").status_code,401)
 def test_beta_exempts_only_get_callback(self):
  import importlib.util,types
  app=FastAPI()
  @app.get("/api/google-calendar/callback")
  async def cb():return {"ok":True}
  fake=types.ModuleType("app");fake.app=app
  with patch.dict(sys.modules,{"app":fake}):
   spec=importlib.util.spec_from_file_location("beta_calendar_test",Path(__file__).resolve().parents[1]/"beta.py")
   mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  with TestClient(app) as c:
   self.assertEqual(c.get("/api/google-calendar/callback?state=x").status_code,200)
   self.assertEqual(c.post("/api/google-calendar/callback").status_code,401)
   self.assertEqual(c.get("/api/google-calendar/status").status_code,401)

if __name__=="__main__":unittest.main()
