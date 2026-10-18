# Launch Forma

## Deployment shape

Use one persistent Node service for Express, the built React client, mail delivery, and cleanup jobs. MongoDB Atlas stores accounts and community data. A persistent disk stores photo files. This keeps one origin and the code easy to follow.

`render.yaml` is a prepared **paid** Render option, not a deployment. Review the service and disk price in Render before creating anything. It selects Singapore, Node 24, one instance, a 1 GB disk, a health check, and manual deployments. No cloud resources or credentials have been created. A free-only launch requires a separate durable photo-storage adapter before using an ephemeral web host.

Render documents that disks are attached to paid services, survive restarts, and limit the service to one instance. Deployments with a disk have a short interruption. See [persistent disks](https://render.com/docs/disks) and the [Blueprint reference](https://render.com/docs/blueprint-spec). Vercel can run Express, but this application's disk writes and interval workers need different storage and job scheduling there; see [Express on Vercel](https://vercel.com/docs/frameworks/backend/express) and [function limits](https://vercel.com/docs/functions/limitations). Do not deploy only the Vite client and expect accounts to work.

## Account setup

1. Create a MongoDB Atlas account and a database named `forma`. Create a dedicated database user with read/write access only to that database. Store its URI in your private environment settings. Use the host's outbound IP addresses in Atlas Network Access; avoid allowing the entire internet. Choose an Atlas region close to the web host. [Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-your-application/).
2. Create an SMTP delivery account and verify a sender address/domain. Obtain its SMTP host, port, username and password. Configure the provider's required DNS records. Store credentials directly in environment settings, never Git, screenshots or chat.
3. Connect the GitHub repository to your chosen host. For Render, review the Blueprint and cost, then supply each prompted environment value. Use the exact assigned HTTPS URL for `APP_ORIGIN`, with no trailing slash, path, or fragment. If it is unknown at creation, set it before inviting members and restart the service.
4. The upload disk must be attached at `/var/data/forma`; `UPLOAD_DIR=/var/data/forma/uploads`. Keep one service instance. Render's proxy configuration is one trusted hop; recheck if adding another proxy or CDN. For another host, set the actual hop count.
5. Set `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. Port 587 uses `SMTP_SECURE=false` with mandatory STARTTLS; port 465 uses `SMTP_SECURE=true`. Follow your provider's settings. Production refuses mail previews and missing SMTP settings.
6. Run the build and start commands in the Blueprint. Check `/api/health` returns HTTP 200 with `{"status":"ok"}`. A database outage returns 503. This endpoint does not test email delivery or free disk space.

Keep `REQUIRE_VERIFIED_EMAIL=true` and `SEED_STARTER_CONTENT=false` for launch. Production uses Secure HttpOnly cookies, so test through HTTPS. Local `.env.example` is intentionally development configuration; do not copy its preview mail mode into production.

## First moderator

Register your real account, verify its email, then run this command in the service shell, which has the production database environment:

```sh
npm run moderator -- grant your_handle
```

Only an existing verified member can be promoted. No default moderator password exists. Sign in/reload, open Profile → Account settings → Open moderation queue. Operators can use `revoke your_handle` or `restore suspended_handle`; restoration does not restore previous sessions. Review [community rules and retention](COMMUNITY.md) before inviting members.

## Operations

- Set an external uptime check for `/api/health` and enable host failure notifications. Watch memory, disk capacity, repeated 503 responses, `Mail delivery failed`, `Mail worker unavailable`, and `Cleanup will retry` logs. Do not log connection strings or message bodies.
- Mail jobs use database leases, three attempts with backoff, and token hashes. Verification expires after 24 hours; password recovery after 30 minutes. A member can request another message after the resend cooldown. A transport timeout can cause duplicate email; only the most recently issued link remains valid. Mail job records expire seven days after their last update. Check failed job counts privately in MongoDB, without dumping messages or tokens.
- Account cleanup starts after a one-minute grace period, runs every ten seconds, and processes bounded batches. A server restart resumes pending deletions and media tasks. Monitor users remaining in `deleting` and growing `mediadeletions`; investigate if these stay pending. Closed accounts remain hidden during retries.
- Enable a database backup schedule appropriate to the selected Atlas tier and review its retention. If the tier lacks managed backups, arrange encrypted `mongodump` archives with a dedicated backup process. Use the official [MongoDB backup guide](https://www.mongodb.com/docs/manual/core/backups/); never place archives in the repository or public uploads.
- Back up uploaded photos as well as MongoDB. Render provides disk snapshots, but those are not a synchronized database backup. For a consistent recovery point, pause writes and workers, take the database backup and photo copy together, then resume. Test restoration into an isolated database and upload directory, never over the live service as a test. Record the backup time and retention period.
- Restoring a backup can restore deleted records. Before reopening traffic, reapply account closures and moderation actions since that backup. Session cookies and email tokens should be invalidated after a security-related restore. Set and publish the operator's backup retention before public launch.
- Deploy manually after CI passes. Keep the previous commit and a backup available. Roll back code to that commit if necessary; database/content changes do not roll back with code. Schema additions in this release are additive; startup fills missing account status and role fields.

Rate limiting is in memory and intended for one service instance. Adding replicas requires shared rate limits and external object storage. This release has no direct messages or real-time delivery.

## Hosted acceptance check

Before calling the release complete, use two separate browsers to verify registration, actual email delivery, confirmation, forgotten-password recovery, posting a photo, reactions/replies/follows, private saves, block/unblock, moderator removal, and account closure. Confirm a restart retains accounts and photos, an old session fails after reset/suspension, and a removed photo returns 404 from the origin. Previously downloaded/cached copies cannot be recalled. Confirm mobile layout, keyboard use, and the backup restore procedure. Record the live URL, host settings and results in `VERIFICATION.md`; local tests cannot establish hosted behavior.
