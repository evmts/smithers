# 0024 · How e2e tests sign in to a deployment

2026-10-21 · Accepted. The four-model panel on production e2e (Codex Sol, Codex Astra, Claude Opus and Claude Fable) agreed on it, and the Opus merger built it ([infrastructure](../infrastructure.md#against-a-deployment)).

## Decision

The e2e tests sign in to a deployment the way a person does: through GitHub, as the test account `codeplanesmithers`, from that account's persistent browser profile. A Playwright setup project does this once and stores the app's session cookie outside the repository, in `~/.smithers-e2e/<host>/`. Every test in the deployment project starts from it, and later runs reuse it until shortly before it expires.

- **There is no test-only sign-in route, now or later.** One shipped switched off can't sign a test in to production. One switched on is a way into the product that skips GitHub.
- **No test context holds a GitHub cookie.**
  - Only the setup opens the profile, under a lease.
  - It keeps one cookie, the app's session on the app's origin.
  - It records no video or trace.
  - On 2026-10-21, a "look only" probe on the profile signed the account in by accident: Playwright's `context.route` doesn't fire on a redirect hop. A test that holds no GitHub cookie can't repeat that.
- **The session lives outside the repository.** One session serves every jj workspace, and no copy of the checkout carries it.
- **A missing role blocks the run.** It doesn't skip the tests. A test that needs Member while the account is a Guest is reported blocked, and the run fails until the account has the role.

## Consequences

- One account is one person. Tests of two or more people (`devPeople`) run locally until there are more test accounts.
- When GitHub asks for a password or a device code, a person must answer it once in a visible browser on the profile's machine. The setup runs where the profile is.
- A raised role reaches the run only through a new sign-in, because role rechecks are a remote flow. While the account is below Member, the setup signs in again at most every 6 hours.
