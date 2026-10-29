# UI coverage and community beta delivery

Date: 30 October 2026, Vietnam time. Work branch: `ui/refine-notes-settings-chat`. Main is unchanged.

## Source-aligned corrections

- Navigation uses Library / Thư viện for the mixed recording/document list.
- Existing Figma screens no longer show the obsolete global Add New control.
- Upload design copy includes textual PDF and DOCX alongside audio/video.
- Settings and meeting form copy distinguish saved preferences and immediate invitation requests from an unimplemented calendar auto-join scheduler.
- Team copy acknowledges pending invitation records; no email delivery or workspace permission is promised.
- Upgrade UI no longer collects card information for an unavailable payment integration; a beta-access explanation replaces it.

## Added editable design flows

Nine flows in twelve device/theme/language groups, **108 new frames**: Connections, Requests, Profile, Onboarding, Messages, Blocked, Report, Setup states, and inline Note composer. Every group includes desktop/tablet/mobile coverage through its corresponding source shell, Vietnamese/English and dark/light variants. Editable text, native button and field instances, product tokens, navigation and the existing mascot are used; no full-UI raster is embedded.

Figma file: https://www.figma.com/design/fyQX0DucWbjQkSYse1WKKw

| Group | Section ID |
| --- | --- |
| Desktop dark VI | 182:17699 |
| Desktop dark EN | 185:18108 |
| Desktop light VI | 185:20402 |
| Desktop light EN | 185:22501 |
| Tablet dark VI | 185:24629 |
| Tablet dark EN | 185:26390 |
| Tablet light VI | 185:28193 |
| Tablet light EN | 185:29953 |
| Mobile dark VI | 185:31669 |
| Mobile dark EN | 185:32266 |
| Mobile light VI | 185:32906 |
| Mobile light EN | 185:33503 |

## Validation evidence and limits

- 15 Firebase Emulator integration/security tests pass against a demo project: identity/handle ownership, private data separation, invitation transitions, friend-only threads, realtime updates, idempotent sending, unauthorized reads/writes, blocking, unfriend, rate gates, reports and pagination.
- Six DOM UI tests pass: admin release gate, explicit profile opt-in, safe user-text rendering, VI/EN copy, draft/focus retention, sending, blocking and cleanup on account change.
- Two rules-merger tests pass; existing rules are preserved and malformed/duplicate input is refused.
- Existing 21 frontend regressions and six PWA tests pass, including preserved AI request payloads and endpoint resolution.
- Browser layout inspection used isolated sample fixtures with the actual new community markup/styles/module. Desktop dark/light and VI/EN, a sent sample message, mobile navigation and a 390px iframe were checked. Mobile measured clientWidth=scrollWidth=390. This is not a real iPhone keyboard or an authenticated production test.
- Figma structural inspection counted twelve groups, 108 frames and no main-content overflow in the added screens. Representative desktop and mobile compositions were inspected and navigation/input sizing was corrected. Product font is SF Pro in the existing Figma system; the website retains its existing Segoe/system stack.

This delivery does **not** certify pixel-perfect parity for every existing screen. The Figma mock conversations are illustrative; the production UI contains no seeded people or messages. Reporting is a styled dialog in the implementation; the Figma report frame describes the form contents. The earlier decorative Home background asset transfer to Figma remains unresolved. Existing Meet admission, AI server availability, Unicode export behavior and account-wide erasure have not been retested or redesigned by this social feature.

## Activation boundary

The public frontend can deploy independently. Real community access remains behind `communityConfig/release` and the separately deployed Firestore rules. No Firebase administrator session is available in this task; the owner must publish the reviewed additive rules and enable the release. Follow `docs/community-beta.md`. Do not replace production rules with the test-only emulator wrapper.
