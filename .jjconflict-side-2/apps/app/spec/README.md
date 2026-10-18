# Static spec build

From `apps/app`:

```sh
bun spec/validate.ts
pnpm exec vite build --configLoader runner --mode spec
pnpm exec playwright test --config playwright.spec.config.ts --workers=1
```

Serve `apps/app/dist-spec` with a static host that falls back to `index.html`.
Apply its `_headers` file (CSP on every response, including worker scripts).
The production build remains `pnpm exec vite build --configLoader runner`.

Open `/maya/tinyhttp`, `/smithers-canary/smithers`, or `/effeck/effeck`.
Choose `?as=out|member&data=full|empty&net=ok|slow|error`.
Bootstrap, identity, repository metadata, guest admission and bookmarks establish
the read target; net variants affect every content, home, issue and inventory read.
Slow reads take 750 ms. Error reads return 503 with a named fixture error.
The converter is off; no spec-only capabilities are advertised (`ahead` is empty).

Add a typed `route({ method, path, schema, handle })` in `routes/reads.ts`.
Schemas come from `@smthrs/rpc`; path parameters use `:name`, tails `*path`.
Extend `validate.ts` when a route needs more representative parameters.
Every response is decoded before delivery and by `specSite` before bundling.

`window.__spec` exposes `world`, `requests`, `sockets`, `failures`, `violations`,
and `assertClean()`. Unknown HTTP/socket requests produce a visible fixture
failure; `assertClean()` throws. Tests also refuse any backend request that
reaches the static server, including requests originating in workers.

Known product gaps are retained as failing tests, outside the D1 transport gate:
`SPEC_PRODUCT_GAPS=1 pnpm exec playwright test --config playwright.spec.config.ts --workers=1`.
They retain chat file-card cap and semantic README heading checks. L3 follows
the home Docs link to the 6 KiB `docs/user/src/001-onboarding.md`; blob files up
to 512 KiB must display whole, without “Truncated” (PM repo-ui view 2).
The onboarding fixture is synthetic prose of the real file’s size class.

# Journey runner

Run from the repository root:

```sh
bun apps/app/spec/run.ts mock default/repo-read-signed-out --results-file results.json
bun apps/app/spec/run.ts live default/repo-read-signed-out --results-file results.json
bun apps/app/spec/run.ts capture --live default/repo-read-signed-out --results-file results.json
```

Mock serves dist-spec through the shared static host, or uses SPEC_MOCK_URL.
SPEC_MOCK_SITE_DIRS is a JSON map from world names to offline static builds
(for example {"smithers":"/path/to/site-build"}). The Smithers Astro site
builds with fetch disabled; Effeck has no site source in this workspace.
Bindings read typed world routes; live bindings use the API. The runner passes
world variants to the page and observes window.__spec.exchanges; synthetic
fetch responses do not produce Playwright network-response events.

SPEC_OUTPUT selects the screenshot and capture directory. Screenshots are
separate for every run and mode. Live uses one signed-out browser, no request
interception, and paced same-origin read navigation. No auth, external links,
write controls, typing or form submission execute. The bug report checks the
GitHub URL without opening it. Working Copy controls and signed-in publishing
remain unverified under this lane's live policy.

The results array is validated by ResultsSchema in results.ts. Exact failures
remain failures. Unpromoted judgments stay advisory; missing/stale sidecars fail.
No policy or an exhausted budget is inconclusive. Drift
owns paired shipped/ahead classification and issue ownership. Missing landing
worlds report unverified: world arrives at M. No sites/ code changes.

Capture validates page and binding responses against the D1 RPC route schemas,
retains unknown field names/types for drift (never their values) and redacts structured values and provenance
with redactCredentials. Unsupported encodings fail before persistence.
Deployed build stamps supply live revision; an unavailable stamp says unknown.
Unknown routes and malformed responses fail capture. Overrides are artifacts
and are never automatically promoted into the world.

The mock target depends on specSite and remains uncached until browser
identity is fully declared (AGENTS.md cache contracts). Live targets use the
noncolliding specJourneyLive prefix and are exclusive/cache:false.

Targeted checks (build first for d2.test.ts):

```sh
cd apps/app
bun test --isolate spec/runner.test.ts scripts/showcase.test.ts spec/world.test.ts
bun test --isolate spec/d2.test.ts
```

The D2 tests retain the complete canonical journey result, including PM header
gaps, and check shipped README assertions. They remove the real React click
handler and corrupt a fixture response to prove the same read fails.

`judge --record <journey>` records mock sidecars through the node-configured seat
under ReviewBudget; `judge --record --live` records separate live artifacts.
CI replays through CachedEvaluator and never records. Missing/stale evidence
fails; no policy or an exhausted budget is inconclusive (exit 5). See JUDGES.md
for seat configuration, labels, agreement reporting and eval baseline commands.

