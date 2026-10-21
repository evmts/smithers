---
title: Remove the legacy code
status: done
area: repo
owner: legacy-removal agent (Opus), since 2026-10-21 10:59
updated: 2026-10-21
links: [../rulings.md, legacy-smithers-sh.md, ../../../../docs/libraries.md]
---

## What

Delete the old stack's code now that `apps/mvp` is the app, and fix every reference to what is deleted. Git history keeps it: each removal commit names the last `main` commit that still has it, readable with `jj file show -r <commit> <path>`.

## Why

Will, 2026-10-21 10:53 ([rulings](../rulings.md) SCOPE-3 addendum): "Now that mvp is our new app a lot of old app code can be removed. I want us to start removing the legacy code so it doesn't confuse other agents it will still be in git history".

## Inventory (main@origin 78407fce59dd)

| Path | What it is | Tracked files, lines | Importers outside legacy code | Verdict |
| --- | --- | --- | --- | --- |
| `packages/backend` | Old Go backend (ARCH-1) | 5,439, 1,179,874 | Build and CI wiring only: root `PACKAGE.ts` targets, `go.mod`, `docs:check` runs `modelprice/cmd/generate -check`, `.smithers/flows` tests that read `flow_catalog.go` and `builtin_flows.json`, perf and land gates | Remove. `prices.generated.ts` and `ProductApi.ts` stay as committed files |
| `apps/backend` | Go binary for `packages/backend` | 76, 11,170 | Root `PACKAGE.ts` glob only | Remove with `packages/backend` |
| `apps/model-host` | Node bundle the Go backend launches | 10, 1,250 | Root `PACKAGE.ts`; Go tests | Remove with `packages/backend` |
| `packages/smithers-machined` | Old stack's Rust daemon in each microVM (ADR 0004) | 234, 80,508 | Cargo workspace member; root `PACKAGE.ts` `machinedWire` (a Go test) | Remove |
| `apps/app` | The old app ("v4") | 2,238, 388,087 | **`apps/site`**: mounts `AppIsland` on the home page, imports `RepositoryOpenForm`, `FrameHistory`, `BugReport`, projects `apps/app/src/docs` onto smithers.sh/docs, typechecks app sources; `evals/docs` evaluates its docs pages | Remove (lead, 11:05): move its docs pages into `apps/site`, drop the old app island |
| `apps/server` | Old smithers.sh edge Worker (ARCH-1) | 130, 20,405 | **`pnpm docs:sync` and `docs:check`** write and check `apps/server/src/docsRedirectMap.ts`; `apps/site` deploys through its `wrangler.jsonc` and reads `publicRepoCatalog.ts`; `apps/app` devDependency | Remove (lead, 11:05): move the docs redirect map into `apps/site` |
| `evals/docs` | Evals over `apps/app/src/docs` pages | 21, 1,665 | None | Goes with `apps/app` |
| `@smthrs/chain`, `@smthrs/harness-detect` | Private agent libraries | 108, 17,303 | Only `apps/app` depends on them, but each has API reference pages on the site and `chain` has a skill | Keep (libraries) |
| `apps/bug-worker` | bug.smithers.sh intake that `smthrs bug` posts to | 29, 1,793 | Installed CLIs | Keep |
| `apps/patterns-site` | Static patterns.smithers.sh page | 4, 608 | None | Keep for now (lead, 11:05). Its `wrangler.jsonc` conflicts with ARCH-3 (no Wrangler config); follow-up: move it to Alchemy or delete it |
| `packages/smithers-ffi` | Native jj C ABI; `smithers-jj-export` | — | `docs:check` needs `smithers-jj-export` | Keep (jj library) |
| `packages/rpc` | Shared contracts | — | `apps/mvp`, `apps/tui`, `@smthrs/model-host` | Keep |
| Plue | Old GKE deployment | — | Lives in a separate repository, not here | Nothing to delete here |

Kept by ruling (root `AGENTS.md`, "Libraries we keep"): the build system, the public library packages, jj, the time-travel and recovery libraries, and decoding of persisted history.

## State

Done in one commit (the pieces depend on each other: `apps/app/PACKAGE.ts` imported `packages/backend`, the Go suites ran the app's clients, and the app depended on `apps/server`). Every removed path is readable at `78407fce59dd`.

- Removed: `packages/backend`, `apps/backend`, `apps/model-host`, `packages/smithers-machined`, `docs/api`, `apps/app`, `apps/server`, `evals/docs`, `apps/UPSTREAMS.md`, the `perf` flows, the Go migration renumbering in `land`, the Go and old-app fault tiers in `@smthrs/cli`, and the `apps-deploy`, `canary` and `reference-host` workflows.
- Moved: the app docs pages to `apps/site/docs/app`; the docs redirect Worker to `apps/site/docs-redirect` (`pnpm docs:sync` writes its map there).
- The site's home page no longer mounts the old app: no island, sign-in, open form or Start app button; `/<owner>/<repo>` pages are gone.
- `smthrs open` no longer starts a checkout's dev build (changeset `open-without-old-app`).
- Kept: `apps/bug-worker`, `packages/smithers-ffi`, `packages/rpc`, `@smthrs/chain`, `@smthrs/harness-detect`, `apps/patterns-site`, the release and npm workflows (GH-9), and the `.gitignore` rules for old build output, so leftover local files in other workspaces stay untracked.

## Next

- `apps/patterns-site` deploys with Wrangler config, which ARCH-3 bans: move it to Alchemy or delete it.
- `apps/site/docs-redirect` also deploys with Wrangler config: same follow-up.
- Live code still names the removed microVM daemon's binary (`/opt/smithers/bin/smithers-machined` in `.smithers/flows/coding/agentTerminal.ts` and `filesystem.ts`) and the old Mac bundle's `bin/smithers-server` (`packages/smithers/src/internal/backend/HostService.ts`, the deferred self-host path).
- The reference-host runner hooks (`.github/scripts/reference-host`) now admit no workflow.
- `@smthrs/rpc`'s `WorkerFailureCodes` and `NativeFailureCodes` describe hosts that no longer exist; only the redirect Worker imports the first.

## Questions for Will

None.
