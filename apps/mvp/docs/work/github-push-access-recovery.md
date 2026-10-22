---
title: Restore GitHub push access after token revocation
status: done
area: infra
owner: Will authenticates; lead verifies; Codex curates note
updated: 2026-10-21 21:10 PDT
links: [land-to-main.md, legacy-code-removal.md, exposed-credentials-rotation.md, production-github-app-setup.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Restore authorized repository access.

**Why:** Queued fixes need a working push path.

**Current state:** At 20:56 the lead confirms MacBook authentication with workflow scope and resumes the lander. Will reports mini login at 21:02 and in the 21:04 queue answer; SSH still cannot read its keychain. MacBook push access is restored; mini background authentication is not verified and is not currently needed.

**Next step:** Continue landing; verify mini SSH access only when a job needs it.

**Open questions for Will:** None; do not repeat the completed login request.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


**What:** Restore authorized GitHub CLI access on the MacBook and Mac mini after revocation.

**Why:** Every queued push is blocked; legacy removal also needs workflow scope.

**Current state:** At 20:37 the lead reports push authentication stopped working. At 20:46 it reports Will revoked the token following a leak and provides a safe recovery handoff. There is no successful login or fetch receipt. This is operational CLI access, separate from GitHub App permissions.

**Next step:** Complete interactive login on both machines with the authorized repository, organization and workflow scopes; verify status without printing credentials and verify jj fetch on the MacBook. Then resume the lander. Never store tokens in tracker notes, output or repository files.

**Open questions for Will:** Interactive authentication is still required; no new permission decision is invented.

Evidence: script-filtered lead replies at 20:37–20:46 PDT, session 6253ecf2. Existing credential-rotation history remains in its own note.
