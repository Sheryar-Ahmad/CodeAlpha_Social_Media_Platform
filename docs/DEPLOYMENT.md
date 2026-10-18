# Deploy Forma on Vercel Hobby

Forma now has a Vite frontend and one Node API function on the same Vercel project. MongoDB Atlas stores data and jobs, Cloudinary stores photos, and Brevo sends email over HTTPS. The existing local Node development server remains available.

This setup uses **Vercel Hobby for a personal, non-commercial project**, plus the existing free service accounts. Quotas apply; no paid plan, hosting deployment, or billing change has been created. Do not select a Pro trial. See [Hobby](https://vercel.com/docs/plans/hobby) and [function limits](https://vercel.com/docs/functions/limitations).

## How the serverless deployment works

- `vercel.json` builds Vite and serves `dist` through the CDN. `/api/*` routes to `api/index.js`; `/demo` serves the browser preview. Security headers cover the static client. API headers additionally restrict photos to the configured cloud path.
- The API reuses a small MongoDB connection pool across warm requests. It does not start `server/index.js`, listen on a port, or start interval workers.
- Successful API responses schedule small mail/cleanup batches with Vercel `waitUntil`. Mail remains queued durably before the response, and leases prevent concurrent duplicate claims. Tasks share the function deadline and may be interrupted; later requests retry unfinished work.
- A protected daily cron at `/api/maintenance` catches up on idle work. Hobby permits once-daily schedules, so idle cleanup/retries can wait until the next daily run. Large backlogs may need more batches. The 03:00 UTC schedule is not an exact-time guarantee.
- Atomic rate limits live in MongoDB on Vercel, rather than being reset by each new function instance. Counters store hashed keys and expire automatically. Local development keeps memory limits.

Sources: [waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vite](https://vercel.com/docs/frameworks/frontend/vite).

## 1. Prepare private settings

The Atlas connection, Cloudinary upload/delivery/deletion, and a single Brevo email delivery were verified during local setup on 19 October 2026. These checks do not establish Vercel connectivity or a completed hosted application.

From the project directory run:

```powershell
npm run prepare:vercel
```

This reads the ignored local `.env`, validates required configuration, generates a private maintenance secret, and writes **`.data/vercel.env`** for import. It does not send emails or deploy anything. The file contains credentials; import it directly into Vercel rather than sharing it or committing it. `.data/`, `.env` and Vercel's local settings folder are ignored by Git and deployment uploads.

The import file sets `NODE_ENV=production`, `MEDIA_STORE=cloudinary`, `MAIL_MODE=brevo`, `TRUST_PROXY_HOPS=1`, verification on, sample seeding off, plus your six service settings and `CRON_SECRET`. The frontend gets no `VITE_*` credentials. Local preview mail remains unchanged.

## 2. Connect GitHub and import

1. Sign up/log in to [Vercel](https://vercel.com/) with GitHub. Choose the personal **Hobby** plan.
2. Import `Sheryar-Ahmad/CodeAlpha_Social_Media_Platform`. Use the repository root; this repository contains only Forma.
3. Keep framework **Vite**, build `npm run build`, output `dist`, and Node **24.x**. The committed install command includes build dependencies. `/api/index.js` must be deployed along with the client; this is not a frontend-only deployment.
4. Import `.data/vercel.env` into **Production** environment variables. If the creation screen applies imports to all environments, adjust the scopes in Project Settings before allowing preview deployment access. Do not give preview deployments the production database or live mail key.
5. Keep automatic system environment variables exposed. The server derives its canonical origin from `VERCEL_PROJECT_PRODUCTION_URL` only in a production Vercel environment. You can set `APP_ORIGIN` explicitly to the exact HTTPS production URL if needed. Origins must have no trailing slash or path. The server never trusts an incoming Host header or an arbitrary preview URL for this value.
6. Deploy the latest passing commit. Verify the frontend loads and `/api/health` returns HTTP 200 with `{"status":"ok"}` after network access is configured below.

Use the canonical production domain for sign-in and email links. Hash routes stay client-side. Preview APIs deliberately fail closed without separate preview configuration. Protect previews through Vercel's available deployment settings. See [environment scopes](https://vercel.com/docs/environment-variables) and [system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

## 3. Configure provider network access

Vercel Hobby uses **changing outbound IP addresses**, so approving your computer's IP alone does not allow the deployed API. Fixed outbound IP services are outside this free-only setup. See [Vercel outbound networking](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address).

### MongoDB Atlas

In the **Forma project only**, Network Access must accept Vercel's dynamic connections. The standard free setup uses `0.0.0.0/0` (Allow Access from Anywhere). This permits network connection attempts from the internet; MongoDB authentication and TLS are still required. Use a dedicated database user limited to read/write on `forma`, rather than using an Atlas Admin role for the application. Do not change Orbit's project or cluster. If you require a fixed IP allowlist, this deployment arrangement needs a different network solution and should not be treated as ready.

No Atlas network/security setting is changed by the preparation script. Make the network choice explicitly in Atlas. See [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/) and [Atlas/Vercel integration](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/).

### Brevo

The local test approved only the computer's IP. Brevo's unknown-IP blocking can therefore reject Vercel requests even when the key is correct. In Brevo Settings → Security → Authorized IPs, review its automatic authorization options. For unrestricted dynamic egress, API access must not rely on a fixed IP allowlist; disabling unknown-IP blocking removes that extra restriction while keeping API-key authentication. Make this security choice explicitly in Brevo; the preparation script does not change it. Do not repeatedly approve arbitrary unknown IPs without identifying the deployment request.

See [Brevo IP security](https://developers.brevo.com/docs/ip-security). The key needs Transactional email access; unrelated permissions can remain None. Keep the verified sender as `MAIL_FROM`. Brevo can rewrite a free-mailbox sender address, as observed in the inbox delivery test.

## Maintenance, data and limits

`CRON_SECRET` authenticates the maintenance endpoint through a Bearer header. Vercel supplies this for its production cron. A bare browser request should return 401. The same secret must be present in Production settings; do not publish or embed it in client code. Monitor cron status and function errors in Vercel.

Photo uploads retain their 2 MB input limit and are converted to WebP before upload. Their JSON/base64 requests stay below Vercel's 4.5 MB request limit. Downloaded exports can grow larger than the response limit; verify large exports before assuming they work on the host. Media URLs are public; removal requests CDN invalidation, which takes time and cannot recall downloaded copies.

Watch Atlas storage/connection usage, Cloudinary credits, Brevo daily sends, and Vercel usage. A quota or function timeout can interrupt work; bounded jobs remain pending for later requests/cron. Review stuck `deleting` accounts, `mediadeletions` and failed mail jobs. Errors log types/status codes, not credentials or email bodies. Do not upgrade a service automatically to bypass limits.

Confirm backup features on the actual Atlas Free cluster. Its [free backup preview](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/) may not be available. Otherwise arrange encrypted local `mongodump` archives and private photo copies; no paid backup worker is created. Pause writes/jobs for consistent recovery points, test restores in isolated storage, and publish the actual retention period. Restores must reapply later account closures/moderation decisions before reopening traffic. Code rollback does not undo data changes.

## First moderator

Register and verify your account on the deployed production domain. Use your local project, whose private `.env` points to Forma Atlas, and allow your current IP if needed:

```powershell
npm run moderator -- grant your_handle
```

Reload the deployed app, then open Profile → Account settings → Open moderation queue. Only an existing verified member can be promoted; no default moderator password exists. `revoke` removes the role; `restore` reactivates a suspended member without restoring sessions. Set a real support/appeal contact before inviting members.

## Hosted acceptance check

Verify real registration email, confirmation, recovery, photo posting, replies/reactions/follows, private saves, blocking, moderation and closure with separate browsers. Confirm API routes return JSON, data/photos persist across deployments, cron rejects missing credentials, daily maintenance runs, and old sessions fail after reset/suspension. Check keyboard/mobile behavior and backups. Record the live URL/results in `VERIFICATION.md`. Until those checks pass, the project is prepared for Vercel but not a verified hosted release.