# Private player (D4)

The owner installs this after the HELD stack lands. One URL serves the index,
player, real spec build and captures. Labels stay outside the checkout.

From the repository root, using the pinned Node/pnpm and Bun on PATH:

```sh
mkdir -p "$HOME/smithers-spec/results" "$HOME/smithers-spec/labels"
pnpm -C apps/app exec vite build --configLoader runner --mode spec
SPEC_OUTPUT="$HOME/smithers-spec/results" bun apps/app/spec/run.ts mock default/repo-read-signed-out --results-file "$HOME/smithers-spec/results/mock-results.json"
SPEC_OUTPUT="$HOME/smithers-spec/results" bun apps/app/spec/run.ts live default/repo-read-signed-out --results-file "$HOME/smithers-spec/results/live-results.json"
SPEC_RESULTS_DIR="$HOME/smithers-spec/results" bun apps/app/spec/host.ts
```

Run browsers serially. A journey exit 1 retains honest assertion failures;
exit 5 means unavailable evidence. Do not weaken assertions to make live green.
Keep captures inside the results directory; copying only JSON leaves captures
unavailable. Results are re-read on page load, newest run per journey/mode.

The default host binds **127.0.0.1:4790**. When Tailscale is signed in:

```sh
tailscale serve --bg http://127.0.0.1:4790
```

Open the HTTPS URL Tailscale prints. Label identity comes from
`Tailscale-User-Login`; requests without it get 401. `SPEC_HOST_LOCAL=1` is
only for automated tests, which use random ports and `local-test` identity.

## LAN while Tailscale is signed out

Stop your foreground host, then:

```sh
SPEC_HOST_LAN=1 SPEC_HOST_OWNER=will SPEC_RESULTS_DIR="$HOME/smithers-spec/results" bun apps/app/spec/host.ts
```

This binds a private IPv4 address from the mini's interfaces, never 0.0.0.0.
Open `http://Williams-Mac-mini.local:4790/` on the phone or MacBook. Reads work
without signing in. The first start creates `~/smithers-spec/host-token` with
mode 0600. Visit `http://Williams-Mac-mini.local:4790/?k=<token>` once, using
that file's contents. The host sets an HttpOnly, SameSite=Strict cookie and
redirects away from the token. Without the cookie, label writes get 401;
with it, `by` is `SPEC_HOST_OWNER` (default `will`). Restart retains the token.
The host prints the numeric bind address if mDNS does not resolve.

## Play and Walk

Pick a journey. ◀/▶ or arrow keys move through captions; Space plays/pauses
at the proof player's 3.2-second interval. Controls and text fields keep their
native keys. Mock restores the last route plus subsequent gestures in the
real spec build. Try it gives the iframe keyboard/pointer control. The world
bar selects `as`, `data`, `net`; changed variants show no baseline receipt.
Non-default site builds are explicitly unavailable until their worlds exist.

Live shows the latest captured step. Expand ✓/✗ chips for expected and actual.
Walk shows a checklist beside the configured live site; checkmarks survive
reload for the browser session. It is manual evidence, not a passing run.
`SPEC_LIVE_URLS` can override the runner's target map, for example
`{"default":"https://smithers.sh","smithers":"https://smithers.sh","effeck":"https://effeck.dev"}`.

👍 writes once the host confirms. 👎 requires a note or a disputed chip.
Exact disputes retain the receipt in `note`; calibration assertions are only
judged receipts. Errors remain visible and retryable. Counts come from the
external JSONL, not an optimistic increment. `step` is zero-based. The host
supplies identity and time, validates the revision and assertion coordinates,
and refuses labels inside any repository checkout.

Optional `SPEC_RESULTS_DIR/drift.json` supplies the header slot with
`{ "builtMinutes": 12, "ahead": 6, "regressed": 1 }`; drift computation is spec6.

## LaunchAgent

Copy `apps/app/spec/spec-host.plist` to
`~/Library/LaunchAgents/ai.smithers.spec-host.plist`. Replace `__HOME__`,
`__CHECKOUT__` and `__BUN__` with absolute paths. Create `~/smithers-spec/`
first. For LAN, change `SPEC_HOST_LAN` from `0` to `1`; leave it `0` for
Tailscale. The template fixes port 4790 and never enables test identity.

```sh
launchctl bootstrap "gui/$UID" "$HOME/Library/LaunchAgents/ai.smithers.spec-host.plist"
# After editing the plist:
launchctl bootout "gui/$UID" "$HOME/Library/LaunchAgents/ai.smithers.spec-host.plist"
launchctl bootstrap "gui/$UID" "$HOME/Library/LaunchAgents/ai.smithers.spec-host.plist"
```

