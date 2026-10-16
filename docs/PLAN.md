# Forma - delivery plan

## Purpose and design

Help people share work, learn together, collect useful references, and have clear conversations. The audience includes designers, developers, creators, students, professionals, and people sharing everyday perspectives. A white canvas, charcoal typography, restrained vermilion actions, local imagery, horizontal navigation, and focused discussions keep the interface simple.

## Delivered

1. Responsive visual gallery, semantic markup, topics, search, publishing, discussions, saves, follows, profiles, interests, and themes.
2. Real Express/MongoDB identity and persistent opaque sessions; shared posts/photos; authorized editing/deletion; private collections; generated activity; cursor pagination.
3. API security/integration tests, two-account browser checks, retained preview regression tests, restart persistence checks, and documented local setup.
4. Password changes with old-session revocation; individual and bulk session controls; personal data export; collection rename/removal; own-reply removal; a code guide and GitHub test/build workflow.

See [backend architecture](BACKEND.md) and [verification](VERIFICATION.md). The local preview remains at `/demo`; the root application uses server accounts.

## Next release milestones

| Milestone               | Delivery and acceptance                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Identity recovery       | Verified email and password reset through a configured mail provider; expiring, single-use tokens; abuse controls and recovery tests |
| Community safety        | Reporting, blocking, moderator roles and queue; ownership/role checks; clear moderation policy                                       |
| Account lifecycle       | Account deletion with documented retention, interruption recovery, and media cleanup; export and session controls are implemented    |
| Communication           | Private messages, conversation permissions, notification delivery, and real-time updates with reconnect behavior                     |
| Hosted release          | Persistent MongoDB and media storage, HTTPS, backups, distributed limits, monitoring, deployment smoke tests                         |
| Accessibility and scale | Assistive-technology review, Firefox/Safari checks, load tests, and relation-model migration when volume warrants it                 |

Implement each milestone with a clear acceptance check and simple modules. No external service accounts have been created and no hosted deployment has been performed.
