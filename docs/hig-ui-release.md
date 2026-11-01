# ADOLF KIMKIM — HIG UI release

## Source of truth

- Web colors: `frontend/design-tokens.css`. New HIG components: `hig-components.css`, compositions: `hig-screens.css`.
- Shared buttons/icons: `window.HIG` in `frontend/hig-ui.js`. Buttons support filled, tinted, gray, plain, destructive; hover, pressed, disabled and aria-busy loading. Icon geometry is one rounded SVG family at 1.75px, without an SF Symbols font dependency. Google keeps its official multicolor mark. User-authored emoji, content stickers and formatting letters are content, not navigation icons.
- Palette reference: Figma file `6b0fZCMoz5esesEJ18xaeY`; peach `#FCC188`, blue `#2834E7`, lavender `#9765BE`. Hero backgrounds adapt those hues for readable Light/Dark text; they are not a raw saturated gradient behind every form.
- Editable Figma source: https://www.figma.com/design/fyQX0DucWbjQkSYse1WKKw?node-id=261-27702. New frames have the prefix `HIG RELEASE`; existing screens/assets remain available for comparison.

## Color audit

`ui-color-audit.csv` records original file, line, color and classification before migration, including named colors. Line numbers refer to the audited source, not the final edited source. All legacy CSS numeric color literals now resolve through `legacy-color-tokens.css`; current interactive components use semantic tokens from `design-tokens.css` and the shared button contract. The compatibility layer preserves old content styles while removing scattered literal values; it should be retired section by section as legacy selectors are deleted.

Remaining literals are intentional foundations or content data: user cover presets, story background/drawing colors, note font colors, color validation and stored team metadata. Speaker colors moved into named theme tokens. Google brand SVG and raster/image assets retain original colors. Calendar event categories and user-selected conversation themes retain their meaning; action buttons use the common theme.

## Behavior and data separation

- Home uses Auth Display name, with localized fallback; hero copy changes with VIE/ENG. AI Studio scroll honors reduced-motion preferences; Social opens the existing route. Recorder, Meet invite and file upload remain in AI Studio below the hero.
- Header exposes notifications, language, theme and a person-icon Profile button. Sidebar preserves navigation and adds the real plan result above the account chip. Usage is omitted when no usage service is available. Upgrade opens the existing plan screen.
- Profile is a hub with separate links to Account settings, Social profile, and Social settings. Account settings retain existing Auth/settings functions. Social settings write only community profile fields; username remains fixed. Privacy remains accepted-friends-only. Realtime refresh does not replace a dirty Social form.
- Login retains Google/email/sign-up/reset handlers. Its right panel introduces KimKim AI Studio without a large mascot or three feature chips. Bilingual copy and color modes share the same tokens.
- Social profile exposes actual post/friend data, profile-only highlights and grid/list tabs. Avatar story rings use the existing grouped story source. No invented follower counts.
- Story viewer is fullscreen, has segmented progress, arrows/tap navigation, hold-to-pause, swipe-down close, and a reply composer. Focusing the reply pauses progress. Replies use the owner's existing private thread and a stable message ID, keeping the draft after failure.
- Albums in feed and detail share `media-carousel.js`: native horizontal touch/trackpad scrolling with CSS snap, desktop drag, arrows, keyboard arrows/Home/End, counters and dots. Drag suppresses accidental detail opening. Album media comes from the authenticated post bundle endpoint, not just the first poster image.

## Validation

Node regression tests cover Home, shell, Notes, Calendar, community permissions/read receipts/drafts, post comments/likes, carousel interaction and story reply retry. Browser checks use synthetic fixture data, including 390px responsive layouts. Real iOS/Android hardware gestures and a second signed-in production account remain a recommended release smoke test.

PWA users with an older installed worker must apply the in-app Update action to activate the new cached shell. No Firebase rule changes or AI processing endpoint/model/prompt changes are part of this release.
