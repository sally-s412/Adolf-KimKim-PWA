import asyncio, json, sys, time, unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import summary_service as svc
from routes import long_context as lc

class ContextTests(unittest.TestCase):
 def test_unicode_chunks_preserve_every_character_and_bound_bytes(self):
  text=("Tiếng Việt: người nói thứ nhất. 日本語 🎧\n"*1000)
  chunks=lc.split_text(text)
  self.assertEqual("".join(chunks),text);self.assertTrue(all(len(c.encode())<=5000 for c in chunks))
 def test_retrieval_finds_end_of_meeting(self):
  text=("Unrelated opening discussion.\n"*1000)+"The Zephyr budget was approved for 12345 dollars."
  result=lc.relevant_context(text,"What is the Zephyr budget?")
  self.assertIn("12345",result);self.assertLessEqual(len(result.encode()),5000)
 def test_overview_detection_vi_en(self):
  for q in ["Nội dung chính của cuộc họp là gì?","Tóm tắt các quyết định","Main points?","What was discussed?"]:
   self.assertTrue(lc.overview_question(q),q)
 def test_notes_svg_has_valid_circle_radius(self):
  text=(Path(__file__).resolve().parents[1]/"frontend/notes-studio.js").read_text()
  self.assertNotIn("r=2/>",text);self.assertIn('r="2" />',text)

class PipelineTests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  svc._summary_cache.clear();lc.window.entries.clear()
 async def test_long_summary_processes_all_sections_and_final_merge(self):
  calls=[]
  async def model(prompt,*a):
   calls.append(prompt)
   return "Title: Meeting\nKey_Points: topic\nMain Summary:\nA short factual summary."
  text="FIRST_SENTINEL "+("a long discussion "*1400)+" LAST_SENTINEL"
  with patch.object(svc,"_model_call",side_effect=model):
   result=await svc.summarize_meeting([{"speaker":"A","text":text}])
  self.assertGreater(len(calls),2);self.assertTrue(any("FIRST_SENTINEL" in p for p in calls));self.assertTrue(any("LAST_SENTINEL" in p for p in calls))
  self.assertTrue(all(lc.estimate_tokens(p)+800<6000 for p in calls));self.assertEqual(result["title"],"Meeting")
 async def test_provider_413_splits_smaller_instead_of_repeating_oversized_request(self):
  calls=[]
  async def model(prompt,*a):
   calls.append(prompt)
   if len(calls)==1:raise lc.AIServiceError(413)
   return "Title: Small\nKey_Points: topic\nMain Summary:\nShort."
  with patch.object(svc,"_model_call",side_effect=model):
   result=await svc.summarize_meeting([{"text":"x"*4000}])
  self.assertEqual(result["title"],"Small");self.assertGreater(len(calls),2);self.assertLess(len(calls[1]),len(calls[0]))
 async def test_specific_question_uses_matching_tail_not_whole_transcript(self):
  model=AsyncMock(return_value="12345")
  with patch.object(svc,"_model_call",model):
   result=await svc.answer_meeting_question("Zephyr budget?",[{"text":"opening "*3000},{"text":"Zephyr budget is 12345"}])
  self.assertEqual(result,"12345");prompt=model.call_args.args[0];self.assertIn("12345",prompt);self.assertLess(len(prompt.encode()),7000)
 async def test_overview_uses_summary_of_entire_transcript(self):
  summarize=AsyncMock(return_value={"summary":"ALL_SECTIONS_OVERVIEW"})
  with patch.object(svc,"summarize_meeting",summarize),patch.object(svc,"_model_call",AsyncMock(return_value="answer")) as model:
   await svc.answer_meeting_question("Nội dung chính là gì?",[{"text":"content "*2000}])
  summarize.assert_awaited_once();self.assertIn("ALL_SECTIONS_OVERVIEW",model.call_args.args[0])
 async def test_summary_cache_avoids_repeating_model_calls(self):
  model=AsyncMock(return_value="Title: Cached\nMain Summary:\nSummary")
  with patch.object(svc,"_model_call",model):
   await svc.summarize_meeting([{"text":"hello"}]);await svc.summarize_meeting([{"text":"hello"}])
  self.assertEqual(model.await_count,1)
 async def test_friendly_error_does_not_claim_disconnected_or_expose_raw_provider(self):
  self.assertNotIn("Groq",str(lc.AIServiceError(413)));self.assertNotIn("không thể kết nối",str(lc.AIServiceError(413)))
 async def test_rate_window_waits_for_quota_instead_of_bursting(self):
  clock=[10.0];window=lc.TokenWindow();window.entries.append([0,5000])
  async def sleep(delay):clock[0]+=delay
  with patch.object(lc.time,"monotonic",side_effect=lambda:clock[0]),patch.object(lc.asyncio,"sleep",side_effect=sleep):
   await window.reserve(3000)
  self.assertGreaterEqual(clock[0],61);self.assertEqual(sum(n for _,n in window.entries),3000)
 async def test_model_endpoint_and_parameters_unchanged_usage_is_accounted(self):
  sent=[]
  class Client:
   def __init__(self,*a,**kw):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*a):pass
   async def post(self,url,**kw):
    sent.append((url,kw));return httpx.Response(200,json={"choices":[{"message":{"content":"ok"}}],"usage":{"total_tokens":123}})
  with patch.object(svc.httpx,"AsyncClient",Client):
   result=await svc._model_call("small prompt",.3,800)
  self.assertEqual(result,"ok");self.assertEqual(sent[0][0],svc.GROQ_URL);self.assertEqual(sent[0][1]["json"]["model"],svc.MODEL);self.assertEqual(lc.window.entries[-1][1],123)

class JobTests(unittest.TestCase):
 def test_jobs_are_owner_scoped_and_success_contract_compatible(self):
  from routes import analysis_jobs as jobs
  app=FastAPI();app.include_router(jobs.router);jobs.JOBS.clear()
  with patch.object(jobs,"authenticate",AsyncMock(return_value="alice")),patch.object(jobs,"summarize_meeting",AsyncMock(return_value={"title":"Test","summary":"Done","key_points":[]})):
   with TestClient(app) as client:
    request={"kind":"summary","transcript":[{"text":"hello"}]}
    started=client.post("/api/analysis-jobs",json=request);self.assertEqual(started.status_code,202)
    key=started.json()["job_id"]
    for _ in range(10):
     response=client.get("/api/analysis-jobs/"+key)
     if response.json()["status"]=="done":break
    self.assertEqual(response.json()["result"]["status"],"ok");self.assertNotIn("uid",response.text)
    with patch.object(jobs,"authenticate",AsyncMock(return_value="bob")):
     self.assertEqual(client.get("/api/analysis-jobs/"+key).status_code,404)
 def test_empty_or_invalid_transcript_is_rejected(self):
  from routes import analysis_jobs as jobs
  app=FastAPI();app.include_router(jobs.router)
  with patch.object(jobs,"authenticate",AsyncMock(return_value="alice")),TestClient(app) as client:
   self.assertEqual(client.post("/api/analysis-jobs",json={"kind":"summary","transcript":[]}).status_code,422)
if __name__=="__main__":unittest.main()
