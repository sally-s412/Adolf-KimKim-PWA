# KimKim Connections and Messages beta

## Release status

Implemented on `ui/refine-notes-settings-chat`. Frontend deployment does not activate community access. Until the project owner merges and verifies the rules and creates the release configuration below, the app displays “Connections are being prepared”. No existing AI model, prompt, credential, inference route, or payload is changed. `main` is not updated.

The Firebase owner email can differ from the email used for ChatGPT or the app. The required authority is access to project **adolfkimkim**, not matching email addresses. Do not send passwords, API secrets, Google session files, or service-account JSON in chat or commit them to this public repository.

## Included in this beta

- Explicit creation of a signed-in community profile with name, immutable unique username, bio and optional existing account photo. Private email and meeting content are not copied into the profile.
- Username prefix search, up to 20 results.
- Friend requests: send, receive, accept, decline, cancel and unfriend.
- Friend-only direct text conversations, realtime listeners, unread indicators, 30-message pages, session drafts and retry with a stable message ID.
- Blocking in either direction prevents new messages and invitations. Existing conversation history remains visible to its participants.
- Private reports of profiles, conversations or individual incoming messages. Moderation uses the Firebase admin console in this beta; there is no automated moderation or admin dashboard.
- Responsive Vietnamese/English UI and light/dark modes. Private chat is separate from the AI chatbot and is not passed to the AI services.

Not included: follow/feed, group chat, attachments, calls, typing/presence, push delivery when the app is closed, message editing/recall, end-to-end encryption or a production abuse-management system. Handle reservations remain after a profile is deleted to prevent impersonation. Account-wide data erasure needs a separate authenticated cleanup workflow; deleting Firebase Auth alone does not delete Firestore subcollections.

## Firebase owner activation

1. Open Firebase Console with the account that owns project `adolfkimkim`. Keep the current Auth and AI configurations unchanged. Open Firestore Database → Rules and copy the current full rules into a local backup such as `live.rules`.
2. Prepare an additive merge from this repository:

   ```sh
   node scripts/prepare-community-rules.mjs --existing /path/live.rules --out /path/reviewed.rules
   ```

3. Review the merged rules. Preserve the existing private-user rules. Do **not** use the emulator wrapper `security-tests/firestore.rules` as production rules. Existing permissive catch-all grants can override more restrictive community rules because Firestore allows access if any matching rule allows it. Remove or restrict such grants deliberately after checking existing app requirements. Never add `allow read, write: if true` or “all signed-in users can read everything”.
4. Publish the reviewed merged rules through Firestore Rules. A Firebase CLI deployment is also possible using the owner's authenticated CLI and a config whose `firestore.rules` points to the reviewed file. Select project `adolfkimkim` explicitly.
5. Run the multi-account smoke tests below with authorized beta accounts. If rules are not ready, leave release disabled. Use the console's rules testing and Emulator suite; do not test by exposing private data.
6. In Firestore Data, create **communityConfig / release** with boolean `enabled: true` and integer `version: 1`. Only the project administrator can write this document; the frontend cannot turn the feature on. The feature opens on the existing CDN URL after the listener receives it. For rollback, set `enabled` to false, preserving data and restrictive rules. Do not roll back by removing protections.

No new server or paid plan is required for text chat itself. The SDK uses the existing Firebase project. This beta uses client SDK transactions protected by Firestore rules rather than adding an AI-server dependency. Security rules enforce membership, immutable sender/history, atomic preview updates and per-user action gates: one message per second, one invite/report per five seconds. These gates are burst protection, not a hard billing cap or a substitute for production anti-abuse controls. Evaluate App Check, stronger abuse limits and moderation before a public launch.

## Verification

The emulator project is `demo-kimkim-community`; tests never target production.

```sh
cd security-tests
npm ci
npx firebase emulators:exec --only firestore --project demo-kimkim-community "node --test community.test.cjs"
node --test community-ui.test.cjs merge-rules.test.mjs
```

Smoke-test with A, B and C: A creates a profile; B cannot claim the same username; A sends B a request; A cannot accept it on B's behalf; B accepts; A and B exchange messages on separate sessions. C cannot read their thread, messages or private user records. Retry does not duplicate a sent message. Blocking and unfriending revoke new-message permission. Switching accounts clears private UI. Check mobile keyboard, VI/EN, themes and sign-in on the real app before enabling beta testers.

The local UI fixture and emulator demonstrate layout and rule behavior. They are not authenticated production end-to-end proof. The current Render/Firebase owner configuration and billing plan have not been changed by this feature. Text chat consumes Firestore quota: listener reads, rule-dependent reads, metadata writes and receipts add to the message documents. Keep lists to 50 connections/threads for this beta; expanding this limit needs pagination and cost review. Attachments are postponed; Firebase Storage billing requirements must be reviewed separately.

## Data and deployment boundaries

All community records live in `communityProfiles`, `communityHandles`, `communityConnections`, `communityThreads`, `communityBlocks`, `communityGates`, `communityReports` and `communityConfig`. The existing `users/{uid}` data model is preserved. Messages are one document each; no conversation is appended into a single unbounded document. Private message content is not stored by the service worker, and persistent Firestore disk caching is not enabled by this module.

The UI branch deploys automatically to the existing CDN. Firebase rules and admin release configuration are separate operations, so a git push alone cannot grant social access. UI and feature flags must not be treated as authorization. A delayed backend AI startup does not affect Firestore message reads/writes, although AI actions themselves still depend on their original services.

Official references: https://firebase.google.com/docs/firestore/query-data/listen ; https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/firestore/security/test-rules-emulator
