# Sign-in

People sign in with the Smithers GitHub App. Each browser holds its own session in Postgres behind a signed, HttpOnly cookie, and every request reads who is asking from it. Signed-out people browse, and can't ask Smithers. This is [decision 0008](../decisions/0008-auth.md) phase 1, with Will's answers in its §11; roles are [decision 0007](../decisions/0007-roles-and-tags.md)'s.

## How it works

```
browser                         ChatApi (worker/SignIn.ts)                     GitHub
"Sign in with GitHub" (a link)
  GET /api/auth/sign-in?return=/app ──▶ state + PKCE S256 pair
                                        sign_in_attempts row (state digest, sealed verifier, 10 min)
  ◀── 302 + state cookie ─────────────── authorization URL ─────────────────▶ the person approves
  GET /api/auth/callback?code&state ◀────────────────────────────────────────── redirect
                                        state == this browser's state cookie?   ─ no ─▶ failed
                                        take the attempt (deleted as read)      ─ none ─▶ failed (replayed)
                                        exchange code + verifier ──────────────▶ ghu_ (8 h) + ghr_
                                        GET /user, GET /repos/<repository> ─────▶ id, login, permissions
                                        people row (GitHub id), sessions row (sealed tokens, role)
  ◀── 303 to /app + session cookie
every request ── cookie ──▶ Sessions.resolve: signature, then the live session row ─▶ Actor or nobody
  role over an hour old ──▶ RoleChecks.start(session, role_checked_at) ──▶ auth/RecheckRole on its Durable Object (no wait)
POST /api/auth/sign-out ──▶ FlowStarter.start(auth/RevokeGitHubToken { session }) on its Durable Object
                              ─ not recorded ──▶ 503, the session and cookie as they were
                            ──▶ end the row (sealed tokens kept), expire the cookie
        the flow: end the row (again: a no-op) ──▶ DELETE /applications/<client id>/token (as the App) ──▶ revoked
                  forget the session's GitHub tokens
  ◀── 204 ──▶ the tab wipes this device's synced data and outbox, and reloads as a visitor
```

- **A button the person presses.** Sign-in is a link; the app never redirects anyone to GitHub on its own, and agents can't press it (decision 0008 §3).
- **The state is bound to the browser that started it.** A callback finished in another browser, or with a state this browser didn't get, signs nobody in and never reaches GitHub (login CSRF).
- **Single use.** The callback deletes its sign-in as it reads it, so a replayed callback signs nobody in, and GitHub redeems a code once and only with the verifier its challenge came from.
- **The callback's writes happen in its handler.** A code is single-use and bound to its request, so a durable retry could not redeem it again; this is the one exception decision 0008 names to every action being a durable flow. Checking a role again, which refreshes GitHub's token, is a flow, and so is signing a session out.

## Routes

