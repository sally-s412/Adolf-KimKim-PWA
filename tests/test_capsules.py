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
sys.modules['routes.profile_media'] = profile
spec = importlib.util.spec_from_file_location('routes.capsules', 'routes/capsules.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CapsuleTests(unittest.IsolatedAsyncioTestCase):
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

if __name__ == '__main__':unittest.main()
