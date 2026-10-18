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
They assert whole long files (L3/L4) and semantic README headings; the product
currently clips file cards at 16 KiB and draws homepage headings without roles.

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
remain failures. ok:null records skipped judges; judges do not block. Drift
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
