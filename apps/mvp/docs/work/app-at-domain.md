---
title: The app at its domain, with the docs beside it
status: in-progress
area: infrastructure
owner: smithers-sh builder (Claude Opus)
updated: 2026-10-21 21:45 PDT
links: [../infrastructure.md, ../rulings.md, prod-e2e.md]
---

**What:** Will, 2026-10-21 about 20:35: "we need to deploy the app to smithers.sh the current app is still the way older app". The hosted domain serves this app, and every existing `/docs/...` URL keeps resolving.

**Before:** a zone route `<domain>/*` sent the whole hostname to the old app's edge Worker, which served `apps/site`'s Astro build (landing, `/docs/**`, `/changelogs/**`, `llms.txt`) and proxied `/api/*` to the old backend. An older Worker held the hostname as a custom domain, shadowed by the route. After the legacy removal, nothing in the repository deploys `apps/site`.

**Design** ([infrastructure.md#domain](../infrastructure.md#domain)):
- `APP_DOMAIN` (`infra/Domain.ts`) names the hostname. A production deploy without it stops before changing anything. `workers.dev` means no domain.
- The site Worker takes it as its custom domain. The docs site (`infra/DocsSite.ts`) claims only its own paths there with zone routes, which outrank a custom domain. This is Alchemy's "federating one hostname across Workers" pattern: no gateway code in either Worker.
- `DOCS_SITE_PATHS` (`src/pwa.ts`) is the one list. The routes come from it, and so do the service worker's navigation denylist and shell-cache exclusion. Without them, one visit to the app made the service worker answer every later `/docs/**` navigation with the app's shell.
- Not carried over: the 1,306 Mintlify-era `_redirects` rules outside `/docs` and `/changelogs` (`/components/*`, `/rpc/*`, …). Each lands on `/docs/installation/`, and routing them would take those owners' `/<owner>/<repo>` from the app.
- `www.<domain>` redirects to the domain through `APP_DOMAIN_REDIRECTS` (Alchemy's `domain.redirects`), once the deploy token could write the zone's redirect rules (Will, 21:07).

**Evidence:**
- 2026-10-21: `infra/Domain.test.ts`, `src/pwa.test.ts` and `e2e/target.test.ts` pass. `src/pwa.build.test.ts` finds the docs pattern twice in the built `sw.js`. Typecheck passes.
- 2026-10-21: `e2e/docs-site.spec.ts` against a preview of the production build: the service-worker test passes. Against the previous build's `vite.config.ts` and `src/pwa.ts`, it fails (`fromServiceWorker` is `true` for `/docs/installation/`).
- The docs site builds in 22 s (115 pages, `check-built-site` 0 failures).

- 2026-10-21 21:26 PDT: production runs `7c4f77086cc1` at the domain. The one-time move detached the hostname from the old site Worker and deleted the old `<domain>/*` route; the deploy failed once on Node 26's HTTP/2 fetch ("The session has been destroyed") and passed over HTTP/1.1, about 6 minutes of downtime. Smoke: `/`, `/app` and `/<owner>/<repo>` are the app, `/api/auth/session` answers, `/docs` and `/docs?ref=x` reach the docs, `llms.txt` with and without a query is the docs site's, and all 111 docs, changelog and legal URLs of the old sitemap answer 200. GitHub already accepted `https://<domain>/api/auth/callback`.

**Left:** the production e2e at the domain, and moving `www` off the old Worker's route.
