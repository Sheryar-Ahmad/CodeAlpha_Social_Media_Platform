# Forma 0.4 verification

Checked on 16 October 2026 with Node.js 20.19.2, installed MongoDB 9.0.2, and headless Microsoft Edge.

## Automated checks

- `npm test`: 42 tests pass (21 state tests and 21 API integration tests).
- Account integration checks cover cross-account session isolation, individual and bulk revocation, current-password verification, stale-version rejection, concurrent password changes, collection rename/removal consistency, reply ownership, and private data export.
- API checks cover hashing and opaque session storage, hostile origins, private/public fields, ownership, duplicate registrations, idempotent and concurrent follows/bookmarks, replies, stale-edit conflicts, collections, cursor pagination, literal search, image conversion, deletion, logout, expired/forged cookies, production configuration, and sanitized database-outage errors.
- A full MongoDB stop and restart on the same temporary disk directory preserves accounts, sessions, posts, replies, bookmarks, collections, interests, and themes.
- `npm run test:live`: two isolated browser accounts register and share a post; a failed publish preserves its draft; the second account reacts, replies, follows, and saves privately. Activity/read state, owner editing with preserved replies, profile changes, logout/login, theme persistence, and live-account isolation from localStorage pass.
- Additional browser checks cover collection rename/removal while keeping bookmarks, reply-removal cancellation/confirmation, password confirmation, revocation of a second browser session, a JSON data download, and account-dialog overflow at 390/320 px.
- `npm run test:browser`: retained preview checks cover gallery/landmarks, posting, reactions, conversations, collections, editing/deletion, search, interests, ordering, profiles, themes, activity, uploads, focus containment, mobile search, storage recovery/migration/quota errors, direct links, and runtime errors.
- Preview screens are checked at 1024, 768, 620, 390, and 320 px; the shared feed is checked at desktop, 390, and 320 px without page overflow.
- `npm run build`: production client bundle builds successfully.
- `npm audit --omit=dev --audit-level=high`: zero known runtime dependency vulnerabilities after updating Sharp to 0.35.5. The upload conversion tests pass with the updated library.

Tests use temporary isolated databases and browser contexts; they do not modify development accounts. Temporary test servers and browser processes close after testing. Development data is kept separately in ignored `.data/`.

## Visual review

Reviewed `test-results/auth.png`, `live-desktop.png`, `live-mobile.png`, `account-desktop.png`, and `account-mobile.png`. Retained preview desktop, phone, and dark-theme screenshots are also generated. The interface preserves a simple content canvas, restrained accent, readable hierarchy, local imagery, and original graphic studies.

The 16 October graphics refresh adds the reusable collage, botanical and geometric motifs, topic icons/colors, white card frames, and saved-state feedback. Preview browser workflows pass across 1024/768/620/390/320 px after correcting a decorative-art overflow at tablet width. Shared-account browser workflows and the production build also pass. Additional visual captures are `graphic-note.png`, `graphic-explore.png`, and `graphic-dark.png`.

## Boundaries

Firefox/Safari, screen-reader use, a formal accessibility audit, load testing, and hosted deployment remain unverified. The GitHub workflow runs tests and the build; hosted results are available in the repository's Actions tab. Email verification/recovery, reporting/moderation, account deletion, direct messages, real-time delivery, and hosted media storage are not implemented. See [the release roadmap](PLAN.md).
