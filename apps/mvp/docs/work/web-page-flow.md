---
title: "Open a webpage from chat (app/web/open): embedded in the conversation or in a new tab"
status: in-progress
area: app
owner: web page agent; reported done 07:44:34 on 2026-10-20 (e2e 5 of 5 against the dev server and the real model, five GIFs, new files at 100% unit coverage, `docs:sync` and `docs:check` pass); a fix in `@smthrs/effect-electric` with a changeset; nothing committed, so it lands in round 2 of the landing. Until 07:44: web page agent; from 07:06 on 2026-10-20 `e2e/web-page.spec.ts`, five GIFs (07:11 to 07:12) and `docs/features/web-pages.md` (07:13); unreported. Until 07:06: web page agent; from 06:30:52 on 2026-10-20 under the lead's second instruction (`localHttp` read from Config so production is `https` only, with a test; a real `frame-ancestors 'none'`; the slash list from the registry). By 06:34 all three are on disk with tests; `docs/features/web-pages.md` and `e2e/web-page.spec.ts` aren't; unreported. Until 06:30: web page agent; from 06:21:32 on 2026-10-20 under the lead's security requirement for `embed` (refuse the app's own origin and any origin sharing its cookies or storage, with a test); the refusal is on disk in `src/features/web/url.ts` (06:24:07), its test isn't, unreported. Until 06:21: web page agent; building from about 06:08 on 2026-10-20 (`src/features/web/` and `src/features/views/`, migration `0010_views`, `worker/Views.ts`, and `@smthrs/ui` `src/web-page/`), unreported. Until 06:08: web page agent (started about 05:59 on 2026-10-20 by the lead, at Will's request); researching from 05:59 to at least 06:04 (the app's answer and actor workers, the flow runtime's execution context, the agent's flows and instructions, TanStack DB queries, Playwright); no source file changed, unreported
updated: 2026-10-20
links: [navigate-flow.md, slash-commands.md, agent-ui-rendering.md, flows-and-agent.md, pwa.md, observability.md, e2e-suite-and-gifs.md, code-reviews.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/flows.md, ../features/agent.md, ../rules.md, ../../../../AGENTS.md, fable-review-2-fixes.md, ../features/web-pages.md, effect-tanstack-db-and-effect-electric.md, land-to-main.md]
---

## Current specification — 2026-10-20, 18:18 PDT

**What:** Handle pages that refuse embedding with an honest, usable fallback.

**Why:** Will requested graceful iframe refusal at 18:11.

**Current state:** The lead assigned a durable server preflight with private-address protection and a link-card fallback, also for failures after loading. No completion receipt.

**Next step:** Prove a refusing local page produces the fallback with title/domain and Open in a new tab; make the agent report card rather than embed, and rerecord the browser journey.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

## Earlier tracker history (retained)

## What

One flow, `app/web/open` with payload `{ url, mode }`, shows an outside webpage. A person and the agent call the same flow.

```
chat: "show me https://example.com"          person: /web https://example.com
                 │                                         │
                 ▼                                         ▼
app/web/open { url, mode }    url: https only; javascript:, data:, file:, blob: ▶ typed refusal
   │
   ├─ mode: embed ──▶ a webpage view row in the conversation (syncs to tabs and devices)
   │                  ┌ https://example.com ─────────── Open in new tab ┐
   │                  │ <iframe sandbox …>  inline; full screen         │
   │                  └─────────────────────────────────────────────────┘
   │
   └─ mode: tab ───▶ a link card with the origin and an Open button;
                     the person's click opens the tab (noopener, noreferrer)
                     /web from a click or Enter may open directly while the gesture is valid
```

Best-guess spec, from the lead's brief (about 05:59 on 2026-10-20):
- **URLs.** `https` only. The brief also allows `http` for `localhost` in dev. `javascript:`, `data:`, `file:` and blob URLs are refused with a typed error.
- **`embed`** adds a webpage view that syncs like other views ([agent UI](agent-ui-rendering.md)), inline in chat with a full-screen size. The frame is `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy">`; `allow-same-origin` here is the framed site's own origin, which can't reach the app's. The origin always shows above the frame with an "Open in new tab" link, because many sites refuse framing and the client can't reliably detect it. The app's CSP `frame-src` and the PWA service worker change so framed pages are never cached or intercepted ([PWA](pwa.md)).
- **`tab`.** Browsers block `window.open` that doesn't come straight from a click, and agent flows run in the engine worker, so the agent posts a link card and the person's click opens the tab. Never claim a tab opened when it didn't.
- **Safety.** The agent can't open a page without the person seeing what and where. Nothing navigates the app itself away; in-app pages go through the [navigate flow](navigate-flow.md).
- **Agent use.** In the agent catalog, for "show me the Effect docs" or "open https://… in a new tab".
- **`@smthrs/ui`.** A missing reusable `WebPageView` or link card goes there, with tests and docs.
- **Telemetry:** a log line, a span and the metric `smithers_web_pages_opened` by mode, door and outcome, with no URLs or paths in attributes, in the shared telemetry contract.
- **Proof:** unit tests at 100% (URL validation, both modes, the gesture fallback) and `e2e/web-page.spec.ts` with video and a GIF: the agent embeds `https://example.com` with its origin shown; a new-tab request shows the card and a click opens the tab. Then the usual checks and docs.

## Why

Will, 05:58:50 on 2026-10-20: "Add a flow where an agent can open a webpage in the chat iframe view or in a new tab too while we are at it". The root `AGENTS.md` keeps "the general webpage reader", and [navigate](navigate-flow.md) refuses outside origins, so this flow is the one door to outside pages, with the address always shown.

## State

- **05:59 on 2026-10-20: the lead started a subagent.** The lead to Will: "Embed in chat: the page appears inline in the conversation, can go full screen, and syncs to your other tabs and devices. Its address always shows above it, with an 'Open in new tab' link, because many sites block being embedded." "New tab: browsers block tabs that an agent opens without a click from you. So the agent posts a card with the address and an Open button, and your click opens the tab. Your own `/web` command opens the tab directly when it can." "Only `https` addresses are allowed; `javascript:` and `data:` URLs are refused."
- 05:59 to 06:04 on 2026-10-20, unreported: the agent read `worker/Answers.ts`, `worker/Actor.ts` and migration `0003_paired_positions.ts`; the flow runtime's `FlowInstance`, execution ids and idempotency keys; the app's `src/features/agent/flows.ts`, `host.ts` and `instructions.ts`; `effect-tanstack-db`'s query builder; the repository ShapeProxy wiring; and the Playwright config and `e2e/agent.spec.ts`. No source file changed.
- **Coordination:** the [slash commands](slash-commands.md) and [navigate](navigate-flow.md) agents edit nearby; each re-reads `src/flows/registry.ts` before an edit.
- 06:08 to 06:15 on 2026-10-20, on disk, unreported:
  - **The flow:** `src/features/web/` (`url.ts` 06:08:57, then contract, `flows.ts`, `steps.ts`, metrics, actions, `web.ts` and components by 06:15). `app/web/open` is registered as `/web` for Members and up (`src/flows/registry.ts:49`).
  - **The views table:** migration `0010_views.ts` (06:09:21) starts decision 0004's views table "for template views, the `webpage` and `link` templates `app/web/open` adds"; generated views add their columns later. `worker/Views.ts` (06:12:13) checks the URL again on the server (`checkUrl`) and requires a person who may ask; `worker/Chat.ts` routes `POST /api/views` and `GET /api/shapes/views`. `src/features/views/` holds the client side.
  - **`@smthrs/ui`:** `src/web-page/` (`WebPageView.tsx`, `WebLinkCard.tsx`, `webPageUrl.ts`, `hostOrigin.ts`, `webPageCss.ts`) with three tests, and the guide `docs/guides/show-a-web-page.md` (06:15:12). The frame's sandbox is `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`, with `referrerPolicy="no-referrer"`.
  - Its migration takes `0010`, so the [Fable fixes](fable-review-2-fixes.md)' asker migration takes `0011` or later. Both agents edit `worker/Chat.ts`.
- Fable review 2 (06:08) didn't cover this flow; its frame's security look is still owed ([code reviews](code-reviews.md)).
- **06:21:32 on 2026-10-20: the lead's security requirement for `embed`.** The lead to the web page agent: "With `sandbox="allow-scripts allow-same-origin"`, a framed page that is same-origin with the app can remove its own sandbox and reach the app: its storage, its session, and the parent page." It set four rules:
  1. Refuse `embed` "for the app's own origin and any origin that shares its cookies or storage, such as our own subdomains". App paths go through [navigate](navigate-flow.md).
  2. Treat redirects as untrusted: the frame can't be inspected after load, so validate only the requested URL and keep `embed` to `https` outside origins.
  3. "Add a test that `embed` of the app's own origin, or a `localhost:1337` path, is refused."
  4. State the reasoning in `docs/features/web-pages.md`'s security section.

  This settles the frame question below and closes the security look owed in [code reviews](code-reviews.md).
- **06:21:41 on 2026-10-20, the lead to Will:** "The tracker also caught a security gap in the web-page flow, which I sent to that agent. An embedded page from the app's own origin could break out of its sandbox, so embedding is now refused for the app's own origin."
- 06:16 to 06:24 on 2026-10-20, on disk, unreported:
  - **The refusal** (`src/features/web/url.ts`, 06:24:07). `checkUrl` gains two reasons. `same_origin` refuses the app's own host in either mode: "a page of the app opens with `app/navigate`". `same_site` refuses `embed` of the app's site or any subdomain of it, which share its cookies. `siteOf` takes a hostname's last two labels, so under a two-label public suffix such as `pages.dev` it "refuses more than it must, never less". `embed` never takes `http:`, even on `localhost`, because "cookies aren't kept apart by port". `steps.ts`, `actions.ts` and `worker/Views.ts` call it (06:24:20); the worker takes the app's origin from the request's `Host`.
  - **Not done yet:**
    - No test names `same_origin` or `same_site`.
    - `docs/features/web-pages.md` doesn't exist, though `url.ts` and `steps.ts` cite it.
    - The app's own pages refusing to be framed (`frame-ancestors 'none'`) is a comment in `url.ts`; no header in `worker/` or `src/` sets it.
    - No `e2e/web-page.spec.ts`.
  - **The client side:** `src/screens/view/ViewScreen.tsx` and its CSS, `src/features/views/components/ConversationView.tsx` and `ViewsContext.tsx`, and `src/features/web/components/WebContext.tsx` (06:19:02); `src/features/views/store.ts` (06:19:31); `src/features/web/web.ts` (06:16:39).
- **06:30:52 on 2026-10-20: the lead's second instruction to the web page agent.** "Allowing `http://localhost` must be dev-only: read it from Config so production is `https` only, and add a test that the production config refuses `http://localhost`. Also make the `frame-ancestors 'none'` CSP real, not a comment, wherever it belongs. Finish your tests and `docs/features/web-pages.md`." On the red `commands.test.ts`: "If that test hard-codes the command list, coordinate with the slash-command agent: the list should come from the registry, not a fixture copy" ([slash commands](slash-commands.md)).
- **06:30:54 on 2026-10-20, the lead to Will:** "I also told the web-page agent that allowing plain `http` to localhost must apply in dev only, never in production."
- 06:25 to 06:34 on 2026-10-20, on disk, unreported:
  - **`frame-ancestors 'none'` is real.** `src/pwa.ts` `PAGE_HEADERS` (06:25:13) is `Content-Security-Policy: frame-ancestors 'none'` plus `X-Frame-Options: DENY`. `public/_headers` serves both with every static asset and the single-page fallback on Cloudflare. `vite.config.ts` (06:33:52) sets them on every dev response, because Cloudflare's Vite plugin skips `_headers` in dev, and puts `frame-src https:` (`FRAME_POLICY`) in `index.html`. `src/pwa.test.ts` (06:31:17) checks the headers, the policy, and that `_headers` serves them.
  - **`localHttp` comes from Config.** `worker/Views.ts` (06:32:52) reads `WEB_PAGES_LOCAL_HTTP` (`localHttpConfig`), default `false`; only `worker/DevChatApi.ts` (`alchemy dev`) passes `true`. `worker/Views.test.ts` (06:33:16): with nothing set, an `http://localhost` link card is refused `400 refused`; with the dev setting it is kept (`202`); an `http:` frame is refused either way. The client takes `localHttp` from `import.meta.env.DEV` (`src/main.tsx`, `src/flows/engine.worker.ts`).
  - **The test the lead required at 06:21.** `src/features/web/url.test.ts` (06:31:17), "the app's own host, whatever the scheme, is refused: app/navigate opens it": `https://app.smithers.sh/app` and `localhost:1337` in both modes give `same_origin`, or `insecure` for an `http:` frame; subdomains and `https://localhost:4000/` give `same_site` for `embed`.
  - **`@smthrs/ui`:** `src/web-page/` (`webPageUrl.ts`, `WebPageView.tsx`, `index.ts`), its three tests, the guide, README, CHANGELOG and API docs (06:29 to 06:30). A full `@smthrs/ui` run ending 06:31:27 (scratchpad `full.log`): 2,213 passed, 0 failed, across 161 files; `web-page-view.test.tsx` at 100% coverage. The slash-commands agent edits `@smthrs/ui` too, so the run isn't attributed.
  - A full app unit run from 06:25:04 to 06:29:21 (scratchpad `nav-unit.json`): 521 passed, 30 failed and 4 skipped, in 12 failing files. Two failures touch this flow: `telemetry.test.ts` found an unlisted record `execute_tool app/web/open`, and `registry.test.ts` expected one fewer flow in the agent catalog and in the engine. Several agents edit the app at once, so the failures aren't attributed.
  - **Not done yet:** `docs/features/web-pages.md`, which `_headers`, `pwa.ts`, `url.ts` and `steps.ts` all cite; `e2e/web-page.spec.ts`.
- 07:01:22 to 07:01:27 on 2026-10-20, on disk: `src/features/web/contract.ts`, `metrics.ts` and `web.test.ts`, `src/telemetry.test.ts` and `src/features/views/views.test.ts`. Other agents' reports name type errors in this agent's files in progress: `views.test.ts` (worker Fable fix agent, 07:01:52) and `web.test.ts` ([slash commands](slash-commands.md), 07:06:06).
- 07:06:06: `/web` is in the slash menu for Members and up ([slash commands](slash-commands.md), done).
- 07:06:17: `e2e/web-page.spec.ts`. A run ending 07:11:21 (scratchpad `web-page-results`) failed one case, the embed case ("embed: the agent's … every device at full size too"): device A's app didn't open within 30 s ("A: the app opens"). That case alone passed at 07:12:18 (scratchpad `web-page-embed`).
- GIFs, 07:11:22 to 07:12:21: `web-page-embed.gif`, `web-page-tab.gif`, `web-page-refusals.gif`, `web-page-the-app-s-own-pages-refuse-to-be-framed-and-frame-nothing-but-https-pag.gif` and `web-page-a-person-s-web-url-tab-opens-the-page-straight-from-their-enter-and-add.gif`.
- 07:13:32: `docs/features/web-pages.md`, which `_headers`, `pwa.ts`, `url.ts` and `steps.ts` cite. No report by 07:20.
- **07:44:34 on 2026-10-20: the agent reported done.** Nothing is committed.
  - **Proof:** all 5 cases of `e2e/web-page.spec.ts` pass against the dev server and the real model, each with a GIF (`~/Desktop/smithers-mvp/gifs/web-page-*.gif`). The embed case failed once "when the app didn't open while other agents' edits were reloading the dev server, and passed on rerun". New files at 100% unit coverage; typecheck clean for its files; `importRules` shows only the repo-view red plus `worker/ExecutionHost.test.ts` (another agent's file); `pnpm docs:sync` and `docs:check` pass.
  - **How it works:** `embed` adds a `views` row (new table, migration `0010`) that syncs to every device and has a full-screen route at `/app/views/<id>`. `tab` adds a card whose Open button is a real link. A person's `/web <url> tab` opens the tab straight from their Enter when the browser allows it, and otherwise shows the card. `WebPageView` and `WebLinkCard` are new in `@smthrs/ui`; the flow is in `apps/mvp/src/features/web/` and `src/features/views/`.
  - **Security, the lead's requirements:** `embed` takes only `https` pages on another site; the app's own origin, its subdomains and any `localhost` (including `:1337`) are refused, with tests. The app's pages really send `frame-ancestors 'none'`, checked with curl and in the e2e. `http://localhost` links are dev-only through `WEB_PAGES_LOCAL_HTTP`, and a test shows production refuses them.
  - **An SDK fix:** the extra `views` sync exposed a race in `@smthrs/effect-electric`: the connection pill missed an early sync failure. `ElectricCollection`'s `sync` stream now replays the latest event to a late subscriber, with a regression test that fails on the old code and the changeset `.changeset/electric-sync-replays-latest.md` ([effect-tanstack-db and effect-electric](effect-tanstack-db-and-effect-electric.md)).
  - **Reds it names as other agents':** two `boot.test.ts` cases (the storage metric fails with the views query removed too, and new focus and keydown listeners came from elsewhere), plus repo, Jev, agent and migration-list tests that other agents are changing. `commands.test.ts` now passes.
- **07:44:38 on 2026-10-20, the lead to Will:** "The web-page flow is done, and all 5 browser tests pass." What to try at http://localhost:1337/app: ask "Show me https://example.com", then click Full screen; type `/web https://effect.website tab` and press Enter; ask "Open https://example.com in a new tab", then click Open on the card; type `/web javascript:alert(1)`, refused with "Only https pages open". And: "embedding takes only `https` pages from other sites: the app's own address, its subdomains and localhost are refused, and the app's own pages can't be framed by anyone."
- **Status moved from in-progress to done** on the 07:44 report.
- **13:04:55 on 2026-10-20: the SDK half landed on `main`** in round 2: `WebPageView` and `WebLinkCard` (`6815e1ba7c`), the `@smthrs/effect-electric` sync fix with the changeset `electric-sync-replays-latest` (`8359ef179e`) and the catalog row for web pages (`c9d1e0c5ed`) ([land to main](land-to-main.md)). The app's flow and migration `0010_views` are still uncommitted.

## Next

From 13:04 on 2026-10-20: the app's flow and `0010_views` land in the lander's app round. Neither Fable review covered this flow; the next full review should ([code reviews](code-reviews.md)).

Until 13:04 on 2026-10-20 the next step was: Done. It lands in round 2 of [land to main](land-to-main.md), with migration `0010_views` and the `@smthrs/effect-electric` changeset. Neither Fable review covered this flow; the next full review should ([code reviews](code-reviews.md)).

Until 07:44 on 2026-10-20 the next step was, from 07:13 on 2026-10-20: the agent's report: the full `e2e/web-page.spec.ts` green in one run (the embed case failed at 07:11 and passed alone at 07:12), the app's unit suite and typecheck green for `web` and `views`, with what Will should try: "show me https://example.com" embeds it with its origin; "open … in a new tab" shows the card and a click opens it; `/web` in the slash menu. Then the lead tells Will.

Until 07:13 on 2026-10-20 the next step was, from 06:30:52 on 2026-10-20: `docs/features/web-pages.md` with its security section, `e2e/web-page.spec.ts` with its GIF, and the app's unit suite green, including `telemetry.test.ts` and `registry.test.ts` for the new flow. Then the agent's report, with what Will should try: "show me https://example.com" embeds it with its origin; "open … in a new tab" shows the card and a click opens it; `/web` in the slash menu. Then the lead tells Will.

Until 06:30:52 on 2026-10-20 the next step was: From 06:21 on 2026-10-20: the test the lead required (`embed` of the app's own origin, or a `localhost:1337` path, is refused) and the security section of `docs/features/web-pages.md`. Then the agent's report, with what Will should try: "show me https://example.com" embeds it with its origin; "open … in a new tab" shows the card and a click opens it; `/web` in the slash menu. Then the lead tells Will.

Until 06:21 on 2026-10-20 the next step was: The agent's report, with what Will should try: "show me https://example.com" embeds it with its origin; "open … in a new tab" shows the card and a click opens it; `/web` in the slash menu. Then the lead tells Will.

## Questions for Will

None. Open for the lead, not Will:
- Decision 0004's generated-view frame forbids `allow-same-origin`; this frame allows it for the outside site's own origin. The Fable review or a security pass should confirm the combination is safe with the app's CSP. (Settled 06:21:32 on 2026-10-20 by the lead: `allow-same-origin` stays for outside sites, and `embed` refuses the app's own origin and any origin sharing its cookies or storage, with a test.)
- `worker/Views.ts:39` builds its policy with `localHttp: true` in every environment, so the server accepts an `http://localhost` link card in production too. `url.ts` says `http:` is for development only. (Settled 06:30:52 on 2026-10-20 by the lead; on disk at 06:32:52: `WEB_PAGES_LOCAL_HTTP`, default off, set only by `alchemy dev`, with a production-config test.)
- Does an embedded page sync its address to every person in the conversation, as other views do? (Answered in part at 07:44 on 2026-10-20: the `views` row "syncs to every device". The report doesn't say whether every person in the conversation sees it; decision 0004's Q3, answered 22:35 on 2026-10-19, says views sync to every person in the conversation.)
