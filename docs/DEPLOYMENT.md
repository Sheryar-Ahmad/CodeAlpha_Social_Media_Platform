# Launch Forma using free services

The setup uses **free plans only**. No accounts, cloud resources or deployment have been created. Select free plans rather than paid trials; do not enable automatic paid upgrades. Verify the plan shown before creating any resource.

## Services

| Service                              | Purpose                                                | Free-plan boundary                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Render Free                          | Express, React and background jobs on one HTTPS origin | Sleeps after 15 idle minutes; waking takes about a minute. Free hours, bandwidth and build limits apply. No persistent disk or outbound SMTP. |
| MongoDB Atlas Free                   | Accounts, sessions, posts, reports and durable jobs    | 512 MB includes data and indexes; connection and transfer limits apply.                                                                       |
| Cloudinary Image and Video APIs Free | Durable photo storage and CDN delivery                 | 25 shared monthly credits cover storage, bandwidth and transformations. Choose the API free plan, not the separate DAM trial.                 |
| Brevo Free                           | Verification and recovery email over HTTPS             | Up to 300 sends per day; sender verification and transactional-sending activation required.                                                   |

Sources checked 18 October 2026: [Render Free](https://render.com/docs/free), [SMTP restriction](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports), [Atlas limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [Atlas storage](https://www.mongodb.com/docs/atlas/manage-clusters/), [Cloudinary pricing](https://cloudinary.com/pricing), [Brevo limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

This supports a low-traffic project with sleep and quota limits. Jobs remain in MongoDB during sleep/restarts and resume when the service wakes. Do not use artificial traffic to bypass sleep. If a quota is exhausted, pause usage or wait for its reset rather than buying an upgrade automatically.

## 1. MongoDB Atlas Free

Create an [Atlas account](https://www.mongodb.com/cloud/atlas/register), choose a **Free** cluster, and prefer a region near Singapore. Create a database user with read/write access limited to the `forma` database. Store the driver connection URI privately with `/forma` as the database name. Follow Atlas instructions for percent-encoding special characters in credentials.

In Network Access, allow the Render service's outbound IP ranges once it exists. Temporarily allow your current IP if using the moderator CLI locally. Avoid broadly opening access as a shortcut. See [Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-your-application/) and [Render outbound addresses](https://render.com/docs/outbound-ip-addresses).

## 2. Cloudinary Free

Choose **Image and Video APIs Free**, then obtain the cloud name, API key and API secret from the product environment's API settings. These belong only in private server settings: never React, `VITE_*` variables, Git, screenshots or chat. No unsigned upload preset is needed.

Forma validates and converts photos to bounded WebP files before signed HTTPS uploads. Public IDs use UUID names under `forma/`. Posts store public CDN URLs, so restarting Render does not lose photos. Deletion jobs target matching UUID assets in the configured cloud and request CDN invalidation. Keep the cloud identity stable; changing it requires migrating photos and pending jobs. Existing local disk photos are not automatically migrated.

## 3. Brevo Free

Create a [Brevo](https://www.brevo.com/) free account, activate transactional sending, verify a sender email address you control, and generate an API key. Use an API key rather than an SMTP password. `MAIL_FROM` must be the plain verified email address; Forma supplies its display name.

A paid domain is not required by this project configuration. Brevo may replace a free-mailbox or unauthenticated sender with a compliant address. Follow its approval instructions and test delivery. See [sender setup](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email), [sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders), and [HTTPS API](https://developers.brevo.com/reference/send-transac-email).

Render Free blocks SMTP ports; `MAIL_MODE=brevo` uses HTTPS instead. Local development keeps private file previews and sends no real email.

## 4. Render Free

Connect the GitHub repository to [Render](https://render.com/). The committed `render.yaml` selects `plan: free`, Node 24, Singapore, manual deployments and `/api/health`, with **no disk or paid service**. Review the displayed plan before creating it. If the Blueprint flow is unavailable, create a Web Service manually:

```text
Runtime: Node
Instance: Free
Build: npm ci --include=dev --no-fund && npm run build
Start: npm start
Health check: /api/health
Automatic deployments: Off
```

Enter these directly in Render's private Environment settings, never Git or chat:

| Variable                 | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                |
| `NODE_VERSION`           | `24`                                                        |
| `APP_ORIGIN`             | Exact assigned HTTPS Render URL, no trailing slash or path  |
| `MONGODB_URI`            | Private Atlas URI for `forma`                               |
| `TRUST_PROXY_HOPS`       | `1` for this direct Render setup; recheck if adding proxies |
| `SEED_STARTER_CONTENT`   | `false`                                                     |
| `REQUIRE_VERIFIED_EMAIL` | `true`                                                      |
| `MEDIA_STORE`            | `cloudinary`                                                |
| `CLOUDINARY_CLOUD_NAME`  | Cloudinary cloud name                                       |
| `CLOUDINARY_API_KEY`     | Private Cloudinary API key                                  |
| `CLOUDINARY_API_SECRET`  | Private Cloudinary API secret                               |
| `MAIL_MODE`              | `brevo`                                                     |
| `BREVO_API_KEY`          | Private Brevo API key                                       |
| `MAIL_FROM`              | Verified sender email address                               |

If the assigned URL is initially unknown, set the actual `APP_ORIGIN` and restart before testing accounts. Allow Render's outbound ranges in Atlas, deploy the latest passing commit, and check `/api/health` returns HTTP 200 with `{"status":"ok"}`. Database outages return 503. Health does not validate email delivery or provider quotas.

Keep the frontend and API together on Render. A separate Vercel frontend adds cross-origin session configuration without helping this setup. `npm run preview` serves only the static client, not the shared application.

## First moderator without a paid shell

Render Free has no interactive service shell. Register and verify your real account on the deployed site. On your computer, temporarily set `MONGODB_URI` in the ignored local `.env` to the Atlas URI, allow your current IP in Atlas, and run from the project directory:

```powershell
npm run moderator -- grant your_handle
```

Only an existing verified account can be promoted. Reload the deployed app, then open Profile → Account settings → Open moderation queue. Restore the local development configuration afterwards if needed. Operators can also `revoke your_handle` or `restore suspended_handle`; restoration does not restore sessions. No default moderator password exists. Establish a real support/appeal contact before public launch.

## Operations and recovery

- Enable free provider quota/failure notifications and review dashboards. Watch HTTP failures, memory and `Mail delivery failed`, `Mail worker unavailable`, or `Cleanup will retry` logs. Never log credentials or message bodies. Treat sleeping service delays as a free-tier limitation.
- Mail jobs use leases, three attempts and backoff. Verification expires after 24 hours, recovery after 30 minutes, and jobs seven days after their last update. A timeout can produce duplicate email; only the latest issued link is valid. Request a fresh link after a provider's daily sending quota resets if retries failed.
- Closure hides accounts immediately. Cleanup starts after a one-minute grace period and processes bounded batches every ten seconds while awake. Remote photo deletion stays queued so API responses do not wait for a CDN. Failed tasks retry and rotate through the queue. Investigate growing `mediadeletions` or accounts stuck in `deleting` while the service is awake.
- Confirm backup availability on the actual Atlas Free cluster. [Free backup preview](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/) is gradually rolling out and is not assumed. If unavailable, arrange encrypted `mongodump` archives on your machine using the [official guide](https://www.mongodb.com/docs/manual/core/backups/). No paid backup job is provisioned.
- Keep a separate private photo copy if recovery of deleted assets is required. Cloudinary Free is not a project-tested backup guarantee. Pause writes/workers for a consistent database/photo recovery point; test restoration into isolated storage rather than over live data. Publish the actual retention period.
- Backups can resurrect deleted records. Reapply closures and moderation actions before restoring traffic; revoke sessions and recovery tokens after security-related restoration. Deploy manually after CI passes and keep the previous known-good commit. Code rollbacks do not undo content changes.

Rate limits remain in memory for one service instance. Direct messages and real-time delivery are future features. Review [community rules and retention](COMMUNITY.md) before inviting members.

## Hosted acceptance check

Use separate browsers to check actual email delivery, verification, recovery, photo posting, reactions/replies/follows, private saves, blocking, moderation and closure. Confirm a Render restart preserves accounts and cloud photos. Check old sessions fail after reset or suspension. Allow for CDN invalidation delay when testing deleted media; downloaded copies cannot be recalled. Review keyboard/mobile behavior, quota dashboards and backup restoration. Record the live URL/results in `VERIFICATION.md`; simulated provider tests do not prove a live integration.
