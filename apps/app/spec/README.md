# Static spec build

From `apps/app`:

```sh
bun spec/validate.ts
pnpm exec vite build --configLoader runner --mode spec
pnpm exec playwright test --config playwright.spec.config.ts --workers=1
```

Serve `apps/app/dist-spec` with any static host that falls back to `index.html`.
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

# Journey runner

Run from the repository root with Bun:

```
bun apps/app/spec/run.ts live default/repo-read-signed-out --results-file results.json
bun apps/app/spec/run.ts mock default/repo-read-signed-out --results-file results.json
bun apps/app/spec/run.ts capture --live default/repo-read-signed-out --results-file results.json
```

Mock serves `apps/app/dist-spec` on a random lane port, or uses
`SPEC_MOCK_URL` for an already-served build. It never installs browser routes.
`SPEC_OUTPUT` selects the screenshot/capture directory. Each invocation uses
one Chromium browser and fresh signed-out contexts. Live controls must be
same-origin links or the existing read-only file/issue flow doors. No typing,
chat sends, auth links, forms or GitHub navigation run in live mode.

The D1 default world and typed route reader are now present in this combined stack.

The six PM journeys retain their assertions when live is behind. The results
array is validated by `results.ts`; `ok: null` means a skipped judge, never a
pass. Each attempted step has a PNG, including failures. A single-mode run
stays `unverified`: drift owns pairing mock/live evidence and issue ownership
before it can assign `shipped`, `ahead`, `regressed` or `stale`.

Capture saves supported successful contents/home responses only, validates
against RPC schemas and preserves unknown fields for wire-drift checks.
Unknown routes and failed responses are not trusted fixtures. Values and
provenance pass through `redactCredentials` before serialization; base64
contents are decoded before redaction and encoded again. Capture files are
artifacts, never automatically loaded or promoted into the world.

`journeyMock` is the blocking mock target; `specJourneyLive*` names avoid the
existing real-install `journey*` targets. Live targets are exclusive and
uncached. The mock target remains uncached until D1 supplies a build dependency and
complete browser identity; the cache-contract rule forbids caching an
incomplete input contract. Its declared inputs already include spec artifacts.
