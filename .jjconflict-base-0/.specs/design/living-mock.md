---
lifecycle: artifact
date: 2026-10-17
status: accepted
decided_by: acting CEO (rulings 1-3 approved 2026-10-17)
---

# The living mock: the spec as a running app

Accepted design, merged from four designers (Codex Astra, Codex Sol, Claude Opus, Claude Fable) on 2026-10-17. This page is a snapshot and is never edited. The evergreen spec is the code and the journeys under `apps/app/spec/`. The three CEO decisions at the end were approved as recommended.

## Position
The living mock is the real `apps/app`, built from main in a `--mode spec` where only the transport is fake. Before the app mounts, a typed world and route handlers take over every request, so one static build serves as the clickable spec site, the slideshow's stage and the CI fixture. "Ahead of the product" has an exact meaning: a bootstrap capability that the spec world advertises and production does not serve yet. A **journey** is one TypeScript data file. It runs unchanged against the mock (blocking) and against live smithers.sh (scheduled), and Will plays it in a player with a Mock/Live flip; his thumbs on each step become judge calibration labels. LLM judgments are Rubric scorers over a canonical observation. Mock verdicts are committed, content-keyed sidecars that CI replays without calling a model. Live verdicts use the approved 30-day `maxAge` cache. No judgment blocks until it agrees with Will's labels.

## Resolved disagreements
| Topic | Astra | Sol | Opus | Fable | Chosen | Evidence |
|---|---|---|---|---|---|---|
| Name | flow | FlowSpec | journey | journey | **journey** | `FlowName` (`e2e/showcase/showcase.ts:14`) and `.smithers/flows` already use "flow" |
| Mock boundary | in-browser I/O engine | fixture transport | global fetch+WS shim, CSP | tap `SeamContext.http` + DesignWorld | **Transport at `createAppFetch` + `LiveChannel` `options.socket` + WebSocket shim; CSP `connect-src 'self'` proves it** | Network calls bypass seams: `LiveChannel.ts:187`, `CloudTerminalClient.ts:163`, `CloudLspClient.ts:272`, `CommandSelection.ts`, `ClientErrors.ts`. The ledger calls DesignWorld rows mock-shaped, not wire (`mvp-ui-mock-seams.md` §1) |
| Where the spec lives | immutable SpecRevision | frozen SpecRelease | `spec` bookmark, rebased every 15 min | main; ahead = View with no Container | **main plus capabilities.** Drafts are jj changes, and Accept lands on main through the lander | `bootstrap.capabilities` and `hasCapability` already exist (`packages/rpc/src/AppBootstrap.ts`, `runtime/Runtime.ts:17`). Only the lander writes main. Opus's own falsifier says "use main plus flags" |
| Fixtures | handlers + transitions | exchanges | world + `(req,w)→res` | JSON per route | **World + typed routes; captured JSON only as overrides with provenance** | The sites mock's `Flags` map onto world variants, capabilities and transport (`sites/core/mock.tsx`, change `rqsxnzxzxuqu`) |
| Live tolerance | bindings, no mode branches | bindings | `live` setting per assertion | `tolerate` fields | **Bindings + `shape`. The only mode switch is a journey-level `live.skip`, which counts as unverified** | Assertion values come from data on both sides. Steps never branch on mode |
| Runner | extend showcase | new `run.ts` | new `run.ts` | showcase modes | **New `spec/run.ts` reads journey data and reuses the showcase driver verbs; the case API retires at M** | `ShowcaseApp` already has open, say, click, type, still and recording (`showcase.ts:21-56`) |
| Judge cache | action TTL | action TTL | committed (mock), 30 d (live) | committed with expiry | **Mock: content-keyed sidecar, no expiry, CI replays only. Live: `maxAge:"30d"`** | Docs.Check stamps are content keys, not dates (`DocsCheck.ts:1-27`). An expiring receipt would turn CI red on day 31 for unrelated changes |
| Cost caps | USD | USD | ReviewBudget | ReviewBudget | **ReviewBudget (calls, tokens, wall time), per run and per day** | `LlmLint.ts:647`. Subscription seats have no USD price |
| When judges block | calibrated rates | after an adversarial set | ≥0.9 agreement over ≥20 labels | pass^3 | **All of these: agreement with Will + seeded defects fail + pass^3; the agent judge never blocks** | `Rubric.agreement` (`Rubric.ts:380`), `passHatK` (`agent/evals/src/Trials.ts:93`) |
| Visual judges | assumed possible | assumed possible | agent CLI until images land | advisory | **Advisory through an agent CLI; `ImagePart` goes upstream at M** | `ContentPart` has no image part (`agent/model/src/ModelRequest.ts:226`) |
| Policy | factory (needs schema) | factory | JSON now, factory at M | `S.Judge.Policy` | **`S.Judge.Policy` key on Factory, copying `Lifecycle.Policy`; no policy means no judge runs** | Change `yryspmxlzzpq` adds `lifecycle` to `Factory.ts` the same way. It is not on main yet |
| Live pane | captures | captures, later interactive | screenshots | iframe | **Latest live-run captures always; an iframe for signed-out reads** | `curl -I` of smithers.sh/smithers-canary/smithers: no X-Frame-Options and no frame-ancestors |
| Mock hosting | isolated origin | credential-free origin | spec.smithers.sh, Tailscale meanwhile | `<org>.smithers.sh/design/` | **Private: Mac mini over Tailscale now, in-app at M** | effeck.dev `/spec/` is taken (`eh-domains.prompt.md:9`). Static publish hasn't shipped |
| Launch mocks | — | — | freeze, then port | port into Views now | **Freeze Monday, port page by page after launch** | CEO ruling. `sites/app/routes.tsx` is still a placeholder (Kimi A) |
| Effect.ts site | — | profile | world from GitHub data | `home.json` | **Both** | `Home.ts` blocks plus public repo data |

