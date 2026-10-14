# Forma — product roadmap

## Purpose

Help people share work, learn from each other, collect useful references, and join clear conversations. The audience includes designers, developers, creators, students, professionals, and people sharing everyday perspectives. The current working name is Forma.

## Design

The visual direction and implementation boundaries are in [REDESIGN.md](REDESIGN.md). A white canvas, charcoal typography, restrained vermilion actions, strong imagery, horizontal navigation, and focused discussions replace the previous dashboard structure.

## Delivery phases

| Phase                                        | Outcome                                                                                                                                                                                                                       | Acceptance                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — local foundation and redesign (complete) | Responsive React/Vite app; relevance/chronological feeds; six topics; search; photo/text posts; own-post editing/deletion; replies; reactions; saved collections; follows; profile; sample activity; interests and appearance | Local workflows and migration pass; invalid input and storage failures are handled; desktop/mobile layouts are inspected; production build succeeds |
| 2 — secure identity and database             | Express API, MongoDB models, registration/sign-in/sign-out, session security, database-backed profiles/posts/follows                                                                                                          | Two separate accounts retain independent data; unauthorized reads/writes fail; records survive server restarts                                      |
| 3 — shared conversations and media           | Persisted replies/reactions/collections; cursor pagination; validated uploads; read notifications; reporting and moderation                                                                                                   | Every write is validated; uploads are bounded; ownership and visibility checks pass; loading/empty/error states are verified                        |
| 4 — release                                  | Integration tests, accessibility review, performance checks, deployment, documentation and demonstration                                                                                                                      | Production smoke tests pass; configuration, limitations, and main user journeys are documented                                                      |

## Current boundaries

This phase saves data only in the browser. It does not authenticate people or communicate with other devices. It has no production credentials, placeholder login, or fake live delivery. See [README.md](../README.md) for the code map, algorithm, setup, and manual checks.

## Backend design to implement next

- Routes: `/api/auth`, `/api/users`, `/api/posts`, `/api/follows`, `/api/collections`, `/api/notifications`.
- Entities: User, Session, Post, Comment, Follow, Reaction, Bookmark, Collection, Notification.
- Design HttpOnly session cookies, origin/CSRF checks, expiration, password hashing, and deployment topology together before implementation.
- Validate types and limits on the server; derive authors from sessions; enforce ownership on each edit/delete. Local author checks are UI consistency checks, not production authorization.
- Use explicit query allowlists and unique indexes for handles, follows, reactions, and bookmarks. Index chronological feeds and use bounded cursor queries.
- Store validated media outside MongoDB with documented size/type limits and deletion rules.
- Preserve existing UI boundaries while replacing the local storage layer with an API. Agree on any genuinely new backend feature scope separately.

Direct messaging, real-time delivery, and more advanced recommendation services are later candidates, after identity and authorization are stable. The priority is useful, reliable features with simple code.

## Repository and deployment

Keep work inside this project. The parent repository's remote belongs to another application; do not push this project to that remote. No hosted Site registration or deployment is part of this local redesign.
