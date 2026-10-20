# Web pages

`app/web/open { url, mode? }` opens an outside web page for the person. A person runs it with `/web <url> [embed|tab]`; the agent calls it from a cell when someone asks to see a page ("show me the Effect docs", "open https://… in a new tab"). It never navigates the app and never opens a tab on its own: it adds a view to the conversation that shows the page's origin. Will, 2026-10-20: "Add a flow where an agent can open a webpage in the chat iframe view or in a new tab too". Decisions: [0003](../decisions/0003-flows-and-the-agent.md), [0004](../decisions/0004-agent-ui-codemode-and-rendering.md), [0011](../decisions/0011-the-agent-runs-in-the-browser.md).

```
person: /web <url> [tab]  ──(Enter, in the keypress)──▶ tab mode and the browser allows it: window.open, no flow, nothing added
          │ refused by the policy ─▶ the composer keeps the line and says why
          └─▶ FlowDispatch("app/web/open", door slash)
agent:  ctx.call("app/web/open", { url, mode }) ─▶ child execution on the same engine
                                   │
app/web/open ─ app/web/check (sealed: the URL against the policy, and the view's id)
             ─ app/web/show  ─ POST /api/views { id, template, props: { url } } ─▶ Postgres `views`
                                                                                  ─▶ Electric ─▶ every device
conversation: view row ─ embed: WebPageView (origin · Full screen · Open in new tab, then the sandboxed frame)
                         tab:   WebLinkCard (origin · Open, a real link the person clicks)
/app/views/<id> ─ the same view at full size
```

## Modes

| Mode | What the person sees |
|---|---|
| `embed` (the default) | The page in a sandboxed frame inside the chat, with its origin above it, a **Full screen** link to `/app/views/<id>`, and an always-visible **Open in new tab** link. Many sites refuse framing (`X-Frame-Options`, `frame-ancestors`) and the app can't detect it, so the link is never hidden. |
| `tab` | A card with the page's origin and an **Open** button. Browsers open a tab only from a person's click or key, and flows run in the engine worker, so the flow never opens one: the person's click on Open does, through a real link with `rel="noopener noreferrer"`. |

A person's own `/web <url> tab` is different: it runs synchronously in their Enter (the slash command's `submit`), and when the browser still allows it (`navigator.userActivation.isActive`), opens the tab right there, with `noopener,noreferrer`, and runs no flow. `window.open` takes the keypress's activation when it opens a tab, so an activation still there afterwards means the browser refused; then, or when the browser can't say, the flow runs and adds the card instead. The app never claims a tab it didn't open.

## Which pages

`checkUrl(url, mode, policy)` (`src/features/web/url.ts`) is the one check. The flow's step, a person's `/web` and ChatApi all run it.

| Refusal | When |
|---|---|
| `invalid` | not an absolute URL, or longer than 2,048 characters |
| `scheme` | anything but `https:` or `http:`: `javascript:`, `data:`, `file:`, `blob:`, `about:` and the rest, however written (ASCII tab and newline are dropped first, as browsers do) |
| `insecure` | `http:`, except a new tab of `localhost` while the app runs under the dev server |
| `credentials` | the URL names a user or a password |
| `same_origin` | the app's own host, whatever the scheme: `/navigate` opens app pages (`app/navigate`) |
| `same_site` | `embed` of the app's site or any of its subdomains |

The agent gets the failure's kind (`WebPageRefused`), never its reason or the URL. A person's `/web` refused by the policy stays in the composer with one line saying what to do (`CANT_OPEN` in `src/features/web/contract.ts`), and nothing runs.

## Security

