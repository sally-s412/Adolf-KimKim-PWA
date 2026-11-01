"""Private photo albums. Existing post draft and friend Rules authorize every request."""
import asyncio,base64,hashlib,json
from urllib.parse import quote
import httpx
from fastapi import APIRouter,HTTPException,Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from routes import profile_media as profile
from routes.social_media import record
from routes.chat_media import string,provider_upload
from routes.story_bundle import data_bytes,upload_manifest
router=APIRouter(prefix='/api/post-media',tags=['post-media'])
MAX_BUNDLE=7_000_000

def validate_images(payload):
 if not isinstance(payload,dict) or not isinstance(payload.get('images'),list) or not 1<=len(payload['images'])<=5:raise HTTPException(400,'post/invalid-album')
 images=[]
 for value in payload['images']:
  raw=data_bytes(value,'image/jpeg',profile.MAX_BYTES)
  clean=profile.normalize_image(raw,'chat')
  images.append('data:image/jpeg;base64,'+base64.b64encode(clean).decode())
 return {'version':1,'kind':'post','images':images}

@router.post('/{owner}/{post}')
async def upload(owner:str,post:str,request:Request):
 cloud,key,secret=profile.settings()
 try:
  async with httpx.AsyncClient(timeout=15) as client:uid,doc=await record(request,owner,post,client)
  if uid!=owner or string(doc,'kind')!='post' or doc.get('published',{}).get('booleanValue') is not False:raise HTTPException(403,'post/not-owner-draft')
  raw=bytearray()
  async with asyncio.timeout(20):
   async for chunk in request.stream():
    raw.extend(chunk)
    if len(raw)>MAX_BUNDLE:raise HTTPException(413,'post/too-large')
  try:payload=json.loads(raw)
  except (ValueError,UnicodeDecodeError):raise HTTPException(400,'post/invalid-album')
  manifest=await run_in_threadpool(validate_images,payload)
  profile.reserve_upload(uid)
  public_id=f'kimkim/social/{uid}/{post}'
  async with asyncio.timeout(65):
   await upload_manifest(cloud,key,secret,public_id+'.json',json.dumps(manifest,separators=(',',':')).encode())
   await provider_upload(cloud,key,secret,public_id,data_bytes(manifest['images'][0],'image/jpeg',profile.MAX_BYTES))
  return {'mediaId':public_id}
 except (TimeoutError,httpx.TimeoutException):raise HTTPException(504,'post/upload-timeout')
 except httpx.HTTPError:raise HTTPException(502,'post/provider-unavailable')

@router.get('/{owner}/{post}')
async def read(owner:str,post:str,request:Request):
 cloud,_,secret=profile.settings()
 try:
  async with httpx.AsyncClient(timeout=25) as client:
   _,doc=await record(request,owner,post,client)
   public_id=f'kimkim/social/{owner}/{post}'
   if string(doc,'kind')!='post' or string(doc,'mediaId')!=public_id:raise HTTPException(404,'post/not-found')
   path=public_id+'.json';sig=base64.urlsafe_b64encode(hashlib.sha1((path+secret).encode()).digest()).decode()[:8]
   async with client.stream('GET',f'https://res.cloudinary.com/{cloud}/raw/authenticated/s--{sig}--/{quote(path,safe="/")}') as response:
    if response.status_code==404:raise HTTPException(404,'post/legacy-photo')
    if response.status_code!=200:raise HTTPException(502,'post/provider-unavailable')
    raw=bytearray()
    async for chunk in response.aiter_bytes():
     raw.extend(chunk)
     if len(raw)>MAX_BUNDLE:raise HTTPException(502,'post/provider-unavailable')
   return Response(bytes(raw),media_type='application/json',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
 except httpx.HTTPError:raise HTTPException(502,'post/provider-unavailable')
