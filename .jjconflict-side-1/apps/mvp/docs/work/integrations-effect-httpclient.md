---
title: "@smthrs/integrations on Effect HttpClient"
status: done
area: sdk
owner: integrations agent (follow-up started about 23:28 on 2026-10-19, after the browser-safe root; reported done 00:25 on 2026-10-20)
updated: 2026-10-20
links: [integrations-browser-safe-root.md, web-standard-globals-rule.md, ../rules.md, ../../../../docs/libraries.md, ../decisions/0006-repo-clone-and-view.md, repo-clone-and-view.md, code-storage-spend-caps.md, code-reviews.md, integrations-durable-retries.md, disk-space.md, sign-in.md]
---

## What

`@smthrs/integrations` calls GitHub through Effect's `HttpClient` instead of the global `fetch`. The caller provides the client as a layer, usually `FetchHttpClient.layer`.

The package keeps its rule: never follow a redirect while carrying a token. A followed redirect re-sends the `Authorization` header to whatever host the redirect names, so the client answers a redirect instead of following it.

## Why

- The catalog's Platform rule lets a library call web-standard globals but prefers Effect's `HttpClient` where it exists ([web-standard globals](web-standard-globals-rule.md)). The app's rules ban raw `fetch` (`effect.native-api-first`, [rules](../rules.md)).
- Faults by injection only: with an injected `HttpClient`, a test layer fails a GitHub call without intercepting requests.
- `repo/Inspect` reads a repository's size through `GitHub.GitHubClient` on the Cloudflare host ([decision 0006](../decisions/0006-repo-clone-and-view.md)), so the clone flow shares one HTTP stack with the rest of the app.

## State

- 23:27 on 2026-10-19: the [browser-safe root](integrations-browser-safe-root.md) is done.
- 23:28: the lead told Will the package switches next, "keeping its rule never to follow a redirect while carrying a token".
- 23:34 to 23:37, on disk, unreported:
  - New `src/internal/http.ts`: `forCredentials` wraps the caller's `HttpClient` so the fetch transport's `redirect` is `"manual"` and trace headers aren't propagated. Its comment says not to pass a client wrapped in `HttpClient.followRedirects`.
  - `src/github/GitHubClient.ts`, `src/github/Proxy.ts` and `src/core/OAuthToken.ts` use `HttpClient`. No bare `fetch(` call is left in `src`.
  - Tests: a new test layer, `test/Http.ts` (23:36), and `test/GitHubClient.test.ts` (23:37) with a "GitHub redirects" block: a 3xx is answered, not followed.

- 23:37 to 23:43, on disk, unreported: `src/core/CredentialHttp.ts`, `src/core/OAuthToken.ts`, `src/github/GitHubClient.ts` and `src/github/Proxy.ts` changed again (23:40). Most tests moved onto the injected layer, 23:38 to 23:39: `GitHubProxy`, `OAuthToken`, `Actions`, `ClientLayers`, `Examples`, `GitHubActions`, `GitHubSync`, `IssueSyncDurability`, `WriteBackResume`, `GitHubLive`, `ClientTracing` and `BrowserBundle`. A consumer changed: `packages/smithers/src/operator/Integrations.ts` (23:41) with `packages/smithers/test/OperatorIntegrations.test.ts` (23:43). No report yet.

- 23:46 to 23:55 on 2026-10-19, on disk, unreported:
  - **A changeset**, `.changeset/integrations-http-client.md` (23:47), marks `@smthrs/integrations` major. `GitHubClient.make` and `OAuthToken.make` return Effects that need `HttpClient` and fail instead of throwing, `Proxy` needs `HttpClient`, and none follows a redirect.
  - `GitHubClient.ts` (23:48) and `OAuthToken.ts` (23:51) changed again, then `docs/api.md` (23:51), `GitHubClient.test.ts` (23:53) and `OAuthToken.test.ts` (23:54).
  - **A green test matrix** (scratchpad `matrix5.log`, 23:55): 33 test files pass in each of two legs, and merged coverage is 100% (1,771 statements, 1,223 branches, 476 functions). Runs from 23:47 to 23:53 had failed in `IssueSyncDurability`, `WriteBackResume` and once in `GitHubProxy`'s rate-limit test.
  - The catalog row now says "HTTP goes through the Effect `HttpClient` you provide" ([library catalog](library-catalog.md)).
