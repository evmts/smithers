---
title: Sign-in for the new app
status: done
area: app
owner: fix agent for Codex Astra review 3's findings 1 and 4 (assigned by 01:19 on 2026-10-20): one role check per session in `auth/RecheckRole`, plus `auth/KeepRole` (reported fixed about 02:16 on 2026-10-20); the wiring agent (since about 01:17) wires sign-in into the app and closes its three policy gaps; S1 agent built 0008 phase 1 (started about 23:39 on 2026-10-19, reported done about 01:00 on 2026-10-20); Will registers the callback URL
updated: 2026-10-20
links: [dev-stack-hygiene.md, app-wiring.md, integrations-effect-httpclient.md, integrations-durable-retries.md, ../todo.md, ../decisions/0008-auth.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, roles-and-labels.md, decisions-for-will.md, auth.md, durable-answering.md, code-reviews.md, ../features/sign-in.md]
---

## What

The `todo.md` sign-in item. When it is built, it must cover:
- one identity across web, TUI and CLI through the Smithers GitHub App;
- signed-out people browse freely, but asking Smithers needs sign-in; their data stays in the browser and uploads on sign-in;
- conversations owned by a person or team, set by the server, never the browser;
- per-person and per-network limits plus a deployment-wide model budget;
- `/api/telemetry` bound to a session or signed visitor id;
- e2e tests for signed-out use, signed-in use and isolation between people.

## Why

Codex and Fable both flagged no sign-in as a blocker. Will: "Great call out on the auth. Add it to a list of TODO inside our smithers maintainer app we built". He wants it designed deliberately first.

## State

- Six open boxes in `todo.md`. No route has auth; anyone can read the one shared conversation and spend the model key.
- Design: [auth](auth.md), decision 0008 with Will's answers in §11.
- Will, 2026-10-19: "Let's not allow people to talk to smithers if not logged in for now". So sign-in must land before any public deploy that lets people ask.
- 22:31 on 2026-10-19: decision 0011 puts the check in the server's [model endpoint](model-endpoint.md). Every model call, now made by the browser agent, passes through it, so the endpoint refuses signed-out callers.

- 22:59: W5 (a) adds the seam this fills: an injected `Actor` or session service on the [model endpoint](model-endpoint.md). Production has no provider yet, so the endpoint refuses every call with a typed 401 until sign-in lands; local dev and tests get a dev actor by dependency injection only. `admin/SetModel` checks for the Admin role ([roles and labels](roles-and-labels.md)).
- 23:02: the lead: "Sign-in waits for the model endpoint, because both edit the same Worker file" (`worker/ChatApi.ts`). Not started.
- About 23:06: 0007 is accepted with four roles. Until this item ships identity, every request is signed out and any act that needs a role is refused; 0007's phase 2 needs this item's `CurrentActor` ([roles and labels](roles-and-labels.md)).

- 23:15 to 23:18: **the seam is on disk**, unreported: `worker/Actor.ts` defines a `Sessions` service that resolves the actor behind a request, with a production layer, `signedOut`, that resolves nobody, and `CurrentActor` for flow steps. This item's job is a `Sessions` layer backed by GitHub App sign-in ([model endpoint](model-endpoint.md)).

- 23:39: **W5 is done** ([model endpoint](model-endpoint.md)), so `worker/ChatApi.ts` is free. Production refuses every ask with 401 through the `Sessions` seam; `worker/DevChatApi.ts` gives a local Admin in dev only.
- 23:39: **S1 started**, 0008 phase 1:
  - GitHub App user authorization with PKCE;
  - a real `Sessions` implementation, replacing the production `signedOut` layer;
  - cookie sessions stored in Postgres;
  - role mapping onto 0007's four roles ([roles and labels](roles-and-labels.md));
  - the app side in `src/features/auth/**`.
  - Will must register callback URLs in the Smithers GitHub App's settings; S1 reports them. The lead: "When it finishes I'll give you the callback URLs to register in the App's settings."
- 23:47: no S1 file on disk yet; `src/features/auth` doesn't exist.

