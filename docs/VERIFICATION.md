# Forma 0.2 verification

Checked on 14 October 2026 with Node.js 20.19.2 and headless Microsoft Edge.

## Automated checks

- `npm test`: 19 tests pass, including ranking, author diversity, chronology, exact topics, migration, ownership consistency, collection cleanup, persistence, invalid types, and corrupted storage.
- `npm run test:browser`: gallery/landmarks; publishing; reactions; focused conversations; replies surviving reload; collections and duplicate-name errors; own-post editing/deletion/cancellation; search; follows; selected-interest ranking; chronological/popular alternatives; profile; appearance; activity; photo descriptions; upload size/decode errors; focus containment; mobile search; storage migration/recovery/quota errors; direct/malformed links; no page runtime errors.
- All five screens and the composer checked at 1024, 768, 620, 390, and 320 px without page overflow. Desktop checked at 1440 px.
- `npm run build`: production bundle builds successfully.

## Visual review

Desktop gallery, phone gallery, and dark appearance screenshots are in the ignored `test-results/` directory and were inspected. The redesign uses one main content canvas, real local imagery, original graphic studies, a restrained accent color, and a clear page hierarchy.

## Boundaries

Verification covers the browser-local product in Chromium. Firefox/Safari, screen-reader use, and a formal accessibility audit remain unverified. No authentication, API, shared database, or hosted release is present in this phase. Tests use isolated browser contexts and do not edit the user's browser data. Temporary test servers and browser processes are closed after testing.
