"""Authenticated chat images. Delivery proxy enforces Firestore membership every time."""
import asyncio
import base64
import hashlib
import io
import os
import re
import time
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from routes import profile_media as profile

router=APIRouter(prefix='/api/chat-media',tags=['chat-media'])
ID=re.compile(r'^[a-zA-Z0-9_~-]{1,280}$')
MSG=re.compile(r'^[a-zA-Z0-9-]{20,80}$')

async def document(client,path,token,optional=False):
    project=os.getenv('FIREBASE_PROJECT_ID','adolfkimkim')
    response=await client.get(f'https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{path}',headers={'Authorization':'Bearer '+token})
    if response.status_code==404 and optional:return None
    if response.status_code in (403,404):raise HTTPException(403,'media/not-a-member')
    if response.status_code!=200:raise HTTPException(503,'media/auth-unavailable')
    return response.json().get('fields',{})

def string(data,key):return data.get(key,{}).get('stringValue','')
def members(data):return [x.get('stringValue','') for x in data.get('members',{}).get('arrayValue',{}).get('values',[])]

async def authorize(client,request,thread,writing=False):
    if not ID.fullmatch(thread):raise HTTPException(404,'media/not-found')
    uid=await profile.authenticate(request)
    token=request.headers['authorization'][7:]
    data=await document(client,'communityThreads/'+thread,token)
    people=members(data)
    if uid not in people or not 2<=len(people)<=4:raise HTTPException(403,'media/not-a-member')
    if writing:
        # Firestore rules can read only the caller's block list. Reverse block is
        # enforced again at message commit, and on the other member's auth reads.
        for other in people:
            if other==uid:continue
            blocked=await document(client,f'communityBlocks/{uid}/targets/{other}',token,True)
            if blocked is not None:raise HTTPException(403,'media/blocked')
        if string(data,'type')!='group':
            connection=await document(client,'communityConnections/'+thread,token)
            if string(connection,'status')!='accepted':raise HTTPException(403,'media/not-a-member')
    return uid,token

async def provider_upload(cloud,key,secret,public_id,raw):
    params={'public_id':public_id,'timestamp':str(int(time.time())),'type':'authenticated','overwrite':'false','backup':'false'}
    canonical='&'.join(f'{k}={v}' for k,v in sorted(params.items()))
    signature=hashlib.sha1((canonical+secret).encode()).hexdigest()
    async with httpx.AsyncClient(timeout=25) as client:
        response=await client.post(f'https://api.cloudinary.com/v1_1/{cloud}/image/upload',data={**params,'api_key':key,'signature':signature},files={'file':('image.jpg',raw,'image/jpeg')})
    if response.status_code>=400:raise HTTPException(502,'media/provider-unavailable')
    data=response.json()
    if data.get('public_id')!=public_id or data.get('type')!='authenticated':raise HTTPException(502,'media/provider-unavailable')

@router.post('/{thread}/{message}')
async def upload(thread:str,message:str,request:Request):
    if not MSG.fullmatch(message):raise HTTPException(422,'media/invalid-image')
    cloud,key,secret=profile.settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:uid,_=await authorize(client,request,thread,True)
        profile.reserve_upload(uid)
        if request.headers.get('content-type','').split(';')[0]!='image/jpeg':raise HTTPException(415,'media/invalid-image')
        raw=bytearray()
        async with asyncio.timeout(15):
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw)>profile.MAX_BYTES:raise HTTPException(413,'media/too-large')
        image=await run_in_threadpool(profile.normalize_image,bytes(raw),'chat')
        public_id=f'kimkim/messages/{thread}/{uid}/{message}'
        async with asyncio.timeout(30):await provider_upload(cloud,key,secret,public_id,image)
        return {'mediaId':public_id}
    except (TimeoutError,httpx.TimeoutException):raise HTTPException(504,'media/upload-timeout')
    except httpx.HTTPError:raise HTTPException(502,'media/provider-unavailable')

@router.get('/{thread}/{message}')
async def read(thread:str,message:str,request:Request):
    if not MSG.fullmatch(message):raise HTTPException(404,'media/not-found')
    cloud,_,secret=profile.settings()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            _,token=await authorize(client,request,thread)
            record=await document(client,f'communityThreads/{thread}/messages/{message}',token)
            sender=string(record,'senderId');public_id=string(record,'mediaId')
            if not ID.fullmatch(sender) or public_id!=f'kimkim/messages/{thread}/{sender}/{message}':raise HTTPException(404,'media/not-found')
            path=public_id+'.jpg'
            sig=base64.urlsafe_b64encode(hashlib.sha1((path+secret).encode()).digest()).decode()[:8]
            url=f'https://res.cloudinary.com/{cloud}/image/authenticated/s--{sig}--/{quote(path,safe="/")}'
            response=await client.get(url)
            if response.status_code!=200:raise HTTPException(502,'media/provider-unavailable')
            if len(response.content)>profile.MAX_BYTES:raise HTTPException(502,'media/provider-unavailable')
            return Response(response.content,media_type='image/jpeg',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
    except httpx.HTTPError:raise HTTPException(502,'media/provider-unavailable')