- **The frame.** `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"`, `referrerpolicy="no-referrer"`, `loading="lazy"`, no `allow` delegation, no top navigation and no downloads (`WEB_PAGE_SANDBOX` in `@smthrs/ui`). `allow-same-origin` gives the page its own origin, so its own cookies and storage work.
- **Why only another site, over https.** A framed page with `allow-scripts allow-same-origin` that is same-origin with the app can remove its own sandbox and reach the app's storage, session and DOM. A page on the app's site, such as a subdomain, shares its cookies. `http://localhost` on another port shares them too: cookies aren't kept apart by port. So `embed` takes `https:` pages of other sites only, and the app's own origin is refused for both modes.
- **Every side checks.** The step refuses before it adds anything; ChatApi checks again against the host the request came to before it keeps a row; and `@smthrs/ui` checks once more when it renders, against the page's own origin (`framedPageTarget` for the frame: https, not the host's site; `webPageTarget` for a card: http(s), not the host's origin). A row that slipped through still renders no frame.
- **Redirects.** A framed page may redirect anywhere, the app's own origin included, and the frame can't be inspected after it loads. So only the requested URL is checked, and the app's own pages refuse every frame: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on every page (`public/_headers` on Cloudflare; a dev-server middleware in `vite.config.ts`, because Cloudflare's Vite plugin skips `_headers` in dev). A redirect to another page of the app's site lands under that site's own framing rules.
- **What the app frames.** `index.html` carries `Content-Security-Policy: frame-src https:` (`FRAME_POLICY`, `src/pwa.ts`), so no `javascript:`, `data:`, `blob:`, `file:` or `http:` frame loads, whatever reaches the page.
- **The service worker.** It keeps only the app's own shell (`shellCaches`, `src/pwa.ts`): never a frame's document, never another origin. An embedded page is another origin's, which this worker never sees.
- **The person sees what and where.** Every view and card shows the page's origin as text, and nothing navigates the app away.
- **`http://localhost` links.** The browser allows them only under the dev server (`import.meta.env.DEV`); ChatApi keeps them only where `WEB_PAGES_LOCAL_HTTP` says so. `alchemy dev` passes `true` as its default (`worker/DevChatApi.ts`); a deployment refuses them unless it sets the variable.

## The flow

`src/features/web/flows.ts` declares it; `src/features/web/steps.ts` runs its steps, so only an engine's host imports that.

| Step | Does |
|---|---|
| `app/web/check` | sealed: checks the URL against the host's `WebPolicy` and picks the view's id, so a run resumed after a crash adds the very view it chose before. Fails `WebPageRefused { reason }` |
| `app/web/show` | adds the view through `ViewsClient` (`POST /api/views`): `webpage` for `embed`, `link` for `tab`. A `400` from ChatApi is `WebPageRefused { reason: "invalid" }`, `401` or `403` `WebPageForbidden`, anything else `WebPageUnavailable`, which its retry policy tries again (500 ms doubling to 8 s, for at most 2 minutes) |

It answers `{ viewId, origin, mode }`. Placement is `client`: it needs nothing the device lacks.

| Host | `WebPolicy` |
|---|---|
| the engine worker | `{ localHttp: import.meta.env.DEV, appOrigin: self.location.origin }` (`src/flows/engine.worker.ts`) |
| Node hosts in the tests | `localHttp: false` unless set (`src/flows/registrations.ts` `HostOptions`) |

## The views table

Views are conversation rows (decision 0004 §8): synced like the messages to every device and every person in the conversation. This is the table's first slice, template views; generated views add their own columns with their own migration.

| Column | |
|---|---|
| `id` | uuid, chosen by the writer, so the same add again changes nothing |
| `template` | `webpage` or `link` |
| `props` | jsonb object: `{ url }` |
| `position` | from the messages' own sequence (`messages_position_seq`), so one number orders views and messages, in the order they were added |
| `created_at` | |

`db/migrations/0010_views.ts` creates it with `REPLICA IDENTITY FULL`.

| Route | Answers |
|---|---|
| `POST /api/views { id, template, props: { url } }` | `202 { txid }` added; `200 { txid: null }` the same view again; `400 { code: "invalid" }` not a view; `400 { code: "refused" }` a page it won't keep; `401`, `403 { code: "forbidden" }` for a Guest or no role (adding is Member or above, like asking); `405`; `409 { code: "id_taken" }`; `413 { code: "too_large" }` over 8 KiB; `503 { code: "unavailable" }` |
| `GET /api/shapes/views` | Electric's `views`, through `ShapeProxy` |

Both live in ChatApi (`worker/Views.ts`, routed by `worker/Chat.ts`).

## The browser