| Route | Answers |
|---|---|
| `GET /api/auth/sign-in?return=<path>` | `302` to GitHub with the state cookie; `503 { code: "not_configured" }` without the GitHub App; `503` when Postgres fails. Under `alchemy dev` without the App: `303` to the return path, the local developer signed in again ([Local development](#local-development)) |
| `GET /api/auth/callback?code&state` | `303` to the return path with the session cookie; on any failure `303` to the return path (or `/`) with `?sign_in=failed` |
| `POST /api/auth/sign-out` | `204`, `auth/RevokeGitHubToken` started, the session ended and the cookie expired; `403` when the request doesn't say it came from this site (`Origin`, or `Sec-Fetch-Site: same-origin`); `503` when Postgres fails or the flow's start isn't recorded, with the session and cookie as they were. Under `alchemy dev` without the App: `204` with the dev signed-out cookie |
| `GET /api/auth/session` | `200 { signedIn: false, available }` or `{ signedIn: true, login, role }`; `503` when Postgres fails. `available` is true where the GitHub App is configured, and under `alchemy dev` |

The return path is a path on this site; anything else, including `//host` and `/\host`, returns to `/`. `?sign_in=failed` is dropped from it, so trying again doesn't come back saying it failed. Every answer is `Cache-Control: no-store`.

## Sessions and cookies

| Cookie | https | plain http (local development, mvp.md M-28) | Flags | Lifetime |
|---|---|---|---|---|
| session | `__Host-smithers_session` | `smithers_session` | HttpOnly, SameSite=Lax, Path=/, no Domain, Secure on https | `SESSION_MAX_AGE_DAYS` (30) |
| sign-in state | `__Host-smithers_sign_in` | `smithers_sign_in` | the same | 10 minutes; expired by the callback |
| dev signed-out | `__Host-smithers_dev_signed_out` | `smithers_dev_signed_out` | the same; value `1`, unsigned | 30 days; only where the GitHub App isn't configured and a fallback is signed in (`alchemy dev`) |

- A cookie is `<token>.<HMAC-SHA256>`. Postgres keeps only the token's SHA-256, so reading the database signs nobody in.
- A session ends at its age, at sign-out, when signing in again in the same browser, or when GitHub refuses its tokens. Ended sessions keep their row with `revoked_at` and `revoked_reason`. A session GitHub refused, or whose tokens no longer open, forgets its GitHub tokens at once; a signed-out one keeps them sealed until `auth/RevokeGitHubToken` revokes them on GitHub and forgets them ([Signing out](#signing-out)).
- `Sessions.resolve` reads the row on every request, so a revocation applies to the next request. Postgres unreachable is `SessionsUnavailable`: the model endpoint answers `503 provider_internal`, not a sign-in prompt.

## Roles and role checks

The role is the person's permission on `GITHUB_REPOSITORY` (`GET /repos/<owner>/<name>` with their token), mapped as decision 0007 §9 says, never with more power than GitHub gives:

| GitHub | Role |
|---|---|
| admin | Admin |
| maintain | Maintainer |
| write | Member |
| triage, read | Guest |
| none (a repository they can't see) | no role |

The role is read at sign-in, and again once it is an hour old (`ROLE_RECHECK_MINUTES`; mvp.md M-05). The request that finds it stale starts `auth/RecheckRole { sessionId }` on the remote flow host ([remote-flows.md](remote-flows.md)) and doesn't wait for it.

**One check of a session at a time.** The execution is named after the session and the check it replaces, the session's `role_checked_at` (`auth-recheck-<session>-<epoch ms>`). Every request that finds the same stale role, in this hour or a later one, starts the same execution, and the flow engine runs it once. Only a finished check moves `role_checked_at`, so the next check can't start until this one is over, and only one check ever redeems a session's refresh token.

The flow's steps:

1. `auth/RedeemRefresh`: when the 8-hour `ghu_` token expires within 5 minutes, trades the single-use `ghr_` refresh token once (`Core.OAuthToken.exchangeRefreshToken`) and seals the new pair for the session. Its result, sealed into the run's journal, holds only the encrypted pair and the presented token's digest, never a token in plaintext. It writes nothing.
2. `auth/StoreTokens`: stores the sealed pair over the token it presented, while the session is live. It retries from the journaled result until Postgres answers, so a Postgres failure, or the host dying, after GitHub issued the pair never redeems the spent token again (the regression from Codex review 4).
3. `auth/CheckRole`: reads the permission with the session's current token and records the role.

GitHub refusing the refresh token (expired after 6 months, or used) while the session still holds it, or the access token (the App revoked), ends the session. GitHub or Postgres failing fails `auth/RedeemRefresh` or `auth/CheckRole`, which retry 5 times from 1 second, doubling. When every attempt fails, `auth/KeepRole` keeps the role and records the check, so a request an hour later starts a new one; it retries until Postgres answers.

**The one window no journal closes.** GitHub redeems the refresh token and its answer never arrives (the connection drops, or the host dies before the step seals). Nothing holds the new pair, so the retry, or the next check, presents the spent token; GitHub refuses it, the session ends, and the person signs in again. Each redemption is one step, so this window is the length of one HTTP exchange.

## Signing out

`POST /api/auth/sign-out`, and signing in again in the same browser, sign the browser's session out through the durable flow `auth/RevokeGitHubToken { sessionId }`, on the remote flow host ([remote-flows.md](remote-flows.md)), one execution per session (`auth-revoke-<sessionId>`). The flow owns the whole sign-out: it ends the session (`revoked_reason` `sign_out`), revokes its GitHub token and forgets its tokens.

- **Admitted first.** The handler starts the flow through `Flows.FlowStarter` and waits only for the start to be recorded, never for the flow. A start the host refuses is a `503` (`auth.sign_out` `failed`, reason `not_started`, with the host's code): nothing changed, the session is still live and the cookie still set, so signing out again can finish. Before this, a refused start was logged and swallowed, the sign-out answered `204`, and nothing would ever revoke the token (Codex review 4).
- **Refused at once.** Once the start is recorded, the handler ends the session itself, so its next request is refused without waiting for the flow; the flow's own end changes nothing then. A handler that dies in between leaves the flow to end it.
- **Recoverable.** Sign-out looks for a live session, or one that ended and still holds GitHub tokens nothing revoked yet, such as one signed out before sign-out waited for its flow. Signing out again with that cookie starts its flow; once the flow forgot the tokens, there is nothing to do (`no_session`).
- **Signing in again** admits the sign-out of the session the browser held before it redeems GitHub's code: a start the host refuses fails the sign-in (`?sign_in=failed`, reason `sign_out_not_started`) with nothing redeemed and the session kept. Once the new session is written, the old one ends.

The flow's steps:

1. `auth/EndSession` ends the session, keeping its sealed GitHub tokens; one that ended already is left as it is (`over`). Only Postgres can fail it, and its retry never gives up;
2. `auth/RevokeToken` opens the ended session's sealed access token, and revokes it with GitHub as the App: `DELETE /applications/<client id>/token` with the client id and secret as HTTP Basic and `{ access_token }`. `204` is revoked; `404` and `422`, a token GitHub no longer has, count as revoked. Then it forgets the session's GitHub tokens.

A token that no longer opens (`SESSION_SECRET` changed) is forgotten without reaching GitHub (`unreadable`). A session with no tokens is left alone (`none`), and so is a live one (`live`), which the flow never meets since it ends the session first. GitHub or Postgres failing fails the revocation, which retries 5 times from 1 second, doubling; after the last attempt `auth/ForgetTokens` forgets the tokens anyway (`forgotten`), and its own retry never gives up. A session GitHub refused needs no revocation: its tokens are already dead and forgotten.

**The device.** Once ChatApi answers the sign-out `204`, never after a failed one, the tab forgets the session it last confirmed and wipes this device's synced data and outbox (decision 0008 §4.6) through `DeviceWipe`, the host's `wipe`. In the browser, every page takes part (`src/wipe.ts`, wired in `src/main.tsx`):

1. **Every page holds the data.** From before its program starts until it ends, a page holds the Web Lock `smithers-data`, shared.
2. **Every page leaves.** `wipe` sets the `smithers-wipe` mark in localStorage and tells every page on the `smithers-wipe` BroadcastChannel, its own included. Each page then drops its view, stops its program, which closes the device store and the outbox and ends its engine worker, and loads again.
3. **The next boot deletes once nothing has the data open.** Before `start` opens anything, a marked page takes the exclusive Web Lock `smithers-wipe`, then `smithers-data` exclusively, so it waits until every page that had the data open has ended, and none can write a row back; then the engine's own Web Lock, so no engine worker holds its OPFS files. Only then does it delete the engine's OPFS directory `smithers/<engine name>` (the engine's store and the app's shared database, the device store) and the outbox's IndexedDB database `smithers-outbox`, and clear the mark. Other pages loading at the same time wait for the wipe's lock and find it done. The theme's mirror stays.
4. **A page whose delete still fails never opens the stores.** The mark stays, and the page starts on stores that aren't the device's (`unwiped`): the device store in memory, the outbox in memory, so no ask of the ended session is sent, and no engine, so none of its runs resumes. The pill says Smithers can't run in this browser, with Reload, whose boot deletes again.

The page continues as a visitor. Signed-out visitors can still read the shared conversation shape, throttled per network ([throttling](chat.md#throttling)); decision 0008 decision 8, per-request shape authorization, isn't built, so a visitor's page syncs it again.

## Keys

`SESSION_SECRET` signs cookies (`Core.Signature` from `@smthrs/integrations`) and, through a key derived from it, seals GitHub's tokens and the PKCE verifier with AES-256-GCM (`WebCryptoCipher` from `@smthrs/control`), each bound to its row and column. In a deploy and under `alchemy dev`, Alchemy generates it once and binds it to ChatApi (`infra/SignIn.ts`). Replacing it signs everyone out: their cookies no longer verify, and a role check ends a session whose tokens no longer open.

## Postgres

Migration `0005_sign_in`. None of these tables is synced to browsers.

| Table | Columns | |
|---|---|---|
| `people` | `id` (uuid), `github_id` (unique), `github_login`, `created_at`, `updated_at` | a person, keyed by GitHub's numeric id; the login follows renames |
| `sign_in_attempts` | `state_digest` (key), `verifier` (sealed), `redirect_uri`, `return_to`, `expires_at` | sign-ins in progress; expired rows are deleted when the next one starts |
| `sessions` | `id`, `token_digest` (unique), `person_id`, `role`, `role_checked_at`, `github_access` and `github_refresh` (sealed), `github_access_expires_at`, `github_refresh_digest`, `created_at`, `expires_at`, `revoked_at`, `revoked_reason` (`sign_out`, `github_refused`, `unreadable`) | one per browser sign-in |

## Configuration

| Variable | Default | |
|---|---|---|
| `GITHUB_APP_CLIENT_ID` | none | the Smithers GitHub App's client id; without it sign-in is off |
| `GITHUB_APP_CLIENT_SECRET` | none | its client secret; without it sign-in is off |
| `SESSION_SECRET` | generated by Alchemy | at least 32 characters; shorter turns sign-in off and logs `auth.config` |
| `GITHUB_REPOSITORY` | `smithersai/smithers` | `owner/name`: the repository roles are read on |
| `SESSION_MAX_AGE_DAYS` | `30` | a positive integer |
| `ROLE_RECHECK_MINUTES` | `60` | a positive integer |

ChatApi and the `FlowExecution` Durable Object read them with Effect `Config`. Set the App's two in the deploying environment; Alchemy binds them to the Worker as secrets ([infrastructure.md](../infrastructure.md#credentials)).

**Callback URLs.** The GitHub App must list `<origin>/api/auth/callback` for every origin people sign in from: `http://localhost:1337/api/auth/callback` for `pnpm dev`, and the deployed site's `url` plus `/api/auth/callback`. GitHub refuses any other redirect URI (`redirect_uri_mismatch`, logged as `exchange_misconfigured`). On a loopback host GitHub ignores the port: with only `http://localhost:1337/api/auth/callback` listed, it takes `http://localhost:1338/api/auth/callback` and `http://127.0.0.1:1338/api/auth/callback`, and refuses `http://localhost:1337/other` (checked 2026-10-20). So a second `alchemy dev`, which takes the next free port, signs in for real too.

## Local development

Under `alchemy dev`, `worker/DevChatApi.ts` runs the same program. With `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` in the environment, sign-in is real; without them, a local developer is signed in as an Admin, so the browser's agent can call the model endpoint on a laptop.

The local developer can sign out, so the end-to-end suite tests a signed-out page against `alchemy dev`. Sign out (`POST /api/auth/sign-out`, same-origin check kept) sets the dev signed-out cookie, `smithers_dev_signed_out`, and every request carrying it is signed out; `GET /api/auth/session` says `{ signedIn: false, available: true }`, so "Sign in with GitHub" shows. Pressing it (`GET /api/auth/sign-in?return=<path>`) clears the cookie and answers `303` to the return path, never reaching GitHub. A deploy has no fallback, and none of this applies.

## The browser

`src/features/auth/` follows [state.md](../state.md):

| File | What it is |
|---|---|
| `contract.ts` | the routes, `SessionState`, `signInHref` and the sign-in copy, shared with ChatApi; `mayAsk` and `composerAccess`, which decide what stands where the composer goes |
| `schema.ts` | `SessionState` as it arrives, the tab's `Session` row, and the device's `Confirmed` row |
| `api.ts` | `AuthClient`: `session` (`GET /api/auth/session`) and `signOut` (`POST /api/auth/sign-out`), each under one deadline, failing with `AuthUnreachable` |
| `store.ts` | `AuthStore`: one local row, `loading` until ChatApi answers, then `signed_in`, `signed_out` or `unreachable`; and `auth-confirmed`, the last session ChatApi confirmed, kept on the device (`Persistence`) |
| `actions.ts` | `load` (keeps or forgets the confirmed session), `pressSignIn` (counted) and `signOut` (`signingOut` at once, once at a time; after a `204`, forgets the confirmed session and wipes the device, counted) |
| `device.ts` | `DeviceWipe`: the host's `wipe` as a service, failing with `WipeFailed` |
| `auth.ts` | `Auth`: the `session` and `confirmed` queries and the plain actions; reads the device's confirmed session and asks who is signed in as the app opens |
| `components/` | `AuthProvider`/`useAuth`, `SignInButton` (a link returning to this page; hidden where sign-in is off), `Account` (the login and Sign out, or the button with "Couldn't sign in." after `?sign_in=failed`), `ComposerGate` (what `composerAccess` says: the composer, "Members can ask Smithers.", or "Sign in to ask Smithers." and the button) |

**The composer is for Members and above** (decision 0007 §2, `repo:ask`). `composerAccess` shows the composer when ChatApi says the person is Admin, Maintainer or Member, and "Members can ask Smithers." for a signed-in Guest or a person with no role. While ChatApi hasn't answered, or can't be reached, the session it last confirmed on this device decides, so a Member who reloads offline still asks; with none, nothing shows while it hasn't answered, and the sign-in prompt shows once it can't be reached. The prompt shows only when ChatApi says signed out, or the device never had a session.

**Signed out, nothing leaves the browser.** `ComposerGate` replaces the composer, so a signed-out person has nowhere to type an ask, and the model endpoint refuses a signed-out call with `401` either way. A question already in the outbox that ChatApi refuses with `401` (signed out since) or `403` (not a Member) stays on the device as Not sent (`refused`), with Edit and Discard, and is never sent again.

`appLayer` (`src/boot.ts`) builds `Auth` over `AuthStore`, the device's `Persistence` and `DeviceWipe.layer(host.wipe)`, with `AuthClient` among the browser's services (`realServices`); `boot` renders it, and main.tsx gives it to React through `AuthProvider`. The app's header shows `Account`, and `ComposerGate` wraps the composer (`src/screens/app/AppShell.tsx`).

## Not built yet

- Signing out wipes the outbox without draining it or saying how many asks it discards (decision 0008 §4.6); signing in doesn't upload a signed-out person's local asks.
- The boot-time half of the wipe runs before the program starts, so a finished wipe isn't logged or counted. A failed one shows as the program's `persistence unavailable` and `browser.engine.unavailable` (`error.type` `WipeUnfinished`) records and the `smithers-wipe` mark staying in localStorage.
- The `github_app_authorization` revocation webhook isn't handled; a role check ends the session within the hour instead.
- One repository's role per session; per-repository roles and `Authorize` are 0007 phase 2. The device flow for the TUI and CLI, grants and the visitor cookie are later phases of 0008.

## Tests

Run with the compose Postgres up (`pnpm db:up`). GitHub is the second scripted seam beside the model (`worker/test/github.ts`): it keeps GitHub's rules (a code bound to its challenge and redirect URI, redeemed once; refresh tokens redeemed once), and a test injects a refusal, an outage or a defect per step.

| Test | Proves |
|---|---|
| `worker/SignIn.test.ts` | a sign-out whose flow's start the host refuses (a fault-injected `FlowStarter`) is `503` and keeps the session, and signing out again starts it; a session signed out whose tokens nothing revoked is revoked by signing out again; signing in again whose sign-out can't start fails before GitHub and keeps the old session; the redirect, state and S256 challenge; cookie flags on http and https; return paths; the full sign-in; state mismatch four ways; a replayed callback reaching GitHub once; a code GitHub already redeemed; expiry, denial and a missing code; GitHub failing at each step; a verifier that no longer opens; signing in again; Postgres failing at each route; role mapping for all four roles and none; a stale role starting a check named after the one it replaces, the same one an hour later, and a new one once a check recorded; sign-out revocation, its sealed tokens kept and one revocation started, and the old cookie refused; cross-site sign-out refused; local development's developer signing out with the dev cookie (an ask refused `401`) and back in without GitHub; forged, unknown and expired cookies; sign-in off without the App or with a short secret; a signed-out ask refused (`401`) and a signed-in one answered; no token in any record |
| `worker/flows/RecheckRole.test.ts` | the flow on the Node host; a retried GitHub failure; refreshing an expiring token and using the new one; an expired refresh token ending the session; a refresh rotated, or stored, while the step waited on GitHub; requests an hour apart while a check is paused after GitHub redeemed its refresh token start that one check, one engine per execution as on Cloudflare, and the session keeps its replacement; a replacement Postgres refused to store, then the engine dying and a new one resuming the run, redeems once and leaves the session live with the replacement; a redemption whose answer was lost ends the session; a check that fails every attempt keeping the role; tokens GitHub no longer accepts; unopenable tokens; no token or login in its records |
| `worker/flows/RevokeGitHubToken.test.ts` | sign-out, and signing in again, starting the flow with the sealed tokens kept, and again only while the tokens wait; the flow ending a session still live before it revokes; the flow on the Node host revoking the token on GitHub and forgetting it; a token GitHub no longer has; GitHub down once and retried; every attempt failing and the tokens forgotten anyway; GitHub or Postgres failing each step by reason; an unopenable token forgotten without GitHub; a live session, no session and a session GitHub refused left alone; no token or login in its records |
| `worker/ExecutionHost.test.ts` | the deployed remote host runs `auth/RecheckRole` and `auth/RevokeGitHubToken` over the app's tables |
| `worker/GitHubAuth.test.ts` | the real adapter against a scripted GitHub on loopback HTTP, GitHub's `200 OK` OAuth errors included; revoking a token as the App (`204`, `404` and `422` revoked; `401` and `403` misconfigured; `429` and `502` unavailable) |
| `worker/GitHubAuth.live.test.ts` | the real GitHub: the App's credentials, a callback URL, and a real user token's person and role; each case skips naming the variables it needs |
| `src/wipe.test.ts` | the browser's wipe on Node's Web Locks and BroadcastChannel, with stand-ins for OPFS and IndexedDB: a page still holding the data holds the wipe off, and the wipe then deletes both stores and clears the mark; it waits for the leading engine worker's lock; two pages booting at once delete once; a delete another connection holds off finishes when it closes; a failed delete keeps the mark and opens unwiped; every page, the signing-out one included, stops its program and loads again once; an unwiped page's stores are memory and its engine is unavailable with `WipeUnfinished` |
| `e2e/sign-in.spec.ts` | in a real browser: signing out wipes the device (the unsent question gone, the outbox empty, the shape from offset -1); with two tabs, a tab slow to unload holds the other's wipe off, then both open as visitors with nothing of the session, the mark cleared |
| `src/features/auth/auth.test.ts` | the tab on a Node device: signed out, signed in through GitHub, signing out, sign-in off, ChatApi unreachable, refused or silent; `composerAccess` for every status and role; a Member reloading offline or before ChatApi answers still asking; a Guest or no role seeing the line; ChatApi saying signed out forgetting the confirmed session; a sign-out ChatApi takes leaving no stored rows and an empty outbox, a failed one leaving both; a wipe the host couldn't do counted; no login in its log lines |

The browser half of signing in, pressing Approve on GitHub, belongs to the end-to-end suite with the `codeplanesmithers` test account (decision 0008, E2).

### Verified live (2026-10-20)

Against the Smithers GitHub App Will set up (`smitherspreviewrelease`), on a second `alchemy dev` (stage `live_williamcory`, port 1338, its own database and Electric, `GITHUB_REPOSITORY=roninjin10/smithers-github-tests`), so the shared :1337 kept its local developer:

| What | Result |
|---|---|
| `worker/GitHubAuth.live.test.ts`, every case | 3 of 3 pass on `smithersai/smithers` and on `roninjin10/smithers-github-tests`: the App's client is known, `http://localhost:1337/api/auth/callback` is a callback, and a real `ghu_` token reads its person and role |
| A real sign-in in a browser | `codeplanesmithers`, from a saved browser profile, pressed "Sign in with GitHub": GitHub returned to `/app` signed in, `GET /api/auth/session` said `{ signedIn: true, login: "codeplanesmithers", role: "guest" }` (read on a public repository), and the session cookie was `smithers_session`, HttpOnly, SameSite=Lax. GIF: `~/Desktop/smithers-mvp/gifs/sign-in-github-live.gif` |
| Signing that session out | `POST /api/auth/sign-out` answered `204`; `auth/RevokeGitHubToken` revoked the token on GitHub (`auth.revoke_token` `revoked`) and forgot both tokens; the cookie then reads signed out |

A driver outside the suite does the browser half, since GitHub's own pages are not the app's to test; it hands the session cookie to `e2e/issues.spec.ts` as `E2E_SESSION_COOKIE`.
