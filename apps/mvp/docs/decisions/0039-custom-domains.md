# Custom domains

Status: accepted by the builder for SCOPE-12 and SCOPE-13 (2026-10-21); Will reviews it with the feature (HOST-3).

Will, 2026-10-21: "add support to smithers for configuring your own domain in same way you can on vercel", and "the ability to configure these domain should be highly auth hidden and it will need to include good ui for it like you do on vercel". The first domain is vibelang.sh, pointed at the VibeLang repository's app on smithers.sh.

## Decision

1. **Cloudflare for SaaS custom hostnames on the deployment's zone (smithers.sh).** Each domain is one custom hostname (`POST /zones/<zone>/custom_hostnames`, `ssl.method: http`, `ssl.type: dv`). The Worker is the fallback origin: a placeholder proxied record (`AAAA 100::`) as fallback origin, and a Worker route that takes custom-hostname traffic ([Worker as origin][worker-origin]). Cloudflare issues and renews the certificate. Free, Pro and Business include 100 hostnames, then $0.10 each a month ([plans][plans]).
2. **A domain maps to one repository.** `domains (hostname PRIMARY KEY, repo_id, …)`: a hostname belongs to at most one repository, and a repository may have several. The site Worker reads the request's `Host`; a host that is an active domain serves that repository's app at its root. Sign-in stays on the deployment's own host, so a custom domain serves visitors only.
3. **The provider is a service (ARCH-7).** `DomainProvider` has `ensure(hostname)` (find, else create: a retried step never creates twice), `status(id)` and `remove(id)`, returning the records to add, the verification state and the certificate state. Two layers implement it:
   - `Cloudflare`: the custom-hostnames API above, chosen with `DOMAINS_PROVIDER=cloudflare`, `DOMAINS_ZONE_ID`, the Worker secret `DOMAINS_API_TOKEN` and `DOMAINS_CNAME_TARGET`.
   - `Dns`: the host's own TLS, for development, the end-to-end tests and a self-hosted or native deployment. It verifies by a real DNS-over-HTTPS lookup of the CNAME (never by a shared address, which a CDN gives many owners) and reports the certificate as `unmanaged`.
   No `DOMAINS_PROVIDER` is `off`: every write route answers `503 off`; existing rows stay readable to Maintainers. Unhappy paths are tested with faulty `DomainProvider` layers, never a scripted fake.
4. **Verification is a durable poll (DUR-1, DUR-2).** `domain/Add` claims the row, then hands off to `domain/Verify`, a `Poll.make` lineage: each attempt runs `domain/Check` (ensure, read the status, write the row), waits on a durable timer, and checks again: every minute at first, then a minute longer each time, for about 7 days, Cloudflare's own window ([backoff schedule][backoff]). A row removed meanwhile ends the poll. `Refresh` starts a new poll and keeps the row's state and registration until its first check; it never brings back a removed domain. No sweep, cron or retry loop of our own.
5. **What the maintainer adds.** A subdomain: `CNAME <host> → DOMAINS_CNAME_TARGET`. An apex: the same target as `ALIAS` (CNAME flattening), because Cloudflare serves an apex A record only with Enterprise apex proxying. Cloudflare's ownership record (`TXT _cf-custom-hostname.<host>`) and a certificate's TXT validation record are shown when Cloudflare returns them. A zone already on Cloudflare (vibelang.sh) validates in real time once the CNAME is in place ([pre-validation][prevalidation]).
6. **States.** A row's `state` is `pending`, `active` (the hostname and its certificate are active), `failed` or `removing`; `verification` and `certificate` are each `pending`, `active` or `failed` (`unmanaged` for a certificate the `Dns` provider leaves to the host); `problem` says why: `taken` (Cloudflare refuses the hostname as in use), `blocked`, `timed_out` (the poll ran out), `unreachable` (the last check couldn't reach the provider; the poll goes on) or the provider's own reason, such as "custom hostname does not CNAME to this zone".
7. **Permissions.** Adding, refreshing and removing a domain is `repo:domain-write`: a Maintainer or Admin acting in person. An agent, flow or sandbox acting for them is refused (`person_only`, decision 0017), and so is every other role. The `domains` shape syncs rows only to a Maintainer or Admin in person; anyone else gets no rows, and the Settings section renders only for them. Every change is a `domain_events` row with the person and the step's invocation key.

## Alternatives

| Option | Why not |
|---|---|
| Worker Custom Domains | Needs the domain's zone in our Cloudflare account. vibelang.sh would work; a customer's domain wouldn't. |
| Workers for Platforms | Dispatches to per-tenant Worker scripts. Our repositories share one Worker, and vanity domains still need SaaS custom hostnames. |
| Our own ACME (on-demand TLS behind Caddy) | Leaves Cloudflare's edge (ARCH-3) and makes us run certificate storage and renewal. Kept as the `Dns` provider's job for self-hosting. |
| A records at the apex | Cloudflare for SaaS supports them only with Enterprise apex proxying. |
| Poll from the browser, or a cron | A browser poll stops with the tab; a cron is a sweep (DUR-2). |

## Not in this slice

Serving a custom host from the site Worker, and the fallback origin and Worker route in `alchemy.run.ts`, land with the smithers.sh cut-over. Real Cloudflare calls run once from the MacBook (`worker/domains/Cloudflare.live.test.ts`).

[worker-origin]: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
[plans]: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
[backoff]: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/backoff-schedule/
[prevalidation]: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/
