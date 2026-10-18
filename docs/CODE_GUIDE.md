# Understanding Forma's code

Start with one feature and follow its data. There is no custom framework or dependency injection layer: React renders the interface, Express receives requests, and Mongoose reads and writes MongoDB.

## Start here

1. `client/App.jsx` chooses the screen from the URL and opens dialogs.
2. `client/components/` contains the screens and forms. Each receives its data and callbacks as props.
3. `client/lib/useCommunity.js` loads data, keeps it in React state, and handles request ordering.
4. `client/lib/communityApi.js` maps each named action to an explicit API request.
5. `server/app.js` installs shared middleware and connects the route modules.
6. `server/routes/` validates each request, checks ownership, and calls the models.
7. `server/models.js` defines the stored records and indexes.

## Example: adding a reply

`PostCard.jsx` validates the reply and dispatches a `comment` action. `useCommunity.js` queues the operation. `communityApi.js` sends `POST /api/posts/:id/comments`. The server authenticates the session, validates the text, and adds the current user's ID itself. The response contains the updated post. The hook merges that result, then the component clears the input.

If the write fails, the input stays available. The server remains responsible for authorization even when the browser hides a control.

## Why the client has two state modules

`communityState.js` converts API records into the shape the screens use. `state.js` supports the browser-only `/demo` preview, including its reducer, migration, validation, and feed ordering. Account data is not copied into localStorage. This boundary preserves the earlier preview without mixing preview identities with real accounts.

The hook uses a request number to reject older feed responses and a session version in memory to reject responses belonging to a previous sign-in. These are ordinary counters, not a global state framework.

## Feature locations

| To change                                  | Read                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Gallery and sorting controls               | `client/components/Feed.jsx`                                          |
| A post, replies, or reply removal          | `client/components/PostCard.jsx`, `server/routes/posts.js`            |
| Posting form and photo descriptions        | `client/components/Composer.jsx`                                      |
| Profile, interests, or themes              | `client/components/Screens.jsx`                                       |
| Account password, sessions, or export UI   | `client/components/AccountSettings.jsx`                               |
| Password and session endpoints             | `server/routes/security.js`, `server/security.js`                     |
| Exported fields                            | `server/services/accountExport.js`                                    |
| Collection editing                         | `client/components/ManageCollections.jsx`, `server/routes/account.js` |
| Request types and limits                   | `server/validation.js`                                                |
| Colors and layout                          | `client/styles.css`, `client/community.css`, `client/graphics.css`    |
| Collage, botanical mark, and topic symbols | `client/components/Graphics.jsx`                                      |

## Adding a small feature

1. Decide what the user should see, including loading, empty, success, and failure states.
2. Add or extend a small component. Use semantic HTML and labeled form controls.
3. For a shared-state mutation, add one explicit action in `communityApi.js`; avoid putting fetch calls throughout presentation components. Account tools keep their independent requests inside `AccountSettings.jsx`.
4. Validate the server request in `validation.js`. Derive the owner from `request.user`, never from a submitted user ID.
5. Prefer one atomic database update. When multiple writes are necessary, consider interruption and retries.
6. Add a meaningful test for ownership, data consistency, or the new behavior. Run the checks below.

Use clear names and early returns. Extract a helper when it has a clear job or removes meaningful repetition. Avoid adding a generic abstraction for one endpoint.

## Checks

```powershell
npm test
npm run test:live
npm run test:browser
npm run test:release
npm run build
```

`npm test` covers pure state behavior and APIs using isolated temporary databases. Browser suites cover the shared application and retained preview. `.github/workflows/checks.yml` runs tests and the build on pushes and pull requests; the hosted workflow must be verified after it is pushed. Local browser checks require an installed Chromium browser.

Never commit `.env`, `.data`, `.cache`, `node_modules`, or test screenshots. Keep code changes inside this project's repository.
