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


class GmailTests(unittest.IsolatedAsyncioTestCase):
    def config(self):
        import json
        cipher=Fernet(Fernet.generate_key())
        info={'token_uri':'https://oauth2.googleapis.com/token','refresh_token':'test-refresh','client_id':'test-client','client_secret':'test-secret','scopes':[m.GMAIL_SCOPE]}
        values={'CAPSULE_GMAIL_TOKEN_ENCRYPTED':cipher.encrypt(json.dumps(info).encode()).decode(),
                'CAPSULE_FROM_EMAIL':'KimKim <sender@gmail.com>', 'CAPSULE_PUBLIC_ORIGIN':'https://example.com'}
        return values, cipher, info

    def test_encrypted_token_only_and_send_scope(self):
        import json
        values,cipher,info=self.config()
        self.assertEqual(m.gmail_token_info(values,cipher)['refresh_token'],'test-refresh')
        self.assertNotIn('test-refresh', values['CAPSULE_GMAIL_TOKEN_ENCRYPTED'])
        for change in ({'token_uri':'https://evil.example/token'},{'scopes':['https://mail.google.com/']},{'refresh_token':''}):
            bad={**info,**change}
            values['CAPSULE_GMAIL_TOKEN_ENCRYPTED']=cipher.encrypt(json.dumps(bad).encode()).decode()
            with self.assertRaises(ValueError):m.gmail_token_info(values,cipher)

    async def test_gmail_mime_request(self):
        import json,base64
        from email import policy
        from email.parser import BytesParser
        values,cipher,_=self.config()
        record={'id':'a'*64,'email':'recipient@example.com','title':'Thư tiếng Việt',
                'encrypted':cipher.encrypt(json.dumps({'token':'private-link','language':'vi','body':'PRIVATE_BODY'}).encode()).decode()}
        response=m.httpx.Response(200,json={'id':'gmail-id'})
        client=AsyncMock();client.post.return_value=response
        manager=AsyncMock();manager.__aenter__.return_value=client
        with patch.object(m,'settings',return_value=(values,{},cipher)),patch.object(m,'gmail_access_token',return_value='access'),patch.object(m.httpx,'AsyncClient',return_value=manager):
            self.assertEqual(await m.deliver(record),'gmail-id')
        args,kw=client.post.call_args
        self.assertEqual(args[0],'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
        raw=base64.urlsafe_b64decode(kw['json']['raw'])
        msg=BytesParser(policy=policy.default).parsebytes(raw)
        self.assertEqual(str(msg['Subject']),'KimKim mang thư đến cho bạn · Thư tiếng Việt')
        self.assertEqual(msg['To'],'recipient@example.com')
        self.assertNotIn(b'PRIVATE_BODY',raw)

    async def test_timeout_never_retries(self):
        now=datetime.now(timezone.utc)
        record={'id':'a'*64,'status':'scheduled','sendAt':(now-timedelta(days=1)).isoformat(),'attempts':'0','version':'v'}
        db=AsyncMock(return_value={**record,'status':'sending'})
        with patch.dict(os.environ,{'CAPSULE_SCHEDULER_ENABLED':'true'}),patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'due_records',AsyncMock(side_effect=[[record],[]])),patch.object(m,'update',db),patch.object(m,'deliver',AsyncMock(side_effect=TimeoutError)) as send:
            result=await m.dispatch(types.SimpleNamespace(headers={'x-capsule-secret':'correct'}))
            self.assertEqual(result['sent'],0)
            self.assertEqual(db.call_args.args[1]['status'],'delivery_unknown')
            self.assertEqual(send.await_count,1)
        old={**record,'status':'sending','claimedAt':(now-timedelta(minutes=15)).isoformat()}
        with patch.dict(os.environ,{'CAPSULE_SCHEDULER_ENABLED':'true'}),patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'due_records',AsyncMock(side_effect=[[],[old]])),patch.object(m,'update',AsyncMock()) as update,patch.object(m,'deliver',AsyncMock()) as send:
            await m.dispatch(types.SimpleNamespace(headers={'x-capsule-secret':'correct'}))
            send.assert_not_called()
            self.assertEqual(update.call_args.args[1]['status'],'delivery_unknown')

    async def test_scheduler_off_never_sends(self):
        with patch.dict(os.environ,{'CAPSULE_SCHEDULER_ENABLED':'false'}),patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'due_records',AsyncMock()) as query:
            with self.assertRaises(HTTPException) as caught:
                await m.dispatch(types.SimpleNamespace(headers={'x-capsule-secret':'correct'}))
            self.assertEqual(caught.exception.detail,'capsule/scheduler-disabled')
            query.assert_not_called()