- 23:51 on 2026-10-19 to 00:04 on 2026-10-20, **S1's server half is on disk**, unreported:
  - `worker/SignIn.ts` (00:01) answers four routes. `GET /api/auth/sign-in?return=<path>` sends the browser to GitHub; `GET /api/auth/callback?code&state` signs it in, and only in the browser that started it; `POST /api/auth/sign-out` ends the session; `/api/auth/session` reads it. Requests are counted by route, outcome and reason, and a failed callback shows only "Couldn't sign in."
  - `worker/GitHubAuth.ts` (23:56), `SessionStore.ts` (23:57), `SessionKeys.ts` and `Body.ts` (23:55). `worker/Actor.ts` (23:52) takes its `Role` from the new `src/features/auth/contract.ts` (23:59).
  - Migration `db/migrations/0005_sign_in.ts` (23:57) creates `people`, `sign_in_attempts` and `sessions`.
  - **A durable flow, `worker/flows/RecheckRole.ts`** (23:57): when a session's role is over an hour old, it checks the role with GitHub again. It first refreshes the 8-hour GitHub token when it's near expiry, and a token GitHub refuses ends the session. It's registered on the Cloudflare host in `worker/ExecutionHost.ts` (00:04) ([Cloudflare flow host](cloudflare-flow-host.md)).
  - `@smthrs/integrations` gained `exchangeRefreshToken`, which presents GitHub's single-use refresh token once (changeset at 23:51) ([Effect HttpClient](integrations-effect-httpclient.md)).
  - Not yet: tests for any of these; `ChatApi.ts` is still built with `Actor.signedOut` (unchanged since 23:35); no sign-in UI beyond the contract; and `docs/features/sign-in.md`, which the code cites, doesn't exist.
- The callback path on disk is `/api/auth/callback`. The full URLs for the GitHub App's settings come with S1's report.


- 00:06 to 00:16 on 2026-10-20, on disk, unreported: **S1 wired sign-in in and wrote its tests.**
  - `worker/ChatApi.ts` (00:09) now builds `SignIn.make` over Postgres; `fallback` sets who is signed in for dev only (`DevChatApi.ts`, 00:08).
  - `infra/SignIn.ts` and `alchemy.run.ts` (00:07): Alchemy generates `SESSION_SECRET` once and keeps it encrypted in stack state; replacing it signs everyone out. The GitHub App's client id and secret come from the deploying environment. The local dev stack's state has `SessionSecret` (00:08).
  - Tests: `worker/test/github.ts` is a scripted GitHub with single-use codes bound to the PKCE challenge, rotating refresh tokens and injectable faults; `worker/test/signIn.ts` and `worker/SignIn.test.ts` use it. **A run at 00:12 passed 25 of 26.** The one failure was the test's own credential scan (`JSON.stringify` can't serialize a Postgres `BigInt`), patched at 00:13; no rerun on record.
  - Not yet: sign-in UI (`src/features/auth/` holds only `contract.ts`), and `docs/features/sign-in.md`, which `infra/SignIn.ts` also cites.

- 00:16 to 00:26 on 2026-10-20, on disk, unreported:
  - **A live test against the real GitHub**, `worker/GitHubAuth.live.test.ts` (00:22), checks the GitHub App adapter with the Smithers GitHub App's credentials. Each case skips and names what's missing: `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`; `GITHUB_SIGN_IN_CALLBACK_URL`, such as `http://localhost:1337/api/auth/callback`, which GitHub must accept as the App's callback URL; and `GITHUB_SIGN_IN_TEST_TOKEN`, a `ghu_` user token from a real sign-in. Pressing Approve on GitHub is left to the e2e suite.
  - Tests for `GitHubAuth` and `auth/RecheckRole` changed from 00:19 to 00:25, and `worker/ExecutionHost.test.ts` at 00:23. `SignIn.ts`, `SessionKeys.ts` and the scripted GitHub changed at 00:25, and `SignIn.test.ts` at 00:26. No pass result is on record.
  - Not yet: the sign-in UI (`src/features/auth/` still holds only `contract.ts`) and `docs/features/sign-in.md`.
