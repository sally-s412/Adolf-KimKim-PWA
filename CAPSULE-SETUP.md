# KimKim Capsule deployment

Finance and capsule drafts use the existing authenticated per-user Firestore subcollections. No new client access rules are needed. Scheduled letters are stored in `kimkimCapsules`, which must remain denied to every Firebase client. Do not add a broad read/write grant for this collection.

## Required backend configuration

Set these on the `adolf-kimkim-beta` backend, not on the static site.

| Variable | Purpose |
| --- | --- |
| CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON | Dedicated service account JSON for the `adolfkimkim` Firestore database, with the minimum needed Firestore data access |
| CAPSULE_ENCRYPTION_KEY | A persistent Fernet key, generated with `Fernet.generate_key()`. Keep this key backed up. Changing it prevents existing letters from being opened. |
| CAPSULE_RESEND_API_KEY | Resend API key for transactional email |
| CAPSULE_FROM_EMAIL | Verified sender, for example `KimKim <letters@your-verified-domain>` |
| CAPSULE_PUBLIC_ORIGIN | Backend public HTTPS origin, currently `https://adolf-kimkim-beta.onrender.com` |
| CAPSULE_DISPATCH_SECRET | Random secret of at least 32 characters for the trusted scheduler |

Do not put any of these credentials in frontend files, chat messages, or git. The API reports `ready: false` and keeps sealing disabled until all required settings are valid. Draft composition and saving remain available.

## Scheduler

Configure a trusted scheduler to POST `/api/capsules/dispatch` every minute, with header `X-Capsule-Secret` set to the secret above. A request body is not needed. On a sleeping free web service delivery can be late while the service wakes. For a strict minute-level delivery requirement use an always-on backend. A browser timer is never used for delivery.

Configure the Firestore composite index in `firebase/capsules.indexes.json`. The dispatch query requires `status` ascending and `sendAt` ascending.

## Recipient and privacy behavior

The recipient does not need an app account. The email includes a 256-bit random link. Anyone holding that link can read the letter after delivery. Avoid forwarding it. The recipient page sends no-referrer, no-store and restrictive CSP headers. Private text and attached JPEG photos are encrypted in server-owned Firestore records before the scheduled send. Owner-facing endpoints return delivery metadata only. Drafts remain editable in the author's private user collection until sealing.

Cancellation uses Firestore's document version precondition and is allowed only before the worker claims the letter. Sealing reuses a deterministic record ID for a draft so a lost HTTP response cannot create another mail. The worker uses the same provider idempotency key for safe retries and stops retries before the provider's 24-hour idempotency retention expires. An ambiguous delivery after that window is marked failed for manual inspection instead of sending a possible duplicate. Sent means accepted by the mail provider, not confirmed received in the inbox. Closed mailboxes, spam filtering and bounces require checking the provider dashboard.

The first release supports one external recipient and up to three compressed images per letter. The frontend saves the draft before previewing. No test emails are sent during development checks.

## Checks

`python -m unittest discover -s tests -p test_capsules.py -v`

DOM workflow verification is in `tests/personal-dom.cjs`, with the isolated in-memory fixture `tests/fixtures/personal.html`. Install jsdom for that check. This fixture never connects to Firebase or sends email.

## Activation checklist

1. In the backend Render Environment page, enter the credentials above directly; never send them through chat. Use a dedicated Resend sending key and dedicated Firebase service account. Back up the encryption key securely.
2. Deploy the composite index and verify it is ready. Confirm live Firestore rules restrict each `/users/{uid}` subcollection to that user and deny client access to `kimkimCapsules`.
3. Configure a trusted cron runner to execute `python scripts/dispatch-capsules.py` every minute with only `CAPSULE_PUBLIC_ORIGIN` and `CAPSULE_DISPATCH_SECRET` supplied securely. Use this branch as its source. Do not expose the dispatch secret to frontend build variables. A Render Cron Job is paid; no paid resource is provisioned by this change.
4. Run the scheduler manually and confirm success. Only then set `CAPSULE_SCHEDULER_ENABLED=true` on the backend and redeploy. Missing activation keeps new sealing disabled.
5. Verify the sender account email, seal one test letter to your own inbox, verify no early access, and confirm only one provider message and one inbox delivery after its deadline. Check spam and provider bounce events. Verify cancellation as well.

Sealing requires a verified Firebase email. The server atomically writes ciphertext and deletes the exact previewed draft revision. Concurrent draft changes are rejected. Account switching clears dialogs and account data; Finance includes a session-only amount privacy toggle. Capsule API responses are private/no-store. Application access logs redact recipient query tokens; infrastructure request logs must also be restricted and reviewed before launch. Bearer links are private access credentials, not recipient identity verification. This beta has not undergone an independent security audit.
