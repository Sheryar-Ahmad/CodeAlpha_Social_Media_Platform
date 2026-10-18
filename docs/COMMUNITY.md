# Community rules and data lifecycle

Forma is for sharing useful ideas, work and everyday perspectives. Be respectful, describe photos clearly, and give constructive feedback. Do not post spam, harassment, hateful attacks, sexual exploitation, threats, dangerous instructions, or other people's private information. Share only content you have permission to publish.

## Reports and blocking

Members can report a post from its discussion view or report a member from their profile. A report is visible only to verified moderators and service operators. It is a request for review, not an automatic punishment. Duplicate reports by the same member on the same target are combined. Do not include unnecessary personal information in report details.

Blocking hides the two members' profiles, posts and replies from one another in application reads, prevents following and interacting with the hidden posts, and removes both follow connections. Unblocking restores visibility without restoring follows. It does not erase previously downloaded information or revoke a known public media URL. Blocking is not a private-photo access control.

Moderators can dismiss reports, remove a reported post and its photo, or suspend the reported member. Suspension revokes sessions, prevents sign-in and hides their content. It retains data for operator review; it is different from deletion. Moderator accounts can be suspended only through a separate operator process. Operators can restore an ordinary suspended account with the documented CLI after review. Establish a monitored support contact and an appeal process before public launch; none is invented or implied by the application.

## Retention

- Unresolved reports remain until reviewed. Closed reports and review notes expire approximately 90 days after review through MongoDB's asynchronous TTL cleanup. Closed-account cleanup removes reports submitted by that account and reports targeting its member profile. Reports about its removed posts can retain the opaque post ID and submitted report details until review and expiry; the post's original content is cleared.
- Account closure requires the current password and typing DELETE. The account becomes unavailable immediately and all sessions are revoked. After a one-minute grace period, bounded background work clears its contributions, comments, reactions, follows, saves, notifications, pending mail, and uploaded post photos. Failed cleanup is retried on later ticks/restarts. This is irreversible; export first.
- The database retains a minimal account tombstone (opaque ID, replacement name/handle/email, status and timestamps) and empty deleted-post records to keep references stable. Password hashes, original email/name/bio/photo, token hashes, and private account arrays are removed from the closed account. Replies and activity in other accounts are also cleared. The tombstone is not an active profile.
- Uploaded media is publicly accessible to anyone with its URL. Removal clears the origin file through a retryable queue; browser/CDN caches and downloaded copies can outlive removal. Backups are separate copies governed by the operator's published retention and restore procedure.
- With cloud storage enabled, browsers load photos directly from Cloudinary. Verification/recovery mail passes through the configured provider. On Vercel, cleanup runs in bounded batches after successful API requests and through protected daily maintenance. Idle cleanup can wait for that daily run; large backlogs can take additional batches.
- Session records expire after seven days; password reset links after 30 minutes; verification links after 24 hours. Mail jobs contain no raw link/token and expire seven days after their last update. Development email previews contain working links in ignored `.data/mail`; keep them private and remove them when no longer needed.

The live operator must publish an actual support address, backup retention, and any locally required terms/privacy notices before opening registration publicly. This document describes implemented behavior, not a legal compliance certification.
