---
title: Auth design (one GitHub identity; sign in to ask)
status: in-progress
area: design
owner: auth agent (Opus) designed it; Will answered on 2026-10-19; S1 built phase 1 (started about 23:39, reported done about 01:00 on 2026-10-20); the wiring agent closes its policy gaps (since about 01:17); a fix agent serializes token redemption (Codex Astra review 3's finding 4, since about 01:19); later phases unassigned
updated: 2026-10-20
links: [app-wiring.md, decisions-for-will.md, ../decisions/0008-auth.md, ../decisions/0007-roles-and-tags.md, ../todo.md, roles-and-labels.md, sign-in.md, model-endpoint.md, code-reviews.md]
---

## What

Every request and flow step carries one `Actor`. Better Auth runs through `@alchemy.run/better-auth` on our Postgres. People sign in with the Smithers GitHub App. Each client (web, TUI, CLI) holds its own revocable session; agents, flows and sandboxes hold grants that can never approve, merge, sign in or grant.

## Why

Will: "we should support auth but we also should support unauthenticated users using the app ... The reason why I asked for that to be a TODO is because we really want to architecture our auth a bit later with high level of intention so it works for everything".

## State

- Decision 0008 is proposed. Nothing is built.
- Will's answers, 2026-10-19:
  - "Yes smithers github app for sign in".
  - Signed out: "we store it in their browser but never sync it to our backend and any features that can't be done browser first are disabled in general".
  - Alerts: anybody using the app at all ([token-spend alerts](token-spend-alerts.md)).
- Then: "Let's not allow people to talk to smithers if not logged in for now let's enforce the rule in the straight forward way and I may change it later". So every model call stays a durable flow, with no stateless exception.
- 0008 §11 records all of it: no guest rows on the server; on sign-in, local data uploads through the outbox.
- 22:48 on 2026-10-19: 0007's roles became four: Admin, Maintainer, Member and Guest ([roles and labels](roles-and-labels.md)). "Guest" there is a repository role for an untrusted contributor who files issues, comments and opens PRs from forks. Best guess: a Guest is signed in, unlike a signed-out visitor, for whom 0008 keeps no rows on the server. Neither record says so yet.
- About 23:06: 0007 is accepted with four roles and settles the 22:48 guess. On a public repository every signed-in person without a role counts as a Guest; a signed-out visitor holds no role and reads public repositories. GitHub read or triage maps to Guest. Roles do nothing until 0008 ships identity ([roles and labels](roles-and-labels.md)).

- 23:39: the [model endpoint](model-endpoint.md) shipped the identity seam: an injected `Sessions` service whose production layer refuses everyone with 401, and a local Admin in dev only (`worker/DevChatApi.ts`).
- 23:39: **S1 started phase 1** ([sign-in](sign-in.md)): GitHub App user authorization with PKCE, a real `Sessions` implementation, cookie sessions in Postgres, role mapping onto 0007's four roles, and `src/features/auth/**`. Will registers the callback URLs S1 reports. 0008's file status still reads "proposed".

- By 00:04 on 2026-10-20, on disk, unreported: S1's server half of phase 1. It has the four `/api/auth/*` routes, Postgres sessions (`0005_sign_in`), and `auth/RecheckRole`, a durable flow that rechecks an hour-old role with GitHub. No tests yet ([sign-in](sign-in.md)).

- 00:16 to 00:26 on 2026-10-20: S1 added tests, including a live test against the real GitHub that skips without the App's credentials. No report yet ([sign-in](sign-in.md)).

- **About 01:00 on 2026-10-20: phase 1 is built**, not yet wired into the app or deployed ([sign-in](sign-in.md)). GitHub App sign-in with PKCE, the real `Sessions` layer, signed HttpOnly cookies, Postgres holding only digests and sealed tokens, roles mapped onto 0007's four and rechecked hourly by the durable flow `auth/RecheckRole`. 63 tests at 100%.
  - Three policy gaps went to the lead's wiring checklist ([app wiring](app-wiring.md)): the model endpoint must require Member or above, per 0007, since today a signed-in Guest can ask; sign-out wipes the device's synced data and outbox; sign-out revokes the token on GitHub.
  - Will registers `http://localhost:1337/api/auth/callback` in the GitHub App; GitHub answers `redirect_uri_mismatch` until then.

- About 01:17 on 2026-10-20: the wiring agent started closing phase 1's three policy gaps in the app: the Member gate on the model endpoint, a device wipe at sign-out, and token revocation on GitHub ([app wiring](app-wiring.md)). On disk at 01:27, `worker/Actor.ts` limits asking to Member or above.
- By 01:19: Codex Astra review 3's finding 4, overlapping role checks revoking a refreshing session, is assigned to a fix agent. It serializes token redemption per session through the flow layer in `RecheckRole` ([sign-in](sign-in.md), [code reviews](code-reviews.md)).

## Next

The finding 4 fix agent's report, then the Fable review ([sign-in](sign-in.md), [code reviews](code-reviews.md)). Phase 1 reaches the app in the [app wiring](app-wiring.md) step (running since about 01:17 on 2026-10-20), with its three policy gaps closed and an e2e test that signed out can't ask and signed in can. 0008's status line can read accepted. Later phases, such as device sessions for the TUI and CLI and per-repository roles (0007 phase 2), follow 0008's plan and have no owner.

Until about 01:00 on 2026-10-20 the next step was: S1's report ([sign-in](sign-in.md)). Then 0008's status line can read accepted, since Will's answers are in §11 and phase 1 is built on them. Later phases, such as device sessions for the TUI and CLI, follow 0008's plan.

Until 23:39 the next step was: build [sign-in](sign-in.md); it is now on the critical path to a public deploy.

## Questions for Will

None open. Will may revisit signed-out asking later.
