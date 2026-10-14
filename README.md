# Forma

**Find your next idea.** A visual social platform for sharing work, learning, useful resources, and everyday perspectives.

Version **0.2** rebuilds the interface with horizontal navigation, a focused visual gallery, a charcoal/white/vermilion identity, original graphic studies, and dedicated conversations. This is a **browser-local demo**: shared accounts and database-backed features are the next milestones.

## Run

From the workspace directory, with Node.js 20.19+ (or a supported LTS satisfying Vite's requirements):

```powershell
cd 'Social Media Platform'
npm install
npm run dev
```

Open the Local URL printed by Vite. Build and inspect the production bundle:

```powershell
npm run build
npm run preview
```

## Working features

- A visual feed with For you, Following, Latest, and Popular orders.
- Six topics: Design, Photography, Technology, Everyday, Learning, and Career.
- Editable interests and a transparent relevance algorithm with author diversity.
- Search by title, body, name, handle, or topic; exact topic filters.
- Text/photo publishing with optional titles, a 500-character body limit, and photo descriptions.
- JPG/PNG/WebP/GIF uploads under 2 MB with file-type, size, and decode checks.
- Likes, replies, bookmarks, and follow/unfollow controls.
- Named saved collections, creation, assignment, filtering, and consistent cleanup when unsaving.
- Editing and deleting your own posts while preserving replies on edits.
- Profile editing, sample activity/read state, and persisted light/dark appearance.
- Semantic HTML, keyboard focus, native dialogs, status feedback, reduced motion, responsive galleries, and phone navigation/search.
- Safe persistence, recovery from invalid storage, visible quota/access warnings, and migration from the previous local demo.

## Code map

| File                             | Responsibility                                                      |
| -------------------------------- | ------------------------------------------------------------------- |
| `client/App.jsx`                 | Shared state, routes, screen selection, modals                      |
| `client/components/Layout.jsx`   | Header, search, desktop/phone navigation                            |
| `client/components/Feed.jsx`     | Feed controls, gallery, empty/end states                            |
| `client/components/PostCard.jsx` | Contribution previews and focused discussion                        |
| `client/components/Composer.jsx` | Publishing/editing form and photo handling                          |
| `client/components/Screens.jsx`  | Explore, profile, activity, interests, preferences, collections     |
| `client/lib/state.js`            | Validation, migration, persistence, state transitions, feed ranking |
| `client/data/seed.js`            | Fictional demo content                                              |
| `client/styles.css`              | Design tokens, layouts, interactions, responsive rules              |

Components receive data and dispatch explicit actions. The reducer keeps related updates consistent: removing a saved post also removes its collection assignment; deleting your own post also removes reaction and bookmark references. React still renders semantic HTML (`header`, `nav`, `main`, `article`, `section`, `form`, `label`, `footer`, and `time`).

## Feed algorithm

For you uses a small, deterministic scoring function:

| Signal                                     | Weight                               |
| ------------------------------------------ | ------------------------------------ |
| Selected topic                             | +4                                   |
| Followed creator                           | +2                                   |
| Liked/saved posts in the same topic        | +0.5 each, capped at +1              |
| Freshness                                  | Up to +1, decreasing over seven days |
| Reactions                                  | Up to +0.2, logarithmic and capped   |
| Repeated author in the current ranked feed | −2 per earlier appearance            |

Your own posts appear first in For you so publication gives predictable feedback. Latest and Following are chronological. Popular sorts by visible reaction counts. Search and topic filters run before ranking. The algorithm uses only local choices; no tracking, session-duration optimization, or opaque recommendation service is involved.

## Verify

```powershell
npm test
npm run test:browser
npm run build
```

The browser suite starts and stops its own Vite server, uses headless Microsoft Edge by default, and generates ignored screenshots under `test-results/`. Set `BROWSER_CHANNEL=chrome` or `BROWSER_EXECUTABLE` for another installed Chromium browser. See [verification details](docs/VERIFICATION.md).

Manual walkthrough:

1. Create a post. Open it, add a reply, edit it, and refresh. The changes and replies remain.
2. Save a post. Open its conversation and choose a collection. In Saved, filter that collection; unsave and confirm its count updates.
3. Use Tune your feed, select Learning, and return to For you. Try Latest and Following to compare the orders.
4. Search a topic or person; follow someone in Explore; check Following.
5. Edit your profile. Change appearance from Profile's preferences icon. Mark sample activity read.
6. Try an empty post, a body over 500 characters, an oversized image, and an unreadable image. Each should show a helpful error.
7. At a phone width, use the bottom navigation, search icon, and plus button. Use Tab/Shift+Tab and Escape in a dialog.

## Data and limits

Existing valid local data migrates automatically. User-authored posts, replies, likes, bookmarks, follows, profiles, and appearance are retained; fictional sample content is refreshed. The previous storage key remains as a migration source and is not silently removed.

The demo has no authentication, shared server data, upload service, live notification generation, or moderation backend. Stock portraits represent fictional people. Do not use the local demo for confidential content: anyone using the same browser profile can access it. Shared post links locate data in the same browser; they do not transmit it. Clearing site data resets the demo. Limits: 200 posts, 100 replies per post, 20 collections, and browser-dependent storage quota.

## Design, assets, and roadmap

[Redesign decisions](docs/REDESIGN.md) · [Product roadmap](docs/PLAN.md).

The interface uses system fonts and Lucide icons. SVG studies are original code-native graphics. Photographs and stock portraits are downloaded locally from Unsplash; runtime rendering makes no external image or font requests. Image sources:

- [Desk](https://images.unsplash.com/photo-1499750310107-5fef28a66643), [mountains](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b), [interior](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0), [shelves](https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85).
- [Portrait 1](https://images.unsplash.com/photo-1534528741775-53994a69daeb), [portrait 2](https://images.unsplash.com/photo-1506794778202-cad84cf45f1d), [portrait 3](https://images.unsplash.com/photo-1524504388940-b1c1722653e1), [portrait 4](https://images.unsplash.com/photo-1500648767791-00dcc994a43e), [portrait 5](https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43).

Design references: [Behance discovery](https://help.behance.net/hc/en-us/articles/204484044-Guide-Discover-Creative-Work-on-Behance) and [Are.na's idea-saving purpose](https://www.are.na/about). Tooling: [Vite](https://vite.dev/guide/).

Run Git commands from this project directory, which has its own repository. The parent workspace remote belongs to a different application. No deployment has been performed.
