import asyncio
import importlib.util
import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet
from fastapi import HTTPException

profile = types.ModuleType('routes.profile_media')
profile.authenticate = AsyncMock(return_value='owner')
profile.CERT_REQUEST = object()
sys.modules['routes.profile_media'] = profile
spec = importlib.util.spec_from_file_location('routes.capsules', 'routes/capsules.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CapsuleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.verified = patch.object(m, 'sender_verified', AsyncMock(return_value=True))
        self.env = patch.dict(os.environ, {'CAPSULE_SCHEDULER_ENABLED': 'true'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.verified.start()
        self.addCleanup(self.verified.stop)

    def letter(self, **changes):
        return m.Letter(**dict(id='draft-test-123', title='A letter', body='<script>private</script>',
            email='friend@example.com', sendAt=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(), **changes))

    def test_validation_and_metadata_secrecy(self):
        m.validate_letter(self.letter())
        for value in ['now', '2020-01-01T00:00:00', '2020-01-01T00:00:00Z']:
            letter=self.letter();letter.sendAt=value
            with self.assertRaises(HTTPException):m.validate_letter(letter)
        letter=self.letter();letter.email='bad\r\nBcc: someone'
        with self.assertRaises(HTTPException):m.validate_letter(letter)
        meta=m.public_meta({'id':'x','encrypted':'private','tokenHash':'secret','body':'text'})
        self.assertNotIn('encrypted',meta)
        self.assertNotIn('body',meta)

    async def test_seal_retry_does_not_resend(self):
        existing={'id':'saved','status':'sent','owner':'owner','title':'A','email':'a@b.c','sendAt':'x'}
        with patch.object(m,'settings',return_value=({}, {}, Fernet(Fernet.generate_key()))), patch.object(m,'firestore',AsyncMock(return_value={'fields':m.fields(existing),'name':'saved','updateTime':'1'})) as db:
            result=await m.seal(self.letter(),object())
            self.assertEqual(result['status'],'sent')
            self.assertEqual(db.await_count,1)

    async def test_cancel_other_user_and_active_delivery(self):
        record={'id':'a'*64,'owner':'someone-else','status':'scheduled'}
        with patch.object(m,'firestore',AsyncMock(return_value={})),patch.object(m,'unpack',return_value=record):
            with self.assertRaises(HTTPException) as caught:await m.cancel('a'*64,object())
            self.assertEqual(caught.exception.status_code,404)
        record['owner']='owner';record['status']='sending'
        with patch.object(m,'firestore',AsyncMock(return_value={})),patch.object(m,'unpack',return_value=record):
            with self.assertRaises(HTTPException) as caught:await m.cancel('a'*64,object())
            self.assertEqual(caught.exception.status_code,409)

    async def test_recipient_before_send_is_denied(self):
        import hashlib
        token='x'*40
        record={'tokenHash':hashlib.sha256(token.encode()).hexdigest(),'status':'scheduled'}
        with patch.object(m,'firestore',AsyncMock(return_value={})),patch.object(m,'unpack',return_value=record):
            with self.assertRaises(HTTPException):await m.open_letter('a'*64,token)

    async def test_dispatch_rejects_bad_secret(self):
        request=types.SimpleNamespace(headers={'x-capsule-secret':'bad'})
        with patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)):
            with self.assertRaises(HTTPException) as caught:await m.dispatch(request)
            self.assertEqual(caught.exception.status_code,401)

    async def test_dispatch_claim_conflict_never_sends(self):
        record={'status':'scheduled','sendAt':(datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),'attempts':'0'}
        with patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'due_records',AsyncMock(side_effect=[[record],[]])),patch.object(m,'update',AsyncMock(side_effect=HTTPException(409))),patch.object(m,'deliver',AsyncMock()) as deliver:
            result=await m.dispatch(types.SimpleNamespace(headers={'x-capsule-secret':'correct'}))
            self.assertEqual(result['sent'],0)
            deliver.assert_not_called()

    def test_access_log_redacts_private_token(self):
        import logging
        record = logging.LogRecord('uvicorn.access', 20, '', 1, '%s %s %s %s %s',
            ('client', 'GET', '/capsule/open/abc?token=secret', '1.1', 200), None)
        m.CapsuleAccessLogFilter().filter(record)
        self.assertNotIn('secret', record.getMessage())

    async def test_unverified_sender_cannot_seal(self):
        with patch.object(m, 'sender_verified', AsyncMock(return_value=False)), patch.object(m, 'settings', return_value=({}, {}, None)), patch.object(m, 'firestore', AsyncMock()) as db:
            with self.assertRaises(HTTPException) as caught:
                await m.seal(self.letter(), object())
            self.assertEqual(caught.exception.status_code, 403)
            db.assert_not_called()

    async def test_seal_creates_ciphertext_and_deletes_draft_atomically(self):
        letter = self.letter()
        draft = {'name': 'projects/adolfkimkim/databases/(default)/documents/users/owner/capsuleDrafts/' + letter.id,
                 'updateTime': '2026-01-01T00:00:00Z',
                 'fields': m.fields({k:getattr(letter,k) for k in ('title','body','email','sendAt')})}
        db = AsyncMock(side_effect=[None, draft, {}])
        with patch.object(m,'settings',return_value=({}, {}, Fernet(Fernet.generate_key()))), patch.object(m,'query_records',AsyncMock(return_value=[])), patch.object(m,'firestore',db):
            result = await m.seal(letter, object())
            self.assertEqual(result['status'], 'scheduled')
            args, kwargs = db.call_args
            self.assertEqual(args, ('POST', ':commit'))
            writes = kwargs['json']['writes']
            self.assertEqual(writes[1]['delete'], draft['name'])
            self.assertEqual(writes[1]['currentDocument']['updateTime'], draft['updateTime'])
            self.assertNotIn(letter.body, str(writes[0]))

    async def test_changed_draft_cannot_be_sealed(self):
        db = AsyncMock(side_effect=[None, {'fields': {}, 'name': 'draft', 'updateTime': 'v1'}])
        with patch.object(m,'settings',return_value=({}, {}, Fernet(Fernet.generate_key()))), patch.object(m,'query_records',AsyncMock(return_value=[])), patch.object(m,'firestore',db):
            with self.assertRaises(HTTPException) as caught:
                await m.seal(self.letter(), object())
            self.assertEqual(caught.exception.status_code, 409)
            self.assertEqual(db.await_count, 2)

if __name__ == '__main__':unittest.main()
