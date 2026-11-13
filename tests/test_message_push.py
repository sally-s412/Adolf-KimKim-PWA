"""Render push authorization and duplicate-delivery boundaries."""
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from routes import message_push as push


def doc(**fields):
    return {'fields': {key: {'stringValue': value} for key, value in fields.items()}}


class PushTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        context = AsyncMock()
        context.__aenter__.return_value = object()
        return patch.object(push.httpx, 'AsyncClient', return_value=context)

    async def test_spoofed_sender_cannot_dispatch(self):
        thread = 'alice~bob'
        message = '12345678901234567890'
        record = doc(senderId='bob', clientMessageId=message)
        convo = {'fields': {'members': {'arrayValue': {'values': [{'stringValue': 'alice'}, {'stringValue': 'bob'}]}}}}
        with self.client(), patch.object(push, 'authenticate', AsyncMock(return_value='alice')), \
             patch.object(push, 'access_token', return_value='server-token'), \
             patch.object(push, 'get', AsyncMock(side_effect=[record, convo])), \
             patch.object(push, 'mark_once', AsyncMock()) as marker:
            with self.assertRaises(HTTPException) as error:
                await push.notify(push.Notice(threadId=thread, messageId=message), SimpleNamespace())
            self.assertEqual(error.exception.status_code, 403)
            marker.assert_not_awaited()

    async def test_duplicate_does_not_send(self):
        thread = 'alice~bob'
        message = '12345678901234567890'
        record = doc(senderId='alice', clientMessageId=message)
        record['fields']['createdAt'] = {'timestampValue': datetime.now(timezone.utc).isoformat()}
        convo = {'fields': {'members': {'arrayValue': {'values': [{'stringValue': 'alice'}, {'stringValue': 'bob'}]}}}}
        with self.client(), patch.object(push, 'authenticate', AsyncMock(return_value='alice')), \
             patch.object(push, 'access_token', return_value='server-token'), \
             patch.object(push, 'get', AsyncMock(side_effect=[record, convo])), \
             patch.object(push, 'mark_once', AsyncMock(return_value=False)), \
             patch.object(push, 'devices', AsyncMock()) as devices:
            result = await push.notify(push.Notice(threadId=thread, messageId=message), SimpleNamespace())
            self.assertEqual(result['status'], 'already-processed')
            devices.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