The owner installs/enables the agent. This lane does not alter launchd.

## Nightly label handoff

The owner runs this once nightly from a checkout containing this script:

```sh
bun apps/app/spec/labels-handoff.ts --repo "$PWD" --labels "$HOME/smithers-spec/labels" --queue "$HOME/smithers-lanes/landing-queue"
```

It snapshots complete new lines, creates an isolated temporary jj workspace
from `main@origin` (or the preceding unlanded labels handoff), makes **one
commit**, and writes the six landing-queue files with HOLD. No push, landing,
main movement or source-workspace checkout occurs. `--base` overrides the
initial base for testing. The external `.handoff/state.json` records consumed
byte offsets and prefix hashes; changed/truncated history fails closed. A
pending handoff resumes instead of creating a duplicate. A process lock refuses
overlapping runs; after a crash, check the old process has stopped before
removing `.handoff/lock` and retrying. Keep the state alongside the labels.

Targeted proof, with dist-spec built first:

```sh
(cd apps/app && bun test --isolate spec/host.test.ts spec/player/player.test.ts spec/labels-handoff.test.ts)
pnpm -C apps/app exec tsc -p spec/player/tsconfig.json --noEmit
```

Without `SPEC_PLAYER_RESULTS`, the player test runs a real mock journey and
uses its capture as a **Live-display fixture**, not production evidence.
To repeat the lane's retained-evidence proof, set `SPEC_PLAYER_RESULTS` to a
directory holding real mock/live runner receipts and their captures.
`SPEC_PLAYER_EVIDENCE` selects the test screenshot directory.

## Judged evidence and label agreement

Judged chips use ≈ with the verdict and recorded reason, including missing,
stale and inconclusive receipts. They do not turn an advisory failure into ✓.
The runner stamps rubric/version/model/content identity onto real judged
receipts. Thumbs retain that provenance in `assertions`; missing or older
unstamped evidence stays a general journey label. Fuzzy labels stay advisory
and cannot promote a rubric. Mixed-rubric steps use `journey.jsonl`; the shared
report and runner read it alongside the rubric's own file.

The host returns the shared agreement report in `/__spec/data` and after a
label POST. To print it:

```sh
bun apps/app/spec/agreementCli.ts .smithers/factory.json "$HOME/smithers-spec/labels" will
```

For Tailscale, set `SPEC_HOST_OWNER` and that command's final argument to the
owner's `Tailscale-User-Login` value. LAN defaults to `will`. Real owner counts
remain zero until the owner labels real judged evidence; test fixtures do not
calibrate a model. A mock receipt whose revision differs from the currently
served build is hidden, and the host refuses labels for it. Rerun mock after
each build before labeling it. Run `pnpm install --frozen-lockfile --ignore-scripts` before typechecking;
cloned node_modules can retain stale Effect types (spec10).

## Case modules

A journey module exports either one journey or an array of cases. Each case has
its own stable ID, receipts, captures and player link. The CLI expands all cases
in module order; `journeyMock` uses `mock --all` to discover every module.
Missing site worlds remain unverified, and product assertion failures still fail.
The six P1 modules alone contain 86 definitions and 124 mock checkpoints.
Source revision lookup tolerates concurrent jj operation heads without snapshotting.

For a shorter assertion budget during gap collection, pass
`--assertion-timeout-ms 1500`; the default remains 5000 ms. This changes waiting
time, never assertions or verdicts. Manual signed-out production collection:

```sh
bun apps/app/spec/run.ts live smithers/landing-install --results-file l1-live.json
(cd apps/app && SPEC_P1_LIVE=1 bun test --isolate spec/p1.test.ts)
```

Queue `test.txt` commands stay offline; live collection is an operator action.

## Drift feed

`bun apps/app/spec/driftCli.ts <manifest.json> <results-directory> <receipts...>`
pairs the newest mock/live receipt per journey and atomically writes `drift.json`.
The manifest supplies `builtAt`, the factory `spec.aheadMaxDays`, `journeys`
(`id`, optional `owner` issue and `capabilities`), world `capabilities` and
`ahead`, optional `productionCapabilities` and schema-tagged `captures`.
Omit production capabilities when bootstrap could not be read. An empty array
means bootstrap was read and advertises none. `GITHUB_TOKEN` enables read-only
REST issue checks; failed reads remain unverified. No GitHub writes occur.
Product can declare a mock failure stale with `stale: { by, reason }` on the
journey metadata. A failure alone never proves the app moved past its spec.
The previous feed retains shipped history across failed cycles. Preserve it.