class SchedulerPreflightTests(unittest.IsolatedAsyncioTestCase):
    async def test_preflight_while_disabled_never_claims_or_sends(self):
        request=types.SimpleNamespace(headers={'x-capsule-secret':'correct'},query_params={'dry_run':'true'})
        with patch.dict(os.environ,{'CAPSULE_SCHEDULER_ENABLED':'false'}),patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'gmail_access_token',return_value='private-token'),patch.object(m,'due_records',AsyncMock(return_value=[{'id':'due-letter'}])) as query,patch.object(m,'update',AsyncMock()) as update,patch.object(m,'deliver',AsyncMock()) as send:
            result=await m.dispatch(request)
            self.assertEqual(result,{'ready':True,'dryRun':True,'sent':0,'schedulerEnabled':False})
            self.assertEqual(query.await_count,2)
            update.assert_not_called();send.assert_not_called()
            self.assertNotIn('private-token',str(result))

    async def test_preflight_requires_scheduler_secret(self):
        request=types.SimpleNamespace(headers={'x-capsule-secret':'wrong'},query_params={'dry_run':'true'})
        with patch.object(m,'settings',return_value=({'CAPSULE_DISPATCH_SECRET':'correct'},None,None)),patch.object(m,'gmail_access_token') as refresh:
            with self.assertRaises(HTTPException) as caught:await m.dispatch(request)
            self.assertEqual(caught.exception.status_code,401)
            refresh.assert_not_called()

class CoverTests(unittest.IsolatedAsyncioTestCase):
    def test_invalid_cover_and_missing_photo_rejected(self):
        from pydantic import ValidationError
        base=dict(id='draft-test-123',title='A',body='B',email='a@b.com',sendAt=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
        with self.assertRaises(ValidationError):m.Letter(**base,cover='url(https://evil.example)')
        with self.assertRaises(ValidationError):m.Letter(**base,paper='url(https://evil.example)')
        with self.assertRaises(ValidationError):m.Letter(**base,seal='<img>')
        with self.assertRaises(HTTPException):m.validate_letter(m.Letter(**base,cover='photo'))
        m.validate_letter(m.Letter(**base,cover='photo',coverPhoto='data:image/jpeg;base64,/9j/'))
        self.assertEqual(m.Letter(**base).cover,'rose')

    def test_owner_photo_cover_remains_encrypted_at_rest(self):
        import json
        cipher=Fernet(Fernet.generate_key())
        record={'id':'a'*64,'cover':'photo','paper':'aged','seal':'rose','encrypted':cipher.encrypt(json.dumps({'photos':[],'coverPhoto':'data:image/jpeg;base64,/9j/'}).encode()).decode()}
        with patch.object(m,'settings',return_value=({},None,cipher)):
            meta=m.public_meta(record)
            self.assertEqual(meta['coverPhoto'],'data:image/jpeg;base64,/9j/')
            self.assertEqual(meta['paper'],'aged')
            self.assertEqual(meta['seal'],'rose')
            self.assertNotIn('encrypted',meta)

    async def test_recipient_cover_and_escaped_body(self):
        import json,hashlib
        cipher=Fernet(Fernet.generate_key());token='x'*40
        payload={'cover':'midnight','paper':'night','seal':'rose','title':'<script>','body':'<b>secret</b>','language':'vi','photos':[]}
        record={'status':'sent','sendAt':(datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),'tokenHash':hashlib.sha256(token.encode()).hexdigest(),'encrypted':cipher.encrypt(json.dumps(payload).encode()).decode()}
        with patch.object(m,'firestore',AsyncMock()),patch.object(m,'unpack',return_value=record),patch.object(m,'settings',return_value=({},None,cipher)):
            response=await m.open_letter('a'*64,token)
            page=response.body.decode()
            self.assertIn('#182856',page)
            self.assertIn('#25304b',page)
            self.assertIn('✿',page)
            self.assertIn('&lt;b&gt;secret&lt;/b&gt;',page)
            self.assertNotIn('<script>',page)
            self.assertEqual(response.headers['cache-control'],'no-store')

    async def test_separate_cover_photo_on_recipient_page(self):
        import json,hashlib
        cipher=Fernet(Fernet.generate_key());token='x'*40
        payload={'cover':'photo','coverPhoto':'data:image/jpeg;base64,/9j/','paper':'aged',
                 'seal':'heart','title':'Photo','body':'Hello','language':'en','photos':[]}
        record={'status':'sent','sendAt':(datetime.now(timezone.utc)-timedelta(days=1)).isoformat(),
                'tokenHash':hashlib.sha256(token.encode()).hexdigest(),
                'encrypted':cipher.encrypt(json.dumps(payload).encode()).decode()}
        with patch.object(m,'firestore',AsyncMock()),patch.object(m,'unpack',return_value=record),patch.object(m,'settings',return_value=({},None,cipher)):
            response=await m.open_letter('a'*64,token)
            page=response.body.decode()
            self.assertIn('src="data:image/jpeg;base64,/9j/"',page)
            self.assertIn('#e4cfab',page)
            self.assertIn('♥',page)

if __name__ == '__main__':unittest.main()


