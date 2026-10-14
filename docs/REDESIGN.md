# Forma — design and product rebuild

## Purpose

A visual social space to share work, learn, collect references, and discuss everyday ideas. It serves creators, students, professionals, and a general community. The name is a working product identity, not a claim of trademark availability. The product should help a visitor find something useful, save it, follow its author, or contribute feedback.

## What changes

- Replace the three-column dashboard with a single content canvas and compact horizontal navigation.
- Replace large greeting panels, ornamental cards, quotes, and competing calls to action with a concise page heading and immediate content.
- Use a responsive three-column visual gallery at large widths, two columns on tablets, and one column on phones.
- Open contributions in a dedicated conversation view, keeping the gallery easy to scan.
- Use charcoal `#202020`, paper `#ffffff`, muted gray, and vermilion `#e4492d` for the main action. No gradients or decorative hero illustrations.
- Use a bold wordmark, editorial typography, real photography, custom SVG graphic studies, and generous image areas. Stock portraits depict fictional demo people.
- Keep the creation flow to one modal with an optional title, a thought, a topic, and an optional photo with a description.
- Add interest tuning, named saved collections, and own-post editing/deletion. Six topics make room for learning, careers, and everyday life as well as creative work.

## Discovery

Explicit interests, followed creators, recent contributions, and modest reaction signals determine the recommended feed. Likes/saves can add a small topic preference. An author-diversity adjustment prevents one creator from filling the feed. New own posts stay first so publishing gives predictable feedback.

The ranking is a pure local function with deterministic tie breaks, documented weights, and tests. Latest and Following remain chronological; Popular is a separate explicit sort. Topic filters use exact topic names; free-text search matches titles, bodies, people, and topics.

This is a relevance system for a finite local dataset. It is not machine learning, does not use session duration or tracking, and does not promise retention outcomes. Useful content, predictable controls, and conversation quality are the intended reasons to return.

## Code boundaries

- `App.jsx`: state, routes, screen selection, and modals.
- `components/Layout.jsx`: horizontal header and mobile navigation.
- `components/Feed.jsx`: feed controls, gallery, and empty/end states.
- `components/PostCard.jsx`: visual contribution and focused discussion.
- `components/Screens.jsx`: discovery, activity, profile, and preferences.
- `lib/state.js`: state validation, data migration, persistence, filters, and ranking.

Existing user-authored contributions, comments, likes, bookmarks, follows, profile, and appearance must survive migration. Replaced sample content may change. Every interactive affordance has a working behavior, accessible name, visible focus, and a keyboard path.

## Verification

Check deterministic ranking, interest changes, author diversity, chronological alternatives, strict topic filtering, safe migration, invalid input, image failures, persistence, profile changes, bookmarking, and conversation navigation. Inspect desktop/mobile light and dark appearances. Validate widths down to 320 px, dialog focus, reduced motion, direct links, empty states, and the production build.

## Reference research

[Behance visual discovery](https://help.behance.net/hc/en-us/articles/204484044-Guide-Discover-Creative-Work-on-Behance) and [Are.na's purpose](https://www.are.na/about) inform discovery and saving. Forma uses an original layout and identity.

Backend scope remains unchanged: this rebuild is local. Secure identity, shared MongoDB data, uploads, and live notifications remain separate milestones.
