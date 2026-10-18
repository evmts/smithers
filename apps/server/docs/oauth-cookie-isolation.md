# OAuth browser bindings

Land this auth increment before enabling content hosts. It follows the
session/CSRF increment in [host-cookie-isolation.md](host-cookie-isolation.md).
The browser verifier, return path and CLI callback cookies are credentials that
bind central OAuth to the browser that started it. A sibling host could set a
legacy verifier with `Domain=` and complete an attacker's valid OAuth state in
the victim's browser.

HTTPS uses `__Host-smithers_oauth_state`, `__Host-smithers_return_to`, and
`__Host-smithers_cli_callback`. All are Secure and HttpOnly, with Path=/ and no
Domain, so a browser refuses them from any other host. Self-hosted HTTP uses the
separate `smithers_local_` names, selected only from the install's validated
effective origin. Hosted readers refuse legacy and local names.

## Rollout

No database migration is needed. The edge Worker forwards the Cookie header
unchanged and reads none of these names, so it needs no change. An OAuth attempt
started on a backend that still sets the legacy names fails its callback with
an invalid OAuth state; the person signs in again. This failure window is the
whole mixed-version rollout behind the load balancer, not only requests in
flight at cutover: a sign-in started on a new pod and finished on an old one
fails, as does the reverse, so a quick rollout keeps the window short. Legacy
cookies expire within 10 minutes. Hosted readers never accept a legacy name, even during rollout.

## Verification

`TestHostOAuthCookieWorkerdBrowser` drives Chromium through the actual edge in
workerd into the actual Go callback handler with a synthetic identity provider.
A subdomain's legacy verifier and attempted prefixed Domain cookies cannot
complete sign-in on the apex. An apex-issued verifier can. The proof sends no
request to GitHub and uses no real repository or identity credential.

From the repository root:

```sh
go test ./packages/backend/internal/routes -run 'TestHostOAuth|TestOAuth|TestGitHubBrowser|TestAuthCookie|TestCLICallback' -count=1
go test ./packages/backend/internal/compose -run 'TestRouterBrowserAuthOrigin|TestServerRouter_AdminCLIConsentForm' -count=1
```

The browser proof needs `bun`, `node` and installed workspace dependencies. On
macOS it uses installed Google Chrome; start a bounded `caffeinate` first. On
Linux it launches `$CHROME_BIN` when set, otherwise Playwright's Chromium
(`pnpm exec playwright install chromium`). Do not skip the browser proof when
its executable is missing.

The DRI updates the backend before enabling sites. Keep both auth increments
when rolling back a site or edge change. This lane does not deploy or change
live infrastructure.
