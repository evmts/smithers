# Repository site cutover

The lane supplies source and local proof. Only the DRI deploys, changes private
infrastructure, or publishes Effeck content. Land the host-cookie increment first.
Compare [prebuilt publication](repo-sites-prebuilt-design.html) with
[Smithers-built publication](repo-sites-build-design.html). Prebuilt upload is selected.

## Deployment order

1. Land and deploy [host-isolated session/CSRF cookies](host-cookie-isolation.md) and [OAuth bindings](oauth-cookie-isolation.md) in the
   backend and web client. Expect one re-login. Verify Secure, Path=/, no Domain,
   and rejection of legacy cookies before enabling any content host.
2. Land the site backend/edge and app/CLI increments. Keep
   `SMITHERS_SITES_ENABLED=false` until both backend and edge contain them.
3. Update the private backend pin, use its existing deployment path, and dispatch
   the existing **Deploy apps** workflow with the explicit landed revision as
   `ref`. Follow [DEPLOY.md](../DEPLOY.md); do not deploy branch build artifacts.
4. Enable sites in the private deployment configuration, create wildcard DNS and
   route it to the existing Worker, then verify first-party site resolution.
5. Enable Cloudflare for SaaS with a working fallback origin and SaaS CNAME target.
   Route custom-hostname traffic to the same Worker and preserve its incoming
   Host. Only then attach a custom domain. Never remove Effeck's current serving
   route before the new certificate and all required URLs pass a smoke test.

The workflow receipt must identify backend and edge revisions. Read
`https://smithers.sh/__build.json` and `/api/bootstrap`; a successful dry bundle
is not evidence of live backend adoption. This lane did not dispatch a workflow.

## Backend and private Helm settings

| Setting | Value / meaning |
| --- | --- |
| `SMITHERS_SITES_ENABLED` | Defaults false; enable after cookie adoption and edge/backend rollout. |
| `SMITHERS_SITES_SUFFIX` | `smithers.sh`; the directory allocates globally unique lowercase labels. |
| `SMITHERS_SITES_FIRST_PARTY_ORG_IDS` | Comma-separated **local database organization IDs** pinned by the operator to the verified first-party orgs. Empty means no subdomains. Slug spelling grants no authority. Look up the actual Effeck and Smithers rows; do not invent IDs. |
| `SMITHERS_SITES_CNAME` | The deployment's SaaS CNAME target, for example `sites.smithers.sh`. |
| `SMITHERS_SITES_CLOUDFLARE_ZONE` | SaaS zone ID. |
| `SMITHERS_SITES_CLOUDFLARE_TOKEN` | Secret injection with only required Custom Hostnames permissions; never put its value in reports, cards or traces. |
| `SMITHERS_AUTH_SESSION_COOKIE_NAME` | `__Host-smithers_session`. Keep secure cookies. |
| `SMITHERS_AUTH_GITHUB_REDIRECT_URL` | The existing central callback at `https://smithers.sh/api/auth/github/callback`. No custom-domain callback is added. |
| `SMITHERS_SERVER_TRUSTED_PROXY_HOPS` | Match the actual ingress chain. Direct public callers must not be able to supply trusted forwarding headers. |

For Workers as the SaaS fallback, create an originless proxied fallback record
(for example AAAA `100::`) and make the configured SaaS CNAME target point to it.
Assign the SaaS zone's `*/*` Worker route to the existing `smithers-mvp-web`.
Retain the more specific docs-redirect routes; explicitly exempt infrastructure
hosts that must bypass this Worker. The broad route also receives custom
hostnames, so individual customer Worker routes are unnecessary. This is the
[official Worker-as-fallback setup](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/).
Record the previous route/DNS configuration before changing it. Review hostname
priority and O2O behavior for an already-Cloudflare-hosted domain before Effeck's
cutover; retain its old serving route until replacement smoke tests pass.

The edge retains `SMITHERS_BACKEND_ORIGIN` and `ASSETS`. Optional
`SMITHERS_APP_HOSTS` lists control-plane hosts; never include wildcard content
hosts. Other hosts resolve through the product directory and fail closed.
The app bundle uses reserved `/__smithers/` assets. Publications cannot claim
that prefix, `/api`, or the configured app prefix.

The blob adapter must implement both `blobs.Store` and `blobs.Putter`; a read-only or signing-only adapter cannot publish. The existing blob adapter stores immutable publication bytes. Metadata uses
`install_settings` keys under `sites/`, with ordered transaction locks, owner
rechecks and compare-and-swap activation. No new dependency or SQL migration is
required. Keep blob storage and product settings in backup/restore together.

Extend private Helm env/secret injection for these settings and keep its explicit
control origins. **Do not add a wildcard allowed origin.** Bound site hosts are
admitted dynamically for their own requests; removal revokes that admission.
Self-hosted origins still use InstallAddress. The research citation to private
`infra/helm/smithers/values.yaml:157` remains unverified: this lane never opened
or changed the private repository. No private patch is necessary for product
logic; the DRI supplies deployment configuration and backend adoption.

