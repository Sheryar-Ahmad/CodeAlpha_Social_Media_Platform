# Shared application milestone

## Delivery

Connect the current interface to a real Express/MongoDB application: registration, sessions, shared posts/photos, replies, follows, reactions, private bookmarks/collections, profiles, preferences, and activity. Keep the old local experience at `/demo`; do not silently import browser data into an account.

## Architecture decisions

- One origin: Vite proxies `/api` and `/media` to Express in development; Express serves the built client in production.
- MongoDB persists application data and opaque sessions. The server derives every author/owner from the authenticated session.
- Writes require majority and journal acknowledgement before success is returned, including on the standalone development database. Restart tests cover acknowledged changes immediately before process shutdown.
- Passwords use asynchronous Node scrypt with random salts and OWASP's `N=2^17, r=8, p=1` parameters. Session cookies are HttpOnly, SameSite=Lax, and Secure in production; only token hashes are stored in MongoDB.
- Mutations require the configured Origin, including registration and login. No wildcard CORS or browser-stored credentials.
- User documents contain bounded private preferences: follows, bookmarks, collections, and activity. Post documents contain bounded reactions and replies. Atomic updates enforce uniqueness/limits; soft deletion hides a post before preferences are reconciled. These bounds keep the first shared release understandable; separate relation/comment models are a later scaling step.
- Edits use a revision check to prevent silent overwrites from another tab. Likes, follows, and saves use idempotent PUT/DELETE endpoints.
- Images are decoded, pixel/byte bounded, stripped of metadata, resized, and encoded as WebP outside MongoDB. Uploaded GIFs become still photos. User input cannot supply arbitrary media URLs.
- Feed queries are bounded and cursor-paginated; searches and topic filters run on the server. Recommendation scores favor interests, follows, and recent work. Public responses never contain email, password hashes, session hashes, or private collections.

## Development data

`npm run dev` uses `.env` when configured. Without a URI it starts an actual MongoDB process on loopback with persistent data under ignored `.data/`. Production requires an explicit MongoDB URI and HTTPS application origin. Starter posts are explicitly marked sample content; those sample identities cannot sign in. Test databases are isolated from development data.

## Acceptance checks

Two accounts can register, sign in independently, share posts/replies, and receive activity. Only the owner can edit/delete a post. Bookmarks and collections remain private. Logout revokes the server session. Invalid input, hostile origins, duplicate registrations, stale edits, oversized/unreadable photos, expired cookies, and database failures have clear responses. Account data survives a server/database restart. Existing preview workflows still pass at `/demo`.

## Release work after this milestone

Password changes verify the existing password, atomically replace its hash, increment the user's session version, and rotate the current cookie. Authentication rejects older versions even if session cleanup is interrupted. Session lists expose friendly browser labels and dates, not tokens or precise location. Each account retains at most 20 sessions.

The authenticated JSON export streams records through database cursors. It includes the owner's account data, posts, replies, liked post IDs, follows, collections, and activity; it excludes password/session hashes and other members' private data. Photos are absolute links, not copied files. The browser assembles the downloaded JSON in memory. Export is not a database backup or import format and is not a transactional snapshot during concurrent writes.

Collection deletion atomically removes the collection and clears its assignments while preserving bookmarks. Only a reply's author can remove it; post authors cannot remove another member's reply through this endpoint.

Version 0.5 adds verification and recovery through `routes/recovery.js` and `services/mailQueue.js`. Raw tokens are created only during delivery; MongoDB stores hashes and expiring single-use challenges. Recovery atomically changes the password and session version without automatically signing in. Private development mail previews replace a real provider only outside production.

Version 0.5.1 supports Cloudinary storage and Brevo HTTPS delivery without additional packages. `services/cloudImages.js` signs uploads/deletions on the server; `media.js` still validates, strips metadata and converts uploads first. Browser image policy allows only the configured cloud path. `services/mailer.js` selects preview, SMTP or Brevo; provider secrets remain on the server. Remote deletion is queued and retried without delaying post/moderation responses. Local storage and preview mail remain the development defaults. The free host's workers pause during sleep and resume durable jobs after waking.

`services/visibility.js` centralizes mutual-block and inactive-account checks for feeds, direct posts, member search/profiles and replies. `routes/safety.js` handles private deduplicated reports and verified moderator review with bounded leases. Roles are operator-managed through `scripts/moderator.js`, never registration/profile input. Suspensions revoke sessions and hide content.

Account closure marks the account inactive before background work. `services/accountRemoval.js` processes bounded repeatable batches after a short grace period. `postRemoval.js` queues photo deletion before clearing content and reconciles saved references. The worker retries failed file removal and leaves a minimal anonymous account record. See [retention](COMMUNITY.md) and [deployment/operations](DEPLOYMENT.md). Cross-document cleanup is eventually consistent rather than a single transaction.

Version 0.6 adds `api/index.js` and `server/serverless.js` for Vercel. The API keeps a warm connection pool, returns responses before bounded jobs, and registers their promises through `waitUntil`. It starts no listener/timer on Vercel. A Bearer-protected once-daily cron runs a larger catch-up batch. Mail claims are leased and removal is repeatable across instances. Provider jobs may still be interrupted by runtime limits and resume on another request/cron.

`rateLimit.js` uses atomic MongoDB counters for serverless instances, with hashed keys and expiry. Local Node uses the existing memory limits. `vercel.json` routes the frontend and API under one origin and gives static HTML its own security headers; static image policy allows the Cloudinary host, while API middleware restricts the configured cloud path. `scripts/prepareVercel.js` creates an ignored private Production import file without changing local mail mode or contacting providers.

Provider connectivity and one inbox delivery were checked locally. Vercel deployment/network access, backup restoration, direct messaging and real-time delivery remain outstanding.

References: [Express security](https://expressjs.com/en/advanced/best-practice-security/), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [MongoDB atomic writes](https://www.mongodb.com/docs/manual/core/transactions/), and [Mongoose connections](https://mongoosejs.com/docs/connections.html).
