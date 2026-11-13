"""Authenticated message reactions and reply references, without changing live Firestore rules."""
import re
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from routes.message_push import access_token, base, get

router = APIRouter(prefix='/api/community/message-actions', tags=['community'])
THREAD = re.compile(r'^(?:g-[a-zA-Z0-9-]{20,80}|[a-zA-Z0-9_-]{1,128}~[a-zA-Z0-9_-]{1,128})$')
MESSAGE = re.compile(r'^[a-zA-Z0-9-]{20,80}$')
EMOJI = {'❤️', '😂', '😮', '😢', '👍', '🎉'}


class Action(BaseModel):
    threadId: str
    messageId: str
    emoji: str | None = None
    replyTo: str | None = None


def field(doc, name):
    return doc.get('fields', {}).get(name, {})


def members(doc):
    return [entry.get('stringValue') for entry in field(doc, 'members').get('arrayValue', {}).get('values', [])]


async def allowed(client, token, uid, thread_id):
    thread = await get(client, token, 'communityThreads/' + quote(thread_id, safe=''))
    people = members(thread or {})
    if uid not in people or len(people) < 2 or len(people) > 4:
        raise HTTPException(404, 'Conversation not found')
    others = [person for person in people if person != uid]
    if not thread_id.startswith('g-'):
        if len(people) != 2 or thread_id != '~'.join(sorted(people)):
            raise HTTPException(403, 'Conversation unavailable')
        connection = await get(client, token, 'communityConnections/' + quote(thread_id, safe=''))
        if field(connection or {}, 'status').get('stringValue') != 'accepted':
            raise HTTPException(403, 'Conversation unavailable')
    for other in others:
        for owner, target in ((uid, other), (other, uid)):
            if await get(client, token, 'communityBlocks/' + quote(owner, safe='') + '/targets/' + quote(target, safe='')):
                raise HTTPException(403, 'Conversation unavailable')


@router.post('')
async def message_action(action: Action, request: Request):
    if not THREAD.fullmatch(action.threadId) or not MESSAGE.fullmatch(action.messageId):
        raise HTTPException(400, 'Invalid message')
    reaction = action.emoji is not None
    if reaction == (action.replyTo is not None) or (reaction and action.emoji not in EMOJI):
        raise HTTPException(400, 'Invalid action')
    if not reaction and (not MESSAGE.fullmatch(action.replyTo or '') or action.replyTo == action.messageId):
        raise HTTPException(400, 'Invalid reply')
    uid = request.state.uid
    # A Firebase UID may contain punctuation; Firestore field paths quote it as one map key.
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', uid):
        raise HTTPException(403, 'Invalid account')
    token = access_token()
    path = 'communityThreads/' + quote(action.threadId, safe='') + '/messages/' + quote(action.messageId, safe='')
    headers = {'Authorization': 'Bearer ' + token}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            await allowed(client, token, uid, action.threadId)
            if not reaction and not await get(client, token, 'communityThreads/' + quote(action.threadId, safe='') + '/messages/' + quote(action.replyTo, safe='')):
                raise HTTPException(404, 'Original message not found')
            for _ in range(3):
                message = await get(client, token, path)
                if not message:
                    raise HTTPException(404, 'Message not found')
                if reaction:
                    current = field(message, 'reactions').get('mapValue', {}).get('fields', {}).get(uid, {}).get('stringValue')
                    new_value = None if current == action.emoji else action.emoji
                    field_path = 'reactions.`' + uid + '`'
                    fields = {'reactions': {'mapValue': {'fields': {uid: {'stringValue': new_value}}}}} if new_value else {}
                else:
                    if field(message, 'senderId').get('stringValue') != uid:
                        raise HTTPException(403, 'Only the sender may attach a reply')
                    current = field(message, 'replyTo').get('stringValue')
                    if current and current != action.replyTo:
                        raise HTTPException(409, 'Reply already attached')
                    if current == action.replyTo:
                        return {'ok': True}
                    field_path = 'replyTo'
                    fields = {'replyTo': {'stringValue': action.replyTo}}
                response = await client.patch(base() + '/' + path,
                    params={'updateMask.fieldPaths': field_path, 'currentDocument.updateTime': message['updateTime']},
                    headers=headers, json={'fields': fields})
                if response.status_code in (409, 412):
                    continue
                if not response.is_success:
                    raise HTTPException(503, 'Message update unavailable')
                return {'ok': True}
    except httpx.RequestError:
        raise HTTPException(503, 'Message service unavailable') from None
    raise HTTPException(409, 'Message changed. Please retry')