- 23:51: a second changeset, `integrations-oauth-refresh-once.md` (minor). `exchangeRefreshToken` presents a single-use refresh token once and returns the whole grant, and an OAuth error body is a refusal whatever its HTTP status. Best guess: S1's, for its per-person tokens ([sign-in](sign-in.md)).
- 00:05 on 2026-10-20: the browser contract passes with the package, for a browser and a Worker (the flows-root agent's gate run, [flows root](flows-root-platform-neutral.md)). No report.


- 00:04 to 00:16 on 2026-10-20, unreported: `tsc` is clean, there are no circular imports, and the tests pass (00:06). **The docs target is blocked by another agent:** it fails because `flows/sandbox/PACKAGE.ts` names the moved `SandboxedFlow.ts` ([flows root](flows-root-platform-neutral.md)). The agent is retrying it in a loop.

- 00:25 on 2026-10-20: **done, reported.** Nothing is committed.
  - **The change:** `GitHubClient.make` and `OAuthToken.make` return Effects that need `HttpClient`, and fail with a typed error instead of throwing. `exchangeCode` and `Proxy.make` and `Proxy.layer` need `HttpClient` too, and callers provide `FetchHttpClient.layer`. The shared setup, `src/core/CredentialHttp.ts`, sets fetch's `redirect` to `"manual"` and sends no `b3` or `traceparent` headers. One visible change: an error body without a `message` now shows only the status code, because `HttpClient` doesn't expose the status text.
  - **Redirect tests:** real loopback servers answer 302 (GET) and 307 (POST) with a second origin, for the client, OAuth and the proxy, and the second origin receives nothing. A control shows plain fetch does follow. Removing the setting fails all 5 redirect tests and the trace-header test.
  - **Faults by injection:** unhappy paths use a test `HttpClient` (`test/Http.ts`), and nothing stubs `fetch`. Stubbing had stopped working anyway: Effect captures `globalThis.fetch` on the first request, so later stubs are ignored. The agent saved that as a memory.
  - **Consumers:** `packages/smithers/src/operator/Integrations.ts` (`probe`) and `.smithers/flows/issue-claim/github-proxy.mjs`. `packages/smithers/test/OperatorIntegrations.test.ts` moved onto loopback servers, past the brief's call-site limit, because its `fetch` stubs broke. Docs, `docs/libraries.md` and the major changeset are updated.
  - **Proof:** SQLite and Postgres merged coverage is 100% on all four measures (1,084 passed). Typecheck, lint, dprint, circular, the browser bundle test, `pnpm docs:sync`, the docs-sync check flow (50 tarballs) and `smthrs docs //packages/smithers/agent/integrations:docs` pass. One proxy timing test failed once under load (a 189 ms gap against a 200 ms floor, at load average 22) and passed 6 of 6 reruns. The Go `modelprice` half of `pnpm docs:check` never ran: the low-disk guard refused with 4 GiB free ([disk space](disk-space.md)).
  - **Retries it found and left unchanged:** in-step `Schedule` retries that don't survive a crash, a double retry with the engine's policy, and a hand-rolled sleep loop in `OAuthToken`. Their own item: [durable integration retries](integrations-durable-retries.md).

- About 00:33 on 2026-10-20: the retries this agent found moved to their own agent ([durable integration retries](integrations-durable-retries.md)). The full `pnpm docs:check`, Go half included, passed at 00:28 ([disk space](disk-space.md)).
- About 01:00 on 2026-10-20: S1 fixed an upstream bug while building [sign-in](sign-in.md): GitHub answers OAuth errors with `200 OK`, which the package read as decode failures; it now classifies them. About 01:03: the in-step retries this agent found are gone ([durable integration retries](integrations-durable-retries.md)).

## Next

Nothing for this item. Rerun the Go half of `pnpm docs:check` now that the disk has room. (The full run passed at 00:28 on 2026-10-20.) `repo/Inspect` uses `GitHub.GitHubClient` with `FetchHttpClient.layer` when R3 lands ([repo clone and view](repo-clone-and-view.md)). The retries move into flow steps under [durable integration retries](integrations-durable-retries.md).

Until 00:25 on 2026-10-20 the next step was: the flows-root agent fixes the stale paths in `flows/sandbox/PACKAGE.ts`, then this agent's docs target passes and it reports.

Until 00:16 on 2026-10-20 the next step was: the agent's report. By 00:08 on 2026-10-20 the redirect tests, a changeset, docs, a 100% coverage run and a passing browser contract are on disk; the report confirms them.

Until 00:08 on 2026-10-20 the next step was: the agent's report: the redirect tests, fault cases through an injected `HttpClient` layer, 100% coverage, the browser contract still passing, docs and a changeset.

## Questions for Will

None.
