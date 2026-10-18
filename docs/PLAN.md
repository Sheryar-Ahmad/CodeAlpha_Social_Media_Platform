# Forma - delivery plan

## Purpose and design

Help people share work, learn together, collect useful references, and have clear conversations. The audience includes designers, developers, creators, students, professionals, and people sharing everyday perspectives. A white canvas, charcoal typography, restrained vermilion actions, local imagery, horizontal navigation, and focused discussions keep the interface simple.

## Delivered

1. Responsive visual gallery, semantic markup, topics, search, publishing, discussions, saves, follows, profiles, interests, and themes.
2. Real Express/MongoDB identity and persistent opaque sessions; shared posts/photos; authorized editing/deletion; private collections; generated activity; cursor pagination.
3. API security/integration tests, two-account browser checks, retained preview regression tests, restart persistence checks, and documented local setup.
4. Password changes with old-session revocation; individual and bulk session controls; personal data export; collection rename/removal; own-reply removal; a code guide and GitHub test/build workflow.
5. Email verification and password recovery, durable mail jobs, mutual blocking, private reporting, moderator decisions and suspension, account closure with retryable cleanup, community rules, and a prepared deployment configuration.
6. Free-only hosting configuration, signed Cloudinary photo uploads/deletions, Brevo HTTPS mail, provider-failure tests and a service-by-service launch guide. Live accounts and deployment are still required.

See [backend architecture](BACKEND.md) and [verification](VERIFICATION.md). The local preview remains at `/demo`; the root application uses server accounts.

## Next release milestones

| Milestone               | Delivery and acceptance                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Identity delivery       | Local flows are implemented; configure Brevo and verify real delivery on the deployed origin                         |
| Community operations    | Local safety tools are implemented; appoint a verified moderator and publish support/appeal contact                  |
| Account lifecycle       | Local closure and repeatable cleanup are implemented; validate on the host and set backup retention                  |
| Communication           | Private messages, conversation permissions, notification delivery, and real-time updates with reconnect behavior     |
| Hosted release          | Persistent MongoDB and media storage, HTTPS, backups, distributed limits, monitoring, deployment smoke tests         |
| Accessibility and scale | Assistive-technology review, Firefox/Safari checks, load tests, and relation-model migration when volume warrants it |

Implement each milestone with a clear acceptance check and simple modules. No external service accounts have been created and no hosted deployment has been performed.
