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

D1 integration is blocked: spec1-build stopped at its Risk 1 gate and has no
handoff. The provisional `SPEC_WORLD_READS` adapter reads a JSON map from
`GET /api/...` to world responses, **not live HTTP**. Replace that adapter with
the D1 world's typed route reader when its contract arrives. Neither this
adapter nor the runner contract fixture is evidence that the real app renders.

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
