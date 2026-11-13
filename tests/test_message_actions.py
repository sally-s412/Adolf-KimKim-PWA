"""Exercise message action authorization and field-scoped Firestore writes."""
import asyncio
from types import SimpleNamespace

import httpx
from fastapi import HTTPException

from routes import message_actions as actions


def run():
    writes = []
    def response(request):
        path = request.url.path
        if request.method == 'PATCH':
            writes.append((str(request.url), request.content.decode()))
            return httpx.Response(200, json={})
        if path.endswith('/communityThreads/alice~bob'):
            return httpx.Response(200, json={'fields': {'members': {'arrayValue': {'values': [
                {'stringValue': 'alice'}, {'stringValue': 'bob'}]}}}})
        if path.endswith('/communityConnections/alice~bob'):
            return httpx.Response(200, json={'fields': {'status': {'stringValue': 'accepted'}}})
        if '/communityBlocks/' in path:
            return httpx.Response(404)
        if '/messages/' in path:
            return httpx.Response(200, json={'updateTime': '2026-11-13T00:00:00Z', 'fields': {
                'senderId': {'stringValue': 'alice'}, 'text': {'stringValue': 'Hello'}}})
        return httpx.Response(404)

    original_client, original_base, original_token = httpx.AsyncClient, actions.base, actions.access_token
    httpx.AsyncClient = lambda **kwargs: original_client(transport=httpx.MockTransport(response), **kwargs)
    actions.base = lambda: 'https://firestore.test/documents'
    actions.access_token = lambda: 'test'
    try:
        request = SimpleNamespace(state=SimpleNamespace(uid='bob'))
        action = actions.Action(threadId='alice~bob', messageId='a' * 20, emoji='❤️')
        assert asyncio.run(actions.message_action(action, request)) == {'ok': True}
        assert 'updateMask.fieldPaths=reactions.%60bob%60' in writes[0][0]
        assert 'reactions' in writes[0][1] and '❤️' in writes[0][1]
        try:
            asyncio.run(actions.message_action(actions.Action(threadId='alice~bob', messageId='a' * 20, replyTo='b' * 20), request))
        except HTTPException as error:
            assert error.status_code == 403
        else:
            raise AssertionError('Recipient attached a reply to another sender’s message')
        assert len(writes) == 1
        request.state.uid = 'alice'
        assert asyncio.run(actions.message_action(actions.Action(threadId='alice~bob', messageId='a' * 20, replyTo='b' * 20), request)) == {'ok': True}
        assert 'updateMask.fieldPaths=replyTo' in writes[-1][0]
    finally:
        httpx.AsyncClient, actions.base, actions.access_token = original_client, original_base, original_token


if __name__ == '__main__':
    run()
    print('Passed authorized reaction and reply ownership checks.')