## Owner operations

The app's `/site` form performs status, enable, activate, and domain add, verify
and remove through the same owner-only HTTP seam as the CLI. DNS results appear
in the transcript; work acknowledges after persistence and continues in the
background. CLI publication uploads a directory built by the owner:

```sh
smthrs site enable --repo effeck/effeck --appPrefix /repo/
smthrs site publish ./docs/dist --repo effeck/effeck --yes
smthrs site status --repo effeck/effeck
smthrs site domain add effeck.dev --repo effeck/effeck
smthrs site domain verify effeck.dev --repo effeck/effeck
```

Use the actual repository coordinates, not these examples if the imported row
has a different owner. The DRI builds/publishes content after landing. The CLI
rejects symbolic links, unsupported files, empty publications, more than 512
files and more than 16 MiB. The backend repeats path/size/integrity checks.
Uploads never run repository build code. A stale activation returns 409; it does
not overwrite a newer site. Exact files, explicit index aliases and Markdown
copies preserve `/`, `/spec/...`, `/setup.md`, `/llms.txt` and each `.md` URL.
Unclaimed paths use the existing repo-scoped app. The app prefix always wins.

All checked-in docs redirect names plus `build` and infrastructure names are
reserved. This revision contains 48 unique redirect routes; the inventory test
checks every one rather than assuming the research's count of 49.
Only operator-pinned first-party organizations get Smithers subdomains. Other
repositories can enable a site with no name and attach a verified custom domain.

## Domain verification, renewal and removal

Create the exact records displayed by the owner action: the product's fresh
`_smithers` TXT claim, configured CNAME target, and Cloudflare ownership/DCV
records. TXT proves the claim; DNS routing, hostname `active`, and SSL `active`
are separate binding conditions. Cloudflare handles certificate issuance and
renewal. Keep required TXT/delegated DCV records present. See the official
[setup/readiness contract](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)
and [Custom Hostnames API](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/).

`domain verify` refreshes records/status explicitly. Resolution rechecks a
custom host after 60 seconds; a provider/DNS failure or inactive certificate
refuses it. Status exposes checked time, verification, certificate readiness,
binding and a sanitized provider error. No separate background scheduler is
implemented; Cloudflare manages renewal, and active traffic or an explicit
verify refreshes the product projection.

```sh
smthrs site domain remove effeck.dev --repo effeck/effeck
```

Removal tombstones the product Host and invalidates its transfers and scoped
sessions before provider deletion. A failed deletion stays unbound; retry remove.
Re-add is refused while provider cleanup remains uncertain, then requires a new
TXT claim. [Provider deletion also removes issued certificates](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/delete/).

## Central sign-in and cells

Sign-in starts only on the person's action. The destination sets a host-only
challenge and sends a request ID to smithers.sh. Central GitHub OAuth retains
its existing callback. A CSRF-protected human confirmation names the destination;
a short-lived, single-use proof returns there. The backend consumes it against
the destination state, current binding and exact Host before minting a new
host-scoped session. Session keys never travel in URLs. Account token minting,
other repositories and personal conversations are refused from a content host.
The guest lane’s repository-specific discovery/chat paths remain available under its own admission and budget policy. Only repository-safe capabilities are advertised; global chat/model/terminal
APIs remain unavailable on content hosts until their repository authority is
provided by their owning lane. Guest chat and budgets belong to eh-guest.

For cells, the deployment directory selects a fixed cell origin by verified Host.
The same publication/blob/DNS/certificate ports and origin/session checks remain
in that cell. No owner can choose a proxy destination. This increment uses the
current shared backend directory/store; it does not provision cells or implement
the future central directory-to-cell identity assertion adapter.

## Proof and rollback

```sh
go test ./packages/backend/reposites -count=1
go test ./packages/backend/internal/middleware -run 'TestRepositorySite|TestHostCookie' -count=1
go test ./packages/backend/internal/compose -run TestRepositorySite -count=1
(cd apps/server && bun test --isolate src/edge.test.ts src/repositorySites.test.ts)
pnpm --filter smithers-server check
```

The composed HTTP tests use real auth/CSRF, filesystem blobs, the actual edge in
workerd, Chromium viewing the published root and app marker, and the actual Cloudflare client against a local fake API. PostgreSQL
adapter integration and deployed DNS/certificates require DRI receipts; local
substituted persistence is explicitly not a database integration receipt.

Disable site hosting before rolling back cookie isolation. Keep the cookie fix
in every serving version while same-site content hosts exist. To roll back
content without changing DNS, activate a retained immutable version:

```sh
smthrs site activate VERSION --repo effeck/effeck --expected CURRENT
```

For a domain incident, remove/unbind first, then retry provider cleanup. DNS
removal alone does not revoke product Host authority. Preserve the old Effeck
route until the replacement serves all required URLs and sign-in is verified.
No live Cloudflare, DNS, GCP, Helm, deployment or Effeck publication action was
performed by this lane.
