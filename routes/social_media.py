"""Friends-only social images, authenticated delivery through an access-checked proxy."""
import asyncio,base64,hashlib,time
import httpx
from fastapi import APIRouter,HTTPException,Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from routes import profile_media as profile
from routes.chat_media import document,provider_upload,ID,MSG,string
router=APIRouter(prefix='/api/social-media',tags=['social-media'])
async def record(request,owner,post,client):
 if not ID.fullmatch(owner) or not MSG.fullmatch(post):raise HTTPException(404,'media/not-found')
 uid=await profile.authenticate(request)
 data=await document(client,f'communityProfiles/{owner}/posts/{post}',request.headers['authorization'][7:])
 return uid,data
@router.post('/{owner}/{post}')
async def upload(owner:str,post:str,request:Request):
 cloud,key,secret=profile.settings()
 async with httpx.AsyncClient(timeout=15) as client:uid,_=await record(request,owner,post,client)
 if uid!=owner:raise HTTPException(403,'media/not-a-member')
 profile.reserve_upload(uid);raw=bytearray()
 async with asyncio.timeout(15):
  async for chunk in request.stream():
   raw.extend(chunk)
   if len(raw)>profile.MAX_BYTES:raise HTTPException(413,'media/too-large')
 image=await run_in_threadpool(profile.normalize_image,bytes(raw),'chat')
 public_id=f'kimkim/social/{uid}/{post}'
 try:await provider_upload(cloud,key,secret,public_id,image)
 except httpx.HTTPError:raise HTTPException(502,'media/provider-unavailable')
 return {'mediaId':public_id}
@router.get('/{owner}/{post}')
async def read(owner:str,post:str,request:Request):
 cloud,_,secret=profile.settings()
 async with httpx.AsyncClient(timeout=25) as client:
  _,data=await record(request,owner,post,client)
  public_id=f'kimkim/social/{owner}/{post}'
  if string(data,'mediaId')!=public_id:raise HTTPException(404,'media/not-found')
  path=public_id+'.jpg';sig=base64.urlsafe_b64encode(hashlib.sha1((path+secret).encode()).digest()).decode()[:8]
  r=await client.get(f'https://res.cloudinary.com/{cloud}/image/authenticated/s--{sig}--/{path}')
  if r.status_code!=200:raise HTTPException(502,'media/provider-unavailable')
  return Response(r.content,media_type='image/jpeg',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
