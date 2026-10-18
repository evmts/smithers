# Host-isolated browser cookies

Deploy this increment before enabling repository content hosts.

Hosted sessions use `__Host-smithers_session`, and double-submit CSRF uses
`__Host-smithers_csrf`. Both use `Secure`, `Path=/`, and no `Domain` attribute.
The session cookie is HttpOnly. Legacy cookie names no longer authenticate;
people sign in once after the backend and web client update. Existing database
sessions expire normally. A legacy environment override cannot restore the old
name or disable the hosted Secure attribute.

Self-hosted HTTP uses `smithers_local_session` and `smithers_local_csrf`, selected
only from the install's validated effective origin. HTTPS installs use the
host-isolated names.

## Verification

`TestHostCookieWorkerdBrowser` drives Chromium through the actual edge in
workerd into the backend AuthLoader. A subdomain sets a legacy Domain cookie
and attempts prefixed Domain cookies. The apex remains anonymous; an
apex-issued host-only cookie authenticates. All identities are synthetic.

From the repository root:

```sh
go test ./packages/backend/internal/middleware -run TestHostCookie -count=1
go test ./packages/backend/internal/routes -run 'TestAuthCookie|TestSessionCookieName' -count=1
pnpm --filter smithers-server check
pnpm --filter smithers-app typecheck
```

On a Mac, start a bounded `caffeinate` before browser verification. The test uses
headless Chrome and never opens Arc.

## DRI cutover and rollback

Land this increment before the site increments. Update the private deployment's
`SMITHERS_AUTH_SESSION_COOKIE_NAME` to `__Host-smithers_session` and retain secure
cookies; the public backend also rejects an unsafe old override. Deploy the
matching backend and app revisions through the existing deployment workflow.
This lane does not deploy or change Helm, DNS, or Cloudflare.

If rollback is necessary, disable repository content hosts first. Keep the cookie
isolation change in every serving backend and browser client while same-site
content hosts exist. Do not roll back to shared-domain credential names.