- 00:30 to 00:34 on 2026-10-20, on disk, unreported:
  - `worker/SignIn.ts` and `SignIn.test.ts` changed at 00:30.
  - **The sign-in UI is on disk** in `src/features/auth/` (00:32 to 00:33): `actions.ts`, `api.ts`, `auth.ts`, `metrics.ts`, `schema.ts` and `store.ts`, and the components `AuthContext`, `ComposerGate`, `SignInButton` and `Account`. `contract.ts` changed too. `ComposerGate` is best guess the ask gate: signed out, the composer can't ask.
  - `src/features/auth/auth.test.ts` (00:33 to 00:34). No pass result is on record. Still no `docs/features/sign-in.md`.


- 00:37 to 00:40 on 2026-10-20, on disk, unreported:
  - `worker/SignIn.test.ts` changed at 00:37.
  - **`docs/features/sign-in.md` exists** (00:39). The callback URLs it names: `http://localhost:1337/api/auth/callback` for `pnpm dev`, and the deployed site's `url` plus `/api/auth/callback`. GitHub refuses any other (`redirect_uri_mismatch`, logged as `exchange_misconfigured`). The callback writes in its handler, the one exception 0008 names to every action being a durable flow, because a code is single-use; checking a role again is a flow.
  - Its "Not built yet": `POST /api/questions` still answers a signed-out ask on the server; signing out doesn't drain the outbox or wipe the device's database, and signing in doesn't upload a signed-out person's local asks; sign-out doesn't revoke GitHub's tokens, and the `github_app_authorization` revocation webhook isn't handled; one repository's role per session (per-repository roles are 0007 phase 2).
  - `todo.md` (00:40) says sign-in "is built and not deployed". Before a public deploy: the callback URLs, `POST /api/questions` refusing a signed-out ask, and the "Not built yet" items.
- As of 00:47: no S1 report.