| File | Holds |
|---|---|
| `src/features/views/store.ts` | `ViewsStore`: the `views` Electric collection, kept on the device, and the one view the full-screen route shows |
| `src/features/views/views.ts` | the `Views` layer: `queries.shown`, `actions.show(viewId)` (the route's loader) |
| `src/features/views/components/ConversationView.tsx` | one view in the conversation: `WebPageView` inline, or `WebLinkCard` |
| `src/screens/view/ViewScreen.tsx` | `/app/views/$viewId`: `WebPageView` at full size, with **Back to chat** |
| `src/features/chat/queries.ts` | the conversation: `messages ∪ views ∪ …`, a view as role `view` with its `template` and `url`, ordered by position |
| `src/features/web/actions.ts` | a person's door: `refusedPage`, `openFromGesture`, `openWebPage`, `cardOpened`; `WebTab` is the browser's `WebHost` (`policy`, `openTab`) |
| `src/features/commands/actions.ts` | `/web` runs through `openWebPage`, door `slash` |

`WebPageView` and `WebLinkCard` come from `@smthrs/ui` ([show a web page](../../../../packages/smithers/ui/docs/guides/show-a-web-page.md)).

## Observability

One count and one log line per opening, written where its door is known: the agent's by the flow's steps in the engine worker (the agent's call is a child execution, so its id isn't its own requester, `src/flows/requests.ts`); a person's by the tab that dispatched it, once the flow answers, or at once when their `/web` opened the tab or was refused. None carries the URL, its origin or its path.

| Record | Kind | Fields |
|---|---|---|
| `web.page.open` | log | `web_mode` (`embed`, `tab`), `door`, `outcome`, `reason` on a refusal, `feature: web`; Info when something showed, Warn otherwise |
| `web.page.open` | span, one per step and per person's opening | `smithers.web.mode`, `smithers.web.outcome` |
| `smithers_web_pages_opened` | counter | `web_mode`, `door`, `outcome`: `embedded`, `card`, `opened` (a person's own tab, from `/web` or a card's Open, door `view`), `refused`, `forbidden`, `unavailable` (per failed attempt) |
| `execute_tool app/web/open` | span | the agent's call |
| `chat.view.add`, `chat.view.request`, `smithers_view_requests`, `chat.views.shape`, `smithers_view_shape_requests` | ChatApi | [observability](../observability.md#chatapi-worker) |

`WEB_TELEMETRY` (`src/features/web/contract.ts`) adds them to the relay's allowlist. The field is `web_mode`, not `mode`, because the relay keeps a field by name for every record, and `mode` is the theme flow's input.

## Tests

| Test | Proves |
|---|---|
| `src/features/web/url.test.ts` | every refusal in both modes, the app's own origin and site (`localhost:1337` included), `http://localhost` only for a dev tab, and a host's site |
| `src/features/web/web.test.ts` | the steps on the Node host's engine against ChatApi's real route: both modes, refusals, ChatApi refusing and forbidding, a failed add tried again once, records by door with no page in them; the agent's `ctx.call` as a journaled step, a refused call failing; the client's own failures; the gesture rules |
| `src/features/views/views.test.ts` | the whole app in Node: `/web` embeds a view after the messages and a second device shows it; `tab` adds a card, or opens straight from the keypress when the browser allows it; refusals stay in the composer; a signed-out person is forbidden; the full-screen query shows only a `webpage`; a card's Open is counted |
| `worker/Views.test.ts` | every status of `POST /api/views`, the server's own check, `WEB_PAGES_LOCAL_HTTP` (production refuses `http://localhost`), and no page in any record |
| `db/Database.test.ts` "0010_views" | positions from the messages' sequence, after the messages before them, and the table's checks |
| `src/pwa.test.ts` | the service worker keeps no frame and no other origin; the page headers and the frame policy |
| `e2e/web-page.spec.ts` | the real app and model: the agent embeds `https://example.com` with its origin shown, on a second device and at full size; the agent's card opens a local test page in a new tab; a person's `/web … tab` opens straight from Enter; `javascript:` and the app's own origin are refused in the composer; the app's pages refuse framing |

Run them with the compose Postgres and Electric up (`pnpm db:up`): `pnpm exec vitest run src/features/web src/features/views worker/Views.test.ts src/pwa.test.ts`, and `pnpm exec playwright test e2e/web-page.spec.ts` against `pnpm dev` on `:1337`.
