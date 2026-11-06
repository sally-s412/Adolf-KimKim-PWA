# Google Calendar OAuth backend — ADOLF KIMKIM

## Release
Persistent backend OAuth replaces Firebase reauthentication access tokens. A user can connect a Google Calendar account different from the Firebase sign-in account. No AI models, prompts or endpoints change.

## Configuration on backend Render
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
GOOGLE_CALENDAR_REDIRECT_URI=https://adolf-kimkim-beta.onrender.com/api/google-calendar/callback
GOOGLE_CALENDAR_FRONTEND_ORIGIN=https://adolf-kimkim-pwa.onrender.com
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: stable, cryptographically random secret with at least 32 characters. Generate locally with Python secrets.token_urlsafe(48). Store only as a backend secret. Do not rotate without a migration: existing encrypted connections would require reconnecting.
The dedicated Google OAuth Web client must authorize the exact callback URI. Enable Calendar API and grant calendar.events, email and openid. External Testing refresh tokens generally expire after seven days; Production and applicable verification are required for general public use.

## Storage and security
No extra paid service or Firebase Admin credential is introduced. Backend uses each authenticated user's Firebase ID token to access users/{uid}/integrations/googleCalendar via Firestore REST under existing owner-only rules.
Only an authenticated encrypted envelope is stored in the document. Refresh/access tokens and account metadata inside the envelope are encrypted with Fernet using a SHA-256 derivation of the high-entropy backend key. Firestore clients with owner permission can read the ciphertext but cannot decrypt OAuth tokens without the server key. The server verifies envelope kind and uid to prevent cross-account substitution.
This differs from a server-only Firestore collection: that alternative would require Admin credentials and separate rules; no such access was configured by this release. Never persist plaintext credentials in user-readable fields.
Flow state binds Firebase uid, expiry, random nonce and PKCE verifier. Callback is public GET only, validates encrypted state, posts code/state only to the fixed frontend origin and never returns Google tokens. Frontend validates message origin, popup source and exact state. Exchange requires a fresh authenticated Firebase session of the initiating uid.
Callback uses no-store, CSP and no-referrer headers; Uvicorn callback query strings are redacted.
Tokens are refreshed when needed, persisted encrypted, and not stored in browser localStorage. Disconnect deletes stored connection and attempts Google revocation. Login/logout only clears local UI and does not revoke the durable connection.

## UX
On sign-in, GET status restores saved Calendar, refreshes expired Google access token and loads events. A one-minute visible-tab poll refreshes events. This is not a background webhook synchronizer.
Existing users must connect once again to obtain offline consent and save a refresh token.
If Google revokes consent or invalidates a refresh token, app shows reconnect-required.
Google API 403, event ETag conflict 412, missing config and unavailable storage have distinct messages.
Primary calendar event CRUD and existing manual Meet bot handoff are preserved.

## Routes
POST /api/google-calendar/start
GET /api/google-calendar/callback (the only API GET exempted from beta bearer middleware)
POST /api/google-calendar/exchange
GET /api/google-calendar/status
DELETE /api/google-calendar/connection
GET|POST /api/google-calendar/events
PATCH|DELETE /api/google-calendar/events/{id}
Proxy target is fixed to Google primary calendar events; arbitrary routes, attendee changes and email-invitation parameters are not forwarded.

## Verification
15 backend tests and 8 frontend tests, with mocked Google/Firestore responses:
offline/PKCE flow; state expiry, tampering and UID mismatch; encrypted at-rest payload; access refresh; revoked grant; callback injection/log redaction; scoped event proxy; callback-only auth exemption; automatic restore with no popup; message origin/source/state checks.
Production OAuth consent, actual configured key and Firebase permissions still require user end-to-end testing. Never claim a real account is connected based solely on deployment health.

## Acceptance check
1. Open Calendar and connect the desired Google account once.
2. Confirm Calendar permission and verify the linked email.
3. Reload app: calendar should restore without popup.
4. Sign out and back in to same KimKim account: connection should restore.
5. Sign in as another KimKim user: previous user's events must not appear.
6. Revoke Google app consent: UI should request reconnect.
7. Disconnect from KimKim: next reload should stay disconnected.