- As of 00:54 on 2026-10-20: no S1 file changed since 00:40 (`src/features/auth/` last at 00:36, `worker/SignIn.test.ts` at 00:37). A plan at 00:53 (scratchpad `plan.log`, whose run isn't on record) creates `SessionSecret` beside the stack ([land and deploy](land-and-deploy-mvp.md)). No S1 report. What S1 hands over, the `src/features/auth/**` wiring and the callback URLs, is in the [app wiring](app-wiring.md) step.

- **About 01:00 on 2026-10-20: S1 reported done, for the code.** Wiring into the app is the lead's ([app wiring](app-wiring.md)).
  - **Routes:** `worker/SignIn.ts` serves `/api/auth/sign-in`, `/api/auth/callback`, `/api/auth/sign-out` and `/api/auth/session`, with GitHub App user authorization and PKCE.
  - **Sessions:** the real `Sessions` layer replaces production's `signedOut`. Migration `0005_sign_in`; signed HttpOnly cookies; Postgres stores only digests and sealed tokens.
  - **Roles:** mapped from the person's GitHub permission onto 0007's four roles, and checked again every hour by `auth/RecheckRole`, a durable flow.
  - **Upstream fix in `@smthrs/integrations`:** GitHub answers OAuth errors with `200 OK`, which the package misread as decode failures; it now classifies them. It also gained `exchangeRefreshToken` ([Effect HttpClient](integrations-effect-httpclient.md)).
  - **Tests:** 63, at 100% coverage on the new code.
  - **Credentials:** `GH_CLIENT_ID` and `GH_CLIENT_SECRET` in `~/.zshrc` map to `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`; Alchemy generates `SESSION_SECRET`; the live test also needs `GITHUB_SIGN_IN_TEST_TOKEN`.
  - **Will registers** `http://localhost:1337/api/auth/callback` in the Smithers GitHub App's settings; today GitHub answers `redirect_uri_mismatch`. The production URL comes after the first deploy.
  - **Policy gaps, moved to the lead's checklist** (scratchpad `final/WIRING.md`): the model endpoint must require Member or above, since today any signed-in person, Guests included, can ask; sign-out must wipe the device's synced data and outbox; sign-out must revoke the token on GitHub's side. `POST /api/questions` goes away with W5 (d), which closes its signed-out hole.
  - **Security:** while reading `~/.zshrc`, S1 printed `TF_VAR_grafana_password` into its transcript. The lead told Will to rotate it: "That transcript stays on this Mac but went through the model, so treat the password as exposed." It is on [decisions for Will](decisions-for-will.md).
- 00:55 to 00:56, on disk: `worker/SignIn.ts`, `SessionKeys.ts`, `src/features/auth/api.ts` and `schema.ts`, S1's last edits before its report.

- About 01:03 on 2026-10-20: the [integrations retries](integrations-durable-retries.md) change makes `@smthrs/integrations` retry only inside flow steps. The sign-in code exchange in `worker/GitHubAuth.ts` runs outside a flow, so it now makes one attempt: a GitHub 429 or 5xx during the exchange fails that sign-in, and the person signs in again. The hourly role re-check, `auth/RecheckRole`, is a durable flow and keeps the engine's retries.
- 01:12: Codex Astra review 3 reviews `SignIn` and `GitHubAuth` as finished work ([code reviews](code-reviews.md)).
- 01:17:57: **review 3's finding 4 (P2, source-verified, not run)** is in the hourly role check ([code reviews](code-reviews.md)):
  - `worker/flows/RecheckRole.ts` dedupes checks by session and time bucket (lines 100 to 120; launch identity at `worker/ChatApi.ts:74`), so a slow check across a bucket boundary can overlap the next bucket's check on another Durable Object.
  - Both read the same refresh token. A redeems it but hasn't stored the replacement; B presents the spent token, is refused, rereads the still-old digest and revokes the session, erasing its tokens. A's `replaceTokens` then fails on a revoked session, and the person is signed out.
  - The existing concurrency test covers a winner that already stored its tokens, not the gap between redemption and storage.
  - Codex's fix: serialize token redemption per session and token generation through the durable flow layer before calling GitHub. Test: pause A after redemption, run B, release A; the session stays live with A's tokens.

- About 01:17 on 2026-10-20: **the wiring agent started** ([app wiring](app-wiring.md)). For sign-in it wires `AuthClient` into `boot.ts`, plus `<AuthProvider>`, `<Account />` and `<ComposerGate>`. It also gates the model endpoint to Member or above, and makes sign-out wipe the device and revoke the GitHub token.
- By 01:19: **finding 4 is accepted and assigned**, with finding 1, to one fix agent: token redemption is serialized per session through the flow layer in `RecheckRole` ([code reviews](code-reviews.md)). Status moved from done to in-progress, since sign-in's code changes again.
- 01:27 and 01:43, on disk: `worker/Actor.ts` limits asking to Member or above (01:27), and `src/boot.ts` adds `AuthClient.layer({ origin, within })` to the app's services (01:43) ([app wiring](app-wiring.md)).
- As of 01:44: `worker/flows/RecheckRole.ts` is unchanged since 23:57 on 2026-10-19; finding 4's fix isn't on disk yet.

- 01:44 to 01:59 on 2026-10-20, on disk, unreported:
  - **Finding 4's fix:** `worker/flows/RecheckRole.ts` (01:50): "Only one check of a session runs at a time, so only one ever redeems its refresh token." The host names the execution after the check it replaces, the session's `role_checked_at`, so every request that finds the same stale role joins it. `auth/KeepRole` keeps the role when GitHub or Postgres fail every attempt. New tests in `RecheckRole.test.ts` (01:52 to 01:58): "requests an hour apart that find one stale role start one check, which redeems the refresh token once", and "a check that fails every attempt keeps the role and records the check, so the next one is new". Codex's exact test (pause A after redemption, run B, release A) isn't among the test names.
  - **Sign-out revokes the token**, best guess the wiring agent's, per its scope: `auth/RevokeGitHubToken { sessionId }` (`worker/flows/RevokeGitHubToken.ts`, 01:53, with tests) is a durable flow with a 5-attempt retry policy. It revokes an ended session's token on GitHub, then forgets the sealed tokens. After the last attempt, `auth/ForgetTokens` forgets them anyway, and the access token lapses within its 8 hours. Signing in again in the same browser starts it for the session that ended. Upstream, `@smthrs/integrations`' `GitHubClient` takes `clientCredentials`, the App's client id and secret, sent as HTTP Basic for GitHub's `/applications/{client_id}/...` endpoints (changeset `integrations-github-client-credentials.md`, 01:49).
  - **Sign-out wipes the device:** `src/features/auth/device.ts` (01:56) adds a `DeviceWipe` service. It marks the wipe and reloads, and the next boot deletes the device's databases before opening them.
  - **In the app:** `<AuthProvider>` in `src/main.tsx`, and `<Account />` and `<ComposerGate>` in `AppShell.tsx` (01:44). `e2e/sign-in.spec.ts` (01:48) has two real-browser cases: "signed out: the composer is gated, ChatApi refuses an ask, and signing in brings the composer back", and "sign out wipes the device: its unsent questions go, and the conversation syncs again from scratch". No run of them is on record, and `src/features/auth/**` and `worker/SignIn.ts` are changing through 01:59 ([app wiring](app-wiring.md)).
  - No report.

- **About 02:16 on 2026-10-20: finding 4 is fixed, reported** by the fix agent for findings 1 and 4 ([code reviews](code-reviews.md)):
  - A role check's execution is named after the session and its `role_checked_at`, not the hour. Every request that sees the same stale role starts the same execution, and `role_checked_at` moves only when a check finishes, so one check per session runs at a time.
  - If all 5 attempts fail, the new `auth/KeepRole` step records the check and keeps the role, so a failed check can't block future ones.
  - **Codex's test, failing first:** one engine per execution, as on Cloudflare. Check A pauses after GitHub redeems the token, a request an hour later runs B, then A is released. The session stays live with A's replacement, and GitHub sees one refresh. With the old hour key the same test ends in `github_refused`. It is the body of `RecheckRole.test.ts` "requests an hour apart that find one stale role start one check, which redeems the refresh token once" (a `redeemed` and `release` pair of `Deferred`s).
  - In `ChatApi.ts` the agent changed only a comment and one parameter name. Its touched files are at 100% coverage; `apps/mvp` typecheck is clean.
- The lead to Will: "one role check runs per session at a time, so an overlapping check can no longer revoke a session mid-refresh."
- 02:18 to 02:23, scratchpad `full2.txt` to `full5.txt`: four full `apps/mvp` runs each fail a different set of `SignIn.test.ts`, `RecheckRole.test.ts` and `ExecutionHost.test.ts` cases, some with Postgres `too many clients already`, some with `Invalid URL` in the test GitHub's `approve`, and one with "a database that fails answers 503" receiving 204. Best guess the shared compose Postgres at its 100-connection limit, since the failing set changes from run to run; not confirmed ([dev stack hygiene](dev-stack-hygiene.md)).
- **Status moved from in-progress to done** at the lead's ruling (about 02:24), as before review 3: the code is done. Its wiring into the app (`e2e/sign-in.spec.ts`, the device wipe, token revocation) is the [app wiring](app-wiring.md) step's, and the callback URL is on [decisions for Will](decisions-for-will.md).
- 04:02 to 04:13 on 2026-10-20, on disk, unreported ([app wiring](app-wiring.md)): `auth.test.ts`'s log-line case is red in the 04:02 and 04:12 unit runs, because sign-out now also logs `persisted write failed` (the new `effect-tanstack-db` log). At 04:13:29 `src/features/auth/actions.ts` waits for the session row's delete to be stored before the wipe. The 04:14 unit run is green: 491 passed, 4 skipped, coverage 100% (scratchpad `wiring/unit4.log`). The real-browser sign-in e2e hasn't run since.
- 04:24 on 2026-10-20 (scratchpad `wiring/e2e-3.log`): both real-browser sign-in cases pass in the full serial run: signed out is gated and ChatApi refuses an ask, and sign-out wipes the device. Status stays done ([app wiring](app-wiring.md)).

## Next

From about 02:24 on 2026-10-20:
- the Fable review of review 3's fixes ([code reviews](code-reviews.md));
- the wiring agent's report: sign-in in the real app, in real-browser e2e with GIFs. Signed out can't ask, a Guest can't, a Member can, and sign-out wipes the device and revokes the token ([app wiring](app-wiring.md));
- rerun `SignIn.test.ts` and `RecheckRole.test.ts` alone, or after Postgres allows 300 connections, to separate load reds from code reds ([dev stack hygiene](dev-stack-hygiene.md));
- Will registers the local callback URL; the production one follows the first deploy.

Until about 02:24 on 2026-10-20 the next step was, from 01:19:
- the fix agent's report on finding 4, with the test Codex asked for: pause A after redemption, run B, release A, and the session stays live with A's tokens. Then the Fable review ([code reviews](code-reviews.md));
- the wiring agent's report: sign-in in the real app, in real-browser e2e with GIFs. Signed out can't ask, a Guest can't, a Member can, and sign-out wipes the device and revokes the token ([app wiring](app-wiring.md));
- Will registers the local callback URL; the production one follows the first deploy.

Until about 01:19 on 2026-10-20 the next step was: the lead fixes or rejects review 3's finding 4, overlapping role checks revoking a refreshing session ([code reviews](code-reviews.md)). Status stays done until the lead rules on it, since the finding wasn't reproduced. Then the lead wires `src/features/auth/**` into the app in the [app wiring](app-wiring.md) step: `AuthClient` in `boot.ts`, `<AuthProvider>` in `main.tsx`, `<Account />` in the header and `<ComposerGate>` around the composer, and the three policy gaps (Member or above at the model endpoint, a device wipe at sign-out, token revocation on GitHub). Will registers the local callback URL; the production one follows the first deploy. S1's report doesn't say whether the e2e tests asked for (signed out can't ask, signed in can, isolation between people) exist; best guess they come with the wiring, through the real app.

Until about 01:00 on 2026-10-20 the next step was: S1's report: e2e tests for signed out (can't ask, 401) and signed in (can), isolation between people, 100% coverage, and the callback URLs. Then Will registers the URLs.

Until 23:39 the next step was: after W5 lands. Phase 1: GitHub App sign-in as the production `Actor` provider, and the ask gate, with e2e tests for signed out (can't ask) and signed in (can).

## Questions for Will

- Approve building 0008 phase 1 now? (No answer. 23:02: the lead queued it after W5. Until it lands, production refuses every ask.) (23:39: started as S1 on the recommendation.)
- Register the callback URLs S1 reports in the Smithers GitHub App's settings. Asked when S1 reports. (00:39: `docs/features/sign-in.md` names `http://localhost:1337/api/auth/callback` and the deployed `url` plus `/api/auth/callback`.) (01:00 on 2026-10-20: asked, for the local URL first; see below.)
- Provide what the live test needs: the App's client id and secret, and a user token from one real sign-in. Best guess: the id and secret come from the deploying environment, as `infra/SignIn.ts` says. Not asked yet; S1's report says what it needs. (01:00 on 2026-10-20: settled without Will. The id and secret are `GH_CLIENT_ID` and `GH_CLIENT_SECRET` in `~/.zshrc`, mapped to `GITHUB_APP_CLIENT_*`; `GITHUB_SIGN_IN_TEST_TOKEN` comes from one real sign-in once the callback URL is registered.)
- **Now, 01:00 on 2026-10-20:** in the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Then, after the first deploy, the deployed URL plus `/api/auth/callback`.
- **Rotate the Grafana password** (`TF_VAR_grafana_password`), which S1 printed into its transcript. Asked 01:00 on 2026-10-20.
