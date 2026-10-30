# Social V2 rollout

The Instagram-inspired profile and Messenger-style inbox use real Firebase profile, relationship and message data. Sample people, 128-friend counts, interests and profile friend lists from the design are not published as real user data. Another person's friend list stays private. AI models, credentials, parameters, prompts and routes are unchanged.

Deploy branch: ui/refine-notes-settings-chat. Static CDN: https://adolf-kimkim-pwa.onrender.com/.

## Covers

- Six built-in gradients; owner-only editor; JPG/PNG/WebP file picker and drop zone; 5 MB input limit, drag/keyboard crop and zoom; JPEG output at 1600×480.
- Cover upload uses the existing Firebase Storage bucket, path covers/{uid}/{random-id}.jpg. No bucket, paid plan or billing configuration is created or changed.
- The original social rules remain compatible with names, bio, friends and chat. Cover metadata needs the optional coverPreset and coverUrl permissions in firebase/firestore-community-v2.rules. This complete file preserves the user's supplied users/{userId} rules and deny fallback. Owner must Publish it manually if the earlier rules were already published.
- Upload additionally needs the additive firebase/cover-storage.rules.fragment merged into the current Storage rules. Inspect existing Storage rules before publishing; do not replace them with a fragment. If Storage is unavailable, presets remain possible after the Firestore update. Do not upgrade billing automatically.
- A permission failure leaves the prior cover unchanged and displays an inline explanation. No local-only save is represented as a synchronized save.
- Updating a profile preserves its cover. Switching accounts closes the image dialog. Orphan cleanup and account-wide media erasure need a separate lifecycle workflow; failed uploads are cleaned up on a best-effort basis.

## Existing feature activation

Firestore document communityConfig/release: enabled boolean true; version int64 1. UI release gating is not a substitute for security rules. No new feature version flag is needed.

## Verification scope

Emulator rules validate account isolation, profile ownership, handle reservation, friendship transitions, messaging, blocking, reports and cover metadata. UI tests verify text escaping, draft retention, account cleanup, cover validation and preset saving. Production sign-in and Storage uploads still need an owner-authorized real-account check. Mobile visual QA does not substitute for a physical iPhone keyboard test.