## The merged design

### Architecture
```
 Will ─ chat ─▶ design agent: jj change spec/<topic>, `vite --mode spec` hot reload (Mac mini)
   │ Accept (Will only) ─▶ landing queue ─▶ main ─▶ issue + lane prompt (done when: journeyLive-<id> green)
   ▼
 main: apps/app (Views, Containers, seams) + apps/app/spec/{boot,worlds,routes,journeys,states,labels}
   │ specSite = Shell.Build `vite build --mode spec` (prod build excludes spec/; lint proves it)
   ▼
 dist-spec, 4 sites by host prefix ─▶ spec host (Mac mini/Tailscale) ─▶ player: Play · Walk · Mock|Live · thumbs
 journey.ts ─▶ spec/run.ts ─┬ mock: Playwright on dist-spec ──────────▶ results(mock)   [ci, blocking]
                            └ live: no interception, factory live URL ─▶ results(live) + captures [schedule]
                                       ▼
   judges: Rubric.make over Evaluator.layerFromSeat · sidecars (mock) · maxAge 30d (live) · S.Judge.Policy
                                       ▼
   drift = journey matrix + capability diff + wire decode ─▶ "built 12 min ago · ahead 6 · regressed 1"
```
- **Sites.** All four sites are worlds for one bundle, routed by host prefix: `default` (smithers-canary/smithers and maya), `smithers`, `effeck` (with its docs as static files) and `effect` (public GitHub data plus the repo's `home.json`).
- **Flags.** The launch mock's flags split three ways. `as`, `repos` and `data` become world variants. `landing`, `converter`, `guest` and `hosted` become capabilities. `net` becomes transport behavior (slow or error on every read).
- **DesignWorld.** It may run only in spec mode for Smithers-app cards that have no real seam yet. The drift view labels those cards "domain-mocked", and they go away row by row along the ledger.

### Formats
```ts
// apps/app/spec/journeys/default/repo-read-signed-out.journey.ts
export default journey({ id: "default/repo-read-signed-out", site: "default", spec: "funnel L1, mvp J1.1",
  lifecycle: "evergreen", world: { base: "default", variant: { as: "out", data: "full", net: "ok" } },
  live: { target: "default", subject: { repo: "smithers-canary/smithers", as: "anonymous" } }, // or { skip: "write path" }
  bind: { readme: { read: "GET /api/repos/:repo/contents/README.md", pick: "firstHeading" } }, // world in mock, API in live
  steps: [
    { caption: "A visitor opens the repository", go: "/${repo}", expect: [{ see: { role: "link", name: "README.md" } }] },
    { caption: "Reads the README", spec: "P8", click: { role: "link", name: "README.md" }, expect: [
      { see: { role: "heading", level: 1 }, text: "${readme}" },
      { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" } ] },
    { caption: "Asks how to run it", actor: "maya", say: "how do I run the tests?", expect: [
      { fuzzy: { view: "reply" }, means: "names the local test command" },
      { rubric: "reply-actionable", on: { view: "reply" } } ] } ],
  judge: { agent: "./done.md" } })                          // advisory; its report is an artifact
// A state (replaces a story) is a journey with zero steps: { id, site, world, go, expect }.
// apps/app/spec/worlds/default.ts: world({ clock, seed, capabilities, ahead: { "hosted.land": "issue#4301" }, viewer, repos, variants })
// apps/app/spec/routes/contents.ts: route({ method, path, schema, handle: (req, w) => res, transition?, fromLive?: res => worldPatch })
```
- **Sidecar receipt** `<id>.judgments.json`: `{identity:"sha256(kind,judge@v,rubric,model,observation)", verdict, scores, reason, trials:3, passes, at}`.
- **Label line** in `spec/labels/<rubric>.jsonl`: `{journey, step, mode, revision, thumb:"up"|"down", assertions:[...], note?, by, at}`.
- **Fixtures come three ways.** Captured: `run.ts capture --live` taps the transport, decodes against the `@smthrs/rpc` schema and redacts with `redactCredentials` (`LlmLint.ts:1309`). Edited: by hand in world files. Generated: the agent writes variants such as empty, error, slow and long names. A fixture that fails its schema fails `specSite`.
- **Targets in `apps/app/PACKAGE.ts`:**
  - `specSite`: Shell.Build.
  - `specStates`: NodeTest running the crawl.mjs rules, axe, light and dark, desk and phone.
  - `journeyMock`: NodeTest in `ci`, cached.
  - `journeyLive-<id>`: NodeTest, `exclusive`, `cache:false`, the way `journeyJ1Release` is declared.
  - `judgeLive`: `maxAge:"30d"`, `keyScope:"declared"`.
  - Flows: `design/session` and `design/accept` (`Flow.make`), plus a `spec/sync` trigger.

### Sync and drift
- **Main to mock is automatic.** The `spec/sync` trigger (`smthrs triggers register` on the Mac mini, because FACTORY rows are only declarations today, `.smithers/FACTORY.ts:54`) rebuilds within 15 minutes of each landing. Live journeys run every 30 minutes and after each deploy.
- **Mock to product goes only through Accept.** A pure visual change ships straight to production. Behavior that needs backend work lands behind a capability that only the spec world advertises; the fixture route is the API contract and the capability is the switch.
- **States for each journey:**
  - `shipped`: mock and live both pass.
  - `ahead`: mock passes and live fails, but an open issue owns it and its age shows.
  - `regressed`: it was shipped, now live fails, and no issue explains it.
  - `stale`: mock fails because the app moved past the spec; Product decides.
  - `unverified`: skipped, inconclusive, out of budget or environment down. Never green.
- **Two more drift checks.** Capability drift: a capability the spec world advertises but production doesn't, with no owning issue. Wire drift: a live capture that fails the route's schema or carries unknown fields.
- **Where drift shows.** In the player header, on the Spec board card, and as a banner inside the mock.

### Judges
- **Kinds.** `see`, `text`, `url`, `sent` and `shape` are exact and always block. `fuzzy` and `rubric` use `Rubric.make` over a canonical observation (visible text per block, the accessibility tree, a screenshot digest), never the raw page. Page text goes into the prompt as untrusted data. `visual` and the agent judge (`S.Agent.Diff` with an empty `writeSet`) stay advisory.
- **Determinism.** Pinned model and rubric version, temperature 0, 3 trials. A 2–1 split is `uncertain`: it doesn't block and it asks Will for a label. Volatile values are masked from policy before hashing. A model change sends the judge back to advisory until the stored labels are replayed on the new model.
- **Cost.** A `ReviewBudget` per run and per day, reserved before dispatch. When it runs out the result is `inconclusive` (exit 5), never `pass`. Seats come from `Evaluator.layerFromSeat`; which account answers is node config.
- **Lifecycle.** A judged assertion in a journey file is evergreen. Agent-judge reports, live captures and review sessions are `lifecycle:"artifact"`. "Make this an assertion" on a finding promotes it into the journey.
```ts
judges: S.Judge.Policy({ engines: { rubric: { engine: "claude", model: "<pinned>" }, fuzzy: { engine: "claude", model: "<pinned>" } },
  budget: { perRun: { modelCalls: 150, promptTokens: 2_000_000, wallMs: 1_800_000 }, perDay: { modelCalls: 600 } },
  trials: 3, maxAge: "30d", promote: { minLabels: 20, minAgreement: 0.9, seededDefectsFail: true },
  blocking: { exact: true, shape: true, rubric: "promoted", fuzzy: false, visual: false, agent: false } }),
spec: { live: { default: "https://smithers.sh", effeck: "https://effeck.smithers.sh", effect: null }, aheadMaxDays: 14 }
```

### The design agent in the app (one `Design` card family in chat; Maximize, never a separate page)
```
 default / repo-read-signed-out   step 2 of 3  ◀ ▶   [Mock | Live]   world [signed out▾ full▾ ok▾]   ahead · 1 issue
 ┌ Reads the README · P8 ─────────────────────────────────────────────────────────────┐
 │  Mock: the spec build at this checkpoint ("Try it" gives Will control)              │
 │  Live: latest run capture + verdict chips (exact ✓, judged ≈ with its reason)       │
 └──────────────────────────────────────────────────────────── [thumbs up] [thumbs down ▾] ┘
```
1. **Spec board** (`/design`). Journeys grouped by site, one pill each for mock, live and judged. The counts double as filters. "New design change" opens a `spec/<topic>` draft seeded with the selected step.
2. **Play and Walk.**
   - Play is the card above. The player's arrow and Space keys carry over from `Player.tsx`.
   - Walk turns the captions into a checklist beside the live site, so Will tests the live product journey by journey.
   - Thumbs down asks for one thing: which judged chip was wrong, or a note. A note seeds a draft design change.
3. **Design draft.**
   - The conversation sits beside a Preview card with the hot-reload spec build. Compare shows Draft against Main or Live.
   - Alt-click pins an element: the route, world, `data-view` and accessibility path become a chip in the composer.
   - Before/after shows every state the change touches (`smthrs affected`).
   - The design agent writes Views, Containers, worlds, routes, states and journeys, and never backend code. Its gates are `specStates` and `journeyMock`.
4. **Accept** is a confirm card only Will can press. Any later edit invalidates it, and agents can never press it. It hands the change to the lander and opens an issue plus a lane prompt with four parts:
   - Why: the accept receipt.
   - Done when: `journeyLive-<id>` passes.
   - Start from: the fixture route, which is the API contract.
   - Do not: edit the journey.

### Replacing Storybook and slideshows; fitting with cells
- **Component states.** The 29 `*.stories.tsx` files become states in the same format, and the story `expect` contract (`packages/rpc/test/fixtures/_story.ts`) becomes exact assertions. The gallery is `/__states`. `view-stories.html` is retired once coverage matches.
- **Slideshows.** The proof page (`apps/app/proof/proof-page.ts`, which already shows mock captions beside real screenshots with verdicts) grows into the player. The showcase recorder still produces GIFs. The reel's `dist-*` folders stay as dated artifacts.
- **Cells.** The spec build is static and holds no team data. Design sessions, labels, receipts, approvals and private evidence belong to the cell or install that owns the repo. Live URLs are factory config ("Product code never names a deployment", `hosting.md` §2). No shared service is added and no frozen hosted preview is revived. effeck.smithers.sh is just one more live target.

## Port path for the launch mocks
1. **Until the Monday launch:** nobody touches `.specs/design/mock/`. The new work lives only in `apps/app/spec/` and lands after the launch tag.
2. **Monday after launch:**
   - Land the design-mocks change as it stands.
   - Add the jj bookmark `mock-launch-2026-10-19`.
   - Write `ARTIFACT.md` in `.specs/design/mock/` (`lifecycle: artifact`, source commit, list of `dist-*`).
   - Capture `shot.mjs --all` into `shots-launch-2026-10-19/` as the reference set.
3. **From week 2, page by page in page-map order:** default UI, then Smithers, Effeck, Effect.ts. For each route:
   - screens become states;
   - each `cards.tsx` card becomes an existing View or a new props-only View;
   - flags become variants, capabilities or `net`;
   - launch journeys become journeys with the same captions and spec citations;
   - an advisory visual judge ("same layout and copy") plus Will's thumbs compare against the reference shot;
   - a row in `apps/app/spec/PORT.md` closes.
4. **Front pages** (`sites/front`) port into their real homes: `apps/site` and the Effeck docs build. In mock mode they run on the local static build; in live mode on the deployed site (read paths).
5. **The orchestrator's role after launch:** it becomes the port owner, and its builders take one page per lane. The sites source is deleted after the last row closes; the reel source is deleted at L.

## Walking skeleton (Tue 10-20 to Sat 10-24)
- **D1.** Spec build, fixture transport and the `default` world. **Done when:** the static dist renders the repo home and README, the CSP logs zero escaped requests, an unknown route shows a fixture failure and fails the check, and the production bundle contains nothing from `spec/`.
- **D2.** `run.ts mock|live` and the first journey. **Done when:** the same unchanged file passes on the mock and on smithers.sh; removing the README click handler fails the mock run; a corrupted fixture fails `shape`.
- **D3.** Judges and policy. **Done when:** CI makes zero model calls; a deleted sidecar fails as `missing`; a budget of 1 call gives `inconclusive`; an injected "ignore the rubric" fails.
- **D4.** Player and spec host. **Done when:** Will opens one Tailscale URL, plays the journey, flips Mock/Live, and a thumb shows up in `labels/` and in the agreement report.
- **D5.** Design loop v0 (Browser card plus Accept script). **Done when:** one real copy change goes prompt, preview, Accept, land, and its issue closes on a green live run.

## Milestones
- **S (week 1):** the skeleton; 3 default-UI journeys (repo read, issues read, Q&A chat); launch mocks frozen.
- **M (weeks 2–4):**
  - all four worlds and about 30 journeys (launch funnel plus mvp J1–J11);
  - in-app Spec board, Play, Preview and Accept cards, with labels written in-app;
  - `ImagePart` upstream;
  - showcase cases ported and the case API deleted;
  - `/__states` replaces `view-stories.html`;
  - launch pages ported.
- **L (weeks 5–10):**
  - DesignWorld deleted along its ledger;
  - the 82 T1 specs and 90 real-tier specs become journeys, including write paths on an owned install;
  - a nightly agent judge;
  - `@smthrs/spec` goes upstream once a second repo uses it;
  - live journeys gate deploys after 20 of them stay green for 7 days.

## Risks, each with a cheap experiment
1. **The app won't boot under the in-page transport.** Take 2 hours to build a shim that logs and 404s everything, and count the routes the repo home asks for. If there are more than 40, or something fetches outside the shim, serve the mock from the Bun host (`scripts/browser-test-host.ts`).
2. **Fixtures grow into a second backend.** Build issue create, read and reload for one resource and count the handler lines before generalizing.
3. **The mock agrees with a product bug.** Remove one real handler, corrupt one response and break one persistence path; each mode must catch its own failure.
4. **Bindings let wrong data pass.** Seed a wrong user, a missing call to action and stale data; each must fail specifically.
5. **Judges are flaky or persuadable.** Run one rubric 20 times on a fixed observation (at least 19 must agree), plus 30 labeled cases that include prompt injection in the page text.
6. **Capability gating costs more than a `spec` bookmark would.** Track the first 10 accepted changes and count how many need old and new Views side by side.
7. **The design loop doesn't feel real-time.** Measure 20 edits: under 2 s for CSS, under 10 s for a component.
8. **Browser jobs overload the machines.** Run 10 serial reset cycles with one browser job at a time on the Mac mini, and watch processes, open files and disk.
9. **Capture leaks a secret.** Plant a token in a canary response and check that the fixture stores it redacted.

## What would prove it wrong
- More than 20% of the first 10 journeys need steps or assertions that differ between mock and live.
- Removing production behavior leaves the mock green.
- After M, more than a third of screens still need mock-only renderers.
- More than 30% of accepted changes need old and new Views side by side; in that case switch to Opus's `spec` bookmark.
- Judges stay below 0.9 agreement after 50 labels.
- Will keeps asking for GIFs or slides instead of using the player within 2 weeks.

## CEO decisions
1. **Accepted design lands on main behind bootstrap capabilities, with no long-lived `spec` bookmark.** Recommend yes.
2. **Blocking policy.** Exact and shape assertions block from day 1. A rubric blocks only after it agrees with at least 20 of Will's labels at 0.9 or better, fails the seeded defects, and passes 3 of 3 trials. Fuzzy, visual and agent judges stay advisory. Live journeys don't gate deploys yet. Recommend yes.
3. **The living mock stays private.** Mac mini over Tailscale this week, inside the app at M, no public spec host. Recommend yes; it avoids showing unshipped copy and an eh-domains allocator change.

## Codex lanes (Sol; each hands off `landing-queue/<lane>.NN-*`; none lands before the launch tag)
1. **spec-build.**
   - Scope: `--mode spec`; `spec/boot.ts` transport (app fetch, LiveChannel socket, WebSocket shim, CSP); `default` world; about 10 read routes ported from `e2e/playwright/cloudFixture.ts` and `showcase/cases/repo-home.case.ts`; `specSite` target; a lint that keeps `spec/` out of production.
   - Files: `apps/app/vite.config.ts`, `apps/app/spec/**`, `src/mainview/runtime/ApplicationTransport.ts`, `apps/app/PACKAGE.ts`.
   - Done when: as D1. Deps: none.
2. **journey-runner.**
   - Scope: `spec/journey.ts` (types and validation); `spec/run.ts mock|live|capture`; driver verbs extracted from `showcase.ts` into `e2e/showcase/driver.ts` with the cases unchanged; bindings; exact and shape assertions; `--results-file`; `journeyMock` and `journeyLive-<id>`; journey `default/repo-read-signed-out`.
   - Done when: as D2. Deps: 1.
3. **judge-policy.**
   - Scope: `S.Judge.Policy` and a `judges` key on Factory, copying `Lifecycle.Policy`; projection into `.smithers/factory.json`; the targets reference doc; smithers' own policy in `.smithers/FACTORY.ts`.
   - Files: `packages/smithers/build/targets/src/{Factory,Smithers}.ts`, its tests.
   - Done when: projection drift check green and unknown keys refused. Deps: `yryspmxlzzpq` on main.
4. **judged-assertions.**
   - Scope: `fuzzy` and `rubric` over the canonical observation; sidecar receipts with Docs.Check-style `stale|missing`; replay-only judging in CI through `packages/testing/src/CachedEvaluator.ts`; 3 trials and pass^3; ReviewBudget ledger; `judgeLive` with `maxAge` (or `cache:false` until build-cli ships it); `smthrs eval`-style agreement report from labels.
   - Done when: as D3. Deps: 2, 3.
5. **player-host.**
   - Scope: `spec/player/` grown from `proof/proof-page.ts` (journey index, Play, Walk, Mock/Live flip, world bar, per-step thumbs); `spec/host.ts` (Bun, Mac mini) serving `dist-spec` and live captures, taking `POST /__spec/labels`, and handing labels to the landing queue nightly.
   - Done when: as D4. Deps: 2 (verdict chips arrive with 4).
6. **sync-drift.**
   - Scope: trigger registrations (rebuild on main, live every 30 minutes and after deploy, live judging); the five drift states; capability drift and wire drift; drift JSON for the player header; one browser job at a time.
   - Done when: a broken live assertion shows `regressed` within one cycle, and an unowned spec-only capability shows up. Deps: 2, 5.
7. **design-loop-v0.**
   - Scope: `design/session` flow (jj workspace `spec/<topic>`, `vite --mode spec` as a managed service, URL opened in the Browser card); `design/accept` (refuses non-Will actors; hands off to the landing queue; opens an issue with the lane prompt in `~/smithers-lanes/spec-<id>.prompt.md`).
   - Done when: as D5. Deps: 2, 6.
8. **launch-freeze-port-ledger.**
   - Scope: the Monday freeze steps; `spec/PORT.md` listing every launch route; the crawl.mjs rules moved into `specStates`; repo home and blob ported as the first rows.
   - Done when: `specStates` checks every state at desk and phone, and both ported rows match the reference shot or carry Will's thumbs-up. Deps: 1, design-mocks landed.

### Critical Files for Implementation
- /Users/williamcory/smithers/apps/app/src/mainview/runtime/ApplicationTransport.ts (with `runtime/LiveChannel.ts`, `packages/rpc/src/AppBootstrap.ts`)
- /Users/williamcory/smithers/apps/app/e2e/showcase/showcase.ts (with `e2e/playwright/cloudFixture.ts`)
- /Users/williamcory/smithers/apps/app/proof/proof-page.ts
- /Users/williamcory/smithers/packages/smithers/agent/scorers/src/Rubric.ts (with `packages/testing/src/CachedEvaluator.ts`, `build/targets/src/DocsCheck.ts`)
- /Users/williamcory/smithers/packages/smithers/build/targets/src/Factory.ts and /Users/williamcory/smithers/apps/app/PACKAGE.ts
