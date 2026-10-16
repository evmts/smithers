/**
 * Targets for the repository's operator and release scripts.
 *
 * Every gate under `scripts/` is declared here, so `smithers-build test '//scripts/...'`
 * is the whole of what CI used to spell as seven `node --test …` and
 * `node scripts/….mjs` strings. The scripts keep living beside the thing they
 * guard; what changed is that the build system now knows about them, which means
 * they are planned, addressable by label, and runnable locally by the same name
 * the pipeline uses.
 *
 * The interpreter comes from the root runtime declaration. Nothing here spells
 * `node`.
 */
import { Smithers } from "@smthrs/targets"
import { readdirSync } from "node:fs"
import { listFiles } from "../packages/repo-targets/contracts/check-tracked-hygiene.mjs"
import { repoRoot } from "./workspace-packages.mjs"
import { backendSQLC, Package as backendPackage } from "../packages/backend/PACKAGE.ts"

/**
 * Everything under `scripts/`, digested as the input of every gate here.
 *
 * Both extensions: a gate written in TypeScript is as much an input as one
 * written in `.mjs`, and a glob that saw only `.mjs` would leave an edit to it
 * out of the digest every gate here is keyed on.
 */
const sources = [
  Smithers.glob("//scripts/**/*.mjs"),
  Smithers.glob("//scripts/**/*.ts"),
  Smithers.glob("//scripts/fixtures/**/*.json"),
  // Repository contract modules these scripts import from their package.
  Smithers.file("//packages/repo-targets/contracts/check-single-effect-version.mjs"),
  Smithers.file("//packages/repo-targets/contracts/check-tracked-hygiene.mjs"),
  Smithers.file("//packages/repo-targets/contracts/check-tracked-hygiene.d.mts")
]

/** The whole checkout is the subject of repository-wide engineering gates. */
const repositoryPackages = Object.fromEntries(
  [...new Set(["", ...listFiles(repoRoot, { includeUntracked: true })
    .filter((path) => path === "PACKAGE.ts" || path.endsWith("/PACKAGE.ts"))
    .map((path) => path === "PACKAGE.ts" ? "" : path.slice(0, -"/PACKAGE.ts".length))])]
    .sort()
    .map((directory) => [
      `repositoryInputs_${Buffer.from(directory).toString("hex") || "root"}`,
      Smithers.Filegroup({ cwd: directory === "" ? "./" : directory, srcs: [Smithers.glob("**/*")] })
    ])
)
const repositoryInputs = Smithers.Filegroup({ srcs: Object.values(repositoryPackages) })

const engineeringScriptRegressions = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/check-bindings.test.mjs"),
    Smithers.file("//scripts/lane-gates.test.mjs"),
    Smithers.file("//scripts/lane-checks.test.mjs"),
    Smithers.file("//scripts/lane-prerequisites.test.mjs"),
    Smithers.file("//scripts/homebrew-publish.test.mjs"),
    Smithers.file("//scripts/homebrew-release.test.mjs"),
    Smithers.file("//scripts/journeys/release-install.test.mjs"),
    Smithers.file("//scripts/migration-landing.test.mjs"),
    Smithers.file("//scripts/perf/questions.test.mjs"),
    Smithers.file("//scripts/release/host-maintenance-evidence.test.mjs")
  ]),
  srcs: [],
  deps: [repositoryInputs, backendSQLC]
})

/**
 * The pack directory the release rehearsal writes and the smoke check reads.
 *
 * Workspace-relative and gitignored. On CI this used to be a runner temporary
 * directory named by an environment expression, which made the two steps agree
 * only by both interpolating the same string.
 */
const engineeringChecks = Smithers.Filegroup({ cwd: ".specs/engineering", srcs: [Smithers.glob("checks/*.md")] })
const integrationSources = Smithers.Filegroup({ cwd: "packages/smithers/agent/integrations", srcs: [Smithers.glob("src/**/*.ts")] })
const gatewaySources = Smithers.Filegroup({ cwd: "packages/smithers/gateway", srcs: [Smithers.glob("src/**/*.ts"), Smithers.glob("test/**/*.ts")] })
const workflowSources = Smithers.Filegroup({ cwd: ".github", srcs: [Smithers.glob("workflows/*.yml")] })
const machineSources = Smithers.Filegroup({ cwd: "packages/smithers-machined", srcs: [Smithers.glob("**/*")] })
const ffiSources = Smithers.Filegroup({ cwd: "packages/smithers-ffi", srcs: [Smithers.glob("src/**")] })

const packDirectory = "dist/release-packs"

const privateAdapterManifests = [
  "packages/smithers",
  "packages/smithers/build/build-cli",
  "packages/smithers/migrate",
  "packages/smithers/flows/platform-node",
  "packages/smithers/flows/platform-bun",
  "packages/smithers/gateway",
  "packages/smithers/flows"
].map((directory) => Smithers.file(`//${directory}/package.json`))

/**
 * Checks the release manifest: which packages are published, in what order, and
 * with which internal ranges retargeted.
 *
 * @since 0.1.0
 * @category test
 */
const packManifest = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/pack-release.test.mjs"),
    Smithers.file("//scripts/release/install-cli.test.mjs")
  ]),
  // Both workflows are inputs: the suite compares the release workflow's gate
  // and toolchain steps against the generated CI workflow's, so an edit to
  // either one has to re-run this gate rather than read a cached pass.
  srcs: [
    ...sources,
    Smithers.file("//scripts/release/build-cli.mjs"),
    Smithers.file("//scripts/release/install-cli.mjs"),
    Smithers.file("//scripts/release/install-cli.test.mjs"),
    Smithers.file("//.github/workflows/ci.yml"),
    Smithers.file("//.github/workflows/release.yml")
  ],
  deps: []
})

/**
 * Checks the changelog generator: the commit-subject parse, the grouping, the
 * rendering, and that a second run over one range writes the same bytes.
 *
 * The cases drive real temporary repositories. The generator's whole input is
 * `git log`, `git describe`, and `git tag --points-at`, so a recorded log would
 * only prove that the recording agrees with itself.
 *
 * @since 1.0.0
 * @category test
 */
const changelog = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/generate-changelog.test.mjs")]),
  srcs: sources,
  deps: []
})

/**
 * Checks that a cut writes the version and the changelog, verifies both, and
 * tags without pushing.
 *
 * The fixture is a temporary repository holding copies of the three scripts a
 * cut spawns, so a case cannot reach this checkout's manifests: every one of
 * them resolves its repository root from its own location.
 *
 * @since 1.0.0
 * @category test
 */
const releaseCut = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/cut-release.test.mjs")]),
  srcs: sources,
  deps: []
})

/**
 * Checks release preparation, installed consumer boundaries and runtime floors,
 * and that the dry-run path skips publication while a tag push does not.
 *
 * The assertions read `release.yml` itself, so an edit that breaks either half
 * fails here instead of at the next release.
 *
 * @since 0.1.0
 * @category test
 */
const releaseRehearsal = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/release-rehearsal.test.mjs"),
    Smithers.file("//scripts/release-publish.test.mjs"),
    Smithers.file("//scripts/build-release.test.mjs"),
    Smithers.file("//scripts/check-api-baseline.test.mjs"),
    Smithers.file("//scripts/release-consumers.test.mjs"),
    Smithers.file("//scripts/release-npm-support.test.mjs"),
    Smithers.file("//scripts/release-node-support.test.mjs"),
    Smithers.file("//scripts/release-peer-ranges.test.mjs"),
    Smithers.file("//scripts/release-registry.test.mjs"),
    Smithers.file("//scripts/release-process.test.mjs"),
    Smithers.file("//scripts/release-graph.test.mjs"),
    Smithers.file("//scripts/release-gates.test.mjs"),
    Smithers.file("//scripts/runtime-node-support.test.mjs"),
    Smithers.file("//scripts/release-mcp-handshake.test.mjs"),
    Smithers.file("//scripts/check-lockfile-parity.test.mjs")
  ]),
  srcs: [
    ...sources,
    Smithers.file("//.pnpmfile.mjs"),
    Smithers.file("//.github/workflows/release.yml"),
    Smithers.file("//.github/workflows/ci.yml")
  ],
  deps: []
})

/**
 * Checks that publishing at a new version retargets the exact internal ranges
 * too, and that the tree is coherent at whatever version it currently carries.
 *
 * @since 0.1.0
 * @category test
 */
const releaseVersion = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/set-release-version.test.mjs")]),
  srcs: sources,
  deps: []
})

/**
 * Fails on any pin in the engine or tooling groups that `scripts/test-pins.md`
 * does not explain.
 *
 * A test the default gate never runs to a pass is only acceptable when it is
 * written down.
 *
 * @since 0.1.0
 * @category test
 */
const testPinRegister = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/check-test-pins.test.mjs")]),
  srcs: [...sources, Smithers.file("//scripts/test-pins.md")],
  deps: []
})

/**
 * The scheduled signal campaign's evidence check refuses a missing case, a
 * truncated history, a wrong seed and a failed result.
 *
 * @since 1.0.0
 * @category test
 */
const signalCampaign = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/check-signal-campaign.test.mjs")]),
  srcs: [...sources],
  deps: []
})

/**
 * The web bundle compatibility contract, compiled without a browser process.
 *
 * Browser support is a hard requirement met through layers: the contract entry
 * points must bundle for the browser, and the documented Node-only ones must
 * still fail, and fail only on a documented `node:` built-in. This gates both
 * halves.
 *
 * @since 0.1.0
 * @category test
 */
const webBundleContract = Smithers.NodeTest({
  summary: "Compile the web bundle and validate its exported surface; no browser process is started.",
  featured: true,
  runner: Smithers.entrypoint(Smithers.file("//scripts/browser-check.mjs")),
  // The entry points this bundles live in other packages, and a declared glob
  // may not cross a package boundary — it would expand to nothing and read as
  // a contract it is not. The gate is not cacheable, so it re-runs regardless.
  srcs: sources,
  deps: []
})

/**
 * Every public package's declarations hash to the reviewed
 * `scripts/fixtures/public-api-baseline.json`.
 *
 * Compiles with each package's release compiler into an isolated temporary
 * tree. Private adapter declarations use the same producer as publication;
 * packing and the full package JavaScript builds remain separate gates.
 *
 * @since 1.0.0
 * @category build
 */
const apiBaseline = Smithers.NodeBinary({
  entry: Smithers.file("//scripts/check-api-baseline.mjs"),
  args: ["--build-declarations"],
  timeout: "30m",
  srcs: [
    ...sources,
    Smithers.file("//packages/repo-targets/scripts/build-library.mjs"),
    Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs"),
    Smithers.file("//packages/repo-targets/package.json"),
    Smithers.file("//packages/smithers/scripts/compile-commonjs.mjs"),
    ...privateAdapterManifests,
    Smithers.file("//package.json"),
    Smithers.file("//pnpm-lock.yaml"),
    Smithers.file("//pnpm-workspace.yaml")
  ],
  deps: []
})

/**
 * Packs every publishable workspace package into {@link packDirectory}.
 *
 * A build target rather than a test: its product is the pack tree the smoke
 * check then installs from.
 *
 * @since 0.1.0
 * @category build
 */
const releasePack = Smithers.NodeBinary({
  entry: Smithers.file("//scripts/pack-release.mjs"),
  args: [packDirectory],
  srcs: sources,
  // Most packages use workspace default-target synthesis and therefore have
  // no PACKAGE.ts export this file can import. The selector is still a real
  // graph edge: every package `lib` settles before packing, including future
  // packages admitted under `packages/`. `lib` is the whole distribution,
  // `dist/esm` and `dist/cjs`, which is what `assertBuilt` in the packing
  // program requires; nothing here depends on a prior `pnpm run build`.
  deps: [apiBaseline, Smithers.Target.subtree("//packages/...", "lib")]
})

const docsDrift = Smithers.Shell.Diff({
  shell:
    "pnpm run docs:check && cd apps/site && node scripts/sync-support-docs.mjs --check && node scripts/gen-cli-data.mjs --check && node scripts/sync-api-docs.mjs --check && node scripts/ingest-reference.mjs --check && node scripts/generate-llms.mjs --check",
  changes: [],
  timeout: "5m"
})

/**
 * Checks the proposed Mac install ADR, its supersession links and relative
 * architecture document links, including target headings.
 *
 * @since 0.1.0
 * @category test
 */
const mvpDocs = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/mvp-docs.test.mjs")]),
  srcs: [
    Smithers.file("//scripts/mvp-docs.test.mjs"),
    Smithers.file("//AGENTS.md"),
    Smithers.file("//docs/architecture/0001-shared-product.md"),
    Smithers.file("//docs/architecture/0002-mac-install.md"),
    Smithers.file("//docs/architecture/self-host-implementation.md"),
    Smithers.file("//.specs/product/mvp.md"),
    Smithers.file("//scripts/check-release-evidence-tags.mjs"),
    Smithers.file("//.specs/engineering/README.md"),
    Smithers.file("//.specs/design/README.md"),
    Smithers.file("//.specs/engineering/spec.md")
  ],
  deps: [repositoryInputs]
})


/**
 * Installs the packed artifacts into a scratch project and imports every
 * published entry point, ESM and CJS.
 *
 * The dependency edge on {@link releasePack} is what sequences the two; before
 * this target they were two shell lines in one step that agreed only by naming
 * the same environment variable.
 *
 * @since 0.1.0
 * @category test
 */
const releaseSmoke = Smithers.NodeTest({
  // See smoke-release.mjs for the measured 1110.40 s Node 24 baseline.
  // Keep this gate uncached and allow its complete installed-consumer matrix.
  timeout: "30m",
  runner: Smithers.entrypoint(Smithers.file("//scripts/smoke-release.mjs"), [packDirectory]),
  srcs: sources,
  deps: [releasePack]
})

/**
 * `bun.lock` records the dependency ranges the manifests declare.
 *
 * A manifest change is required to refresh both lockfiles, but only
 * `pnpm-lock.yaml` was ever proved: every CI job installs with pnpm and
 * `--frozen-lockfile` rejects a stale one on the spot, while no job runs `bun
 * install` at all. Bun still executes `apps/*`, the `//packages/...:bunTest`
 * matrix, and `packages/smithers/agent/regression`, so a stale entry resolves a real package at the
 * wrong version on exactly those surfaces and nowhere else. `packages/smithers/agent/fs`
 * reached rc.0 still asking for `@smthrs/core@0.1.0` that way.
 *
 * The target compares rather than installs. It reads the lockfile's own
 * `workspaces` table against the manifests on disk, which is offline,
 * deterministic, and needs no Bun on the machine.
 *
 * @since 0.1.0
 * @category test
 */
const lockfileParity = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/check-lockfile-parity.mjs")),
  srcs: [
    ...sources,
    Smithers.file("//bun.lock"),
    Smithers.pnpmWorkspace("//pnpm-workspace.yaml")
  ],
  deps: []
})

/**
 * What an npm consumer of the published set actually resolves.
 *
 * pnpm settles every internal edge from one workspace-wide pin, so
 * {@link effectVersion} stays green while an npm install of the same tarballs
 * duplicates Effect or drags a test runner into a production dependency tree.
 * This packs the release manifests, resolves them with npm's own arborist, and
 * asserts a single `effect` copy and no optional peer in the default install.
 *
 * The resolution reads registry metadata, so this target needs the network and
 * is not cacheable. It re-runs regardless, which is what a gate over an
 * external resolver has to do.
 *
 * @since 0.1.0
 * @category test
 */
const npmDedupe = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/check-npm-dedupe.mjs")),
  srcs: sources,
  deps: []
})

/**
 * The gate's own two claims, named one per cell.
 *
 * The script reports both through one exit code, so a regression reads as an
 * opaque failure. This suite says which claim broke and which package broke it.
 *
 * @since 0.1.0
 * @category test
 */
const npmDedupeUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/check-npm-dedupe.test.mjs")]),
  srcs: sources,
  deps: []
})

/**
 * Every import a workspace source makes is declared by that workspace.
 *
 * pnpm links the whole workspace under one `node_modules`, so an undeclared
 * import of a sibling still resolves locally and then fails for a consumer who
 * installs the tarball. This executes the rule against unpublished
 * workspace-relative imports.
 *
 * The sources it reads live in other packages, and a declared glob may not
 * cross a package boundary, so `srcs` names only this directory. The gate is
 * therefore not cacheable and re-runs regardless.
 *
 * @since 0.1.0
 * @category test
 */
const dependencyBoundaries = Smithers.NodeTest({
  summary: "No package imports cross declared workspace boundaries.",
  featured: true,
  runner: Smithers.entrypoint(Smithers.file("//scripts/check-dependency-boundaries.mjs")),
  srcs: [...sources, Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs")],
  deps: []
})

/**
 * The literal-blanking step of the dependency-boundaries gate.
 *
 * The gate sweeps each source for dynamic imports with string and template
 * literals blanked out. This pins that the single-pass blanking matches the
 * reduce it replaced byte for byte, and that its cost stays linear in the
 * file size rather than literals times size. It also pins that a manifest's
 * declared private Effect adapters, and only those, count as runtime imports.
 *
 * @since 0.1.0
 * @category test
 */
const dependencyBoundariesUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/check-dependency-boundaries.test.mjs")]),
  srcs: [...sources, Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs")],
  deps: []
})

/**
 * Internal scripts execute the Smithers working tree, never an installed copy.
 *
 * A published-CLI invocation inside this repository silently runs a release
 * build instead of the code under edit. The guard scans only positions that
 * actually spawn a process, so the documentation's own `bunx smithers-build` prose
 * stays legal.
 *
 * @since 0.1.0
 * @category test
 */
const localSmithers = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/check-local-smithers.mjs")),
  srcs: sources,
  deps: []
})

/**
 * The guard's own unit suite: the violation patterns, the allowlist, and the
 * scanned execution surfaces.
 *
 * @since 0.1.0
 * @category test
 */
const localSmithersUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/check-local-smithers.test.mjs")]),
  srcs: sources,
  deps: []
})

/**
 * The shared issue-claim convention and the machine's GitHub proxy it calls
 * GitHub through. The issue-claim suite fakes the proxy and proves that a live
 * claim blocks other agents, a stale one can be taken over, racing claimants
 * agree on the first, retries never re-post, a receipt carries the release, a
 * command asks the proxy for all its writes before the first, and every rate
 * limit exits 75 with its retry instant. End to end, with the real `gh`, the
 * real proxy daemon and a fake GitHub, it proves concurrent processes' writes
 * are spaced by the one proxy, a secondary limit defers every caller without
 * reaching GitHub, and the operator's token never leaves the proxy. The proxy
 * suite proves `--ensure` starts one daemon, a capability gates every caller
 * beyond loopback, and a missing credential is a typed 502. The App suite
 * proves installation tokens are minted with an App JWT, cached 0600, and
 * refreshed before expiry.
 *
 * @since 1.0.0
 * @category test
 */
const issueClaim = Smithers.NodeTest({
  summary:
    "Agents claim an issue before work and release it after, through the machine's GitHub proxy; a live claim blocks others and a stale one can be taken over.",
  runner: Smithers.testRunner([
    Smithers.file("//scripts/issue-claim.test.mjs"),
    Smithers.file("//scripts/check-receipts.test.mjs"),
    Smithers.file("//scripts/github-proxy.test.mjs"),
    Smithers.file("//scripts/github-app-auth.test.mjs")
  ]),
  srcs: [
    Smithers.file("//scripts/issue-claim.mjs"),
    Smithers.file("//scripts/check-evidence.mjs"),
    Smithers.file("//scripts/check-run.mjs"),
    Smithers.file("//scripts/reference-host/hosts.json"),
    Smithers.file("//scripts/check-commands.json"),
    Smithers.file("//scripts/check-receipts-fixture.mjs"),
    Smithers.file("//scripts/github-proxy.mjs"),
    Smithers.file("//scripts/github-app-auth.mjs"),
    // The proxy imports `@smthrs/integrations` through this export map.
    Smithers.file("//packages/smithers/agent/integrations/package.json"),
  ],
  deps: [engineeringChecks, integrationSources]
})

/** Verifies immutable-artifact publication and partial-retry refusal using a fake registry. */
const releaseIntegrity = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/publish-release.test.mjs"),
    Smithers.file("//scripts/installer-release.test.mjs"),
    Smithers.file("//scripts/restore-release.test.mjs"),
    Smithers.file("//scripts/workspace-packages.test.mjs")
  ]),
  srcs: sources,
  deps: []
})

/** Required fast behavioral mutation tier, including both exact-byte guards. */
const mutationGate = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/check-mutations.mjs")),
  srcs: [
    ...sources,
  ],
  deps: [gatewaySources]
})

/** Deterministic scheduler and journal cost regressions, after output validation. */
const benchmarkGate = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/bench/gate.mjs")),
  srcs: [...sources, Smithers.file("//scripts/bench/baseline.json")],
  deps: []
})

/** Installed-product measurements are opt-in; the library counter gate cannot serve. */
const perf = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/run.mjs")),
  srcs: sources,
  deps: [],
  exclusive: true,
  timeout: "24h"
})

/** Installed two-member keystroke workload; never substitutes for a receipt. */
const perfKeystroke = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/keystroke.mjs")),
  srcs: sources, deps: [], exclusive: true, timeout: "1h"
})

/** Persistent member SSH writes observed through the installed File card. */
const perfDiskWrite = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/disk-write.mjs")),
  srcs: sources, deps: [], exclusive: true, timeout: "1h"
})

/** K1–K8 campaign keeps component evidence distinct from integrated proof. */
const workingTogetherFaults = Smithers.Shell.Test({
  shell: "node scripts/working-together/faults.mjs",
  data: [...sources, machineSources, ffiSources, Smithers.file("//Cargo.toml"), Smithers.file("//Cargo.lock")],
  exclusive: true, timeout: "1h"
})
const workingTogetherComponents = Smithers.Shell.Test({
  shell: "node scripts/working-together/faults.mjs --components-only",
  data: [...sources, machineSources, ffiSources, Smithers.file("//Cargo.toml"), Smithers.file("//Cargo.lock")],
  exclusive: true, timeout: "1h"
})

/** K8 through the composed wiki host, real native state and PostgreSQL. */
const workingTogetherWikiFaults = Smithers.Shell.Test({
  shell: "node scripts/working-together/faults.mjs --wiki-only",
  data: [...sources, backendPackage.buildInputs, Smithers.file("//go.mod"), Smithers.file("//go.sum"), Smithers.file("//apps/app/package.json"), Smithers.file("//pnpm-lock.yaml")],
  exclusive: true, timeout: "1h"
})

/** Code mirror recovery through composed HTTP/live with a scripted daemon peer. */
const workingTogetherCodeFaults = Smithers.Shell.Test({
  shell: "node scripts/working-together/faults.mjs --code-only",
  data: [...sources, backendPackage.buildInputs, Smithers.file("//go.mod"), Smithers.file("//go.sum"), Smithers.file("//apps/app/package.json"), Smithers.file("//pnpm-lock.yaml")],
  exclusive: true, timeout: "1h"
})

/** Per-budget availability reports retain honest incomplete evidence. */
const perfProjection = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/run.mjs"), ["C-PERF-02"]),
  srcs: sources, deps: [], exclusive: true, timeout: "1h"
})
const perfWarmWake = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/run.mjs"), ["C-PERF-05"]),
  srcs: sources, deps: [], exclusive: true, timeout: "1h"
})
const perfRebaseHold = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//scripts/perf/run.mjs"), ["C-PERF-06"]),
  srcs: sources, deps: [], exclusive: true, timeout: "1h"
})

const perfUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/working-together/faults.test.mjs"),
    Smithers.file("//scripts/perf/keystroke.test.mjs"),
    Smithers.file("//scripts/perf/disk-write.test.mjs"),
    Smithers.file("//scripts/perf/github-freshness.test.mjs"),
    Smithers.file("//scripts/perf/projection-delta.test.mjs"),
    Smithers.file("//scripts/perf/questions.test.mjs"),
    Smithers.file("//scripts/perf/warm-wake.test.mjs"),
    Smithers.file("//scripts/perf/lib/ssh-member.test.mjs"),
    Smithers.file("//scripts/perf/lib/stats.test.mjs"),
    Smithers.file("//scripts/perf/lib/artifact.test.mjs")
  ]),
  srcs: sources,
  deps: []
})

/** Real-runner sentinels and fail-closed campaign-verifier regressions. */
const tierContracts = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//scripts/ci/coding-check.test.mjs"),
    Smithers.file("//scripts/ci/check-cache.test.mjs"),
    Smithers.file("//scripts/check-mutations.test.mjs"),
    Smithers.file("//scripts/check-soak-campaign.test.mjs"),
    Smithers.file("//scripts/benchmark-gate.test.mjs"),
    Smithers.file("//scripts/run-jj-abi-campaign.test.mjs")
  ]),
  srcs: [
    ...sources,
    Smithers.file("//scripts/ci/coding-check.sh"),
    Smithers.file("//packages/smithers/build/build-cli/src/KnownRed.ts")
  ],
  deps: []
})

/** Typecheck the repository conformance suites and their target declarations. */
const conformanceCheck = Smithers.Typecheck({
  srcs: sources,
  tsconfig: Smithers.file("tsconfig.conformance.json"),
  cwd: "scripts",
  buildMode: false,
  incremental: false,
  deps: []
})

/**
 * Repository-wide CI, publication, coverage and containment policy.
 *
 * These checks read other packages and root configuration, so they run in the
 * uncacheable scripts gate. The umbrella library owns only its own behavior.
 * One runner imports the suites to keep filesystem scans in one process.
 */
const repositoryConformance = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/test/repositoryConformance.test.ts")]),
  srcs: [
    ...sources,
    Smithers.file("//scripts/test/ci.test.ts"),
    Smithers.file("//scripts/test/publication.test.ts"),
    Smithers.file("//scripts/test/coverage.test.ts"),
    Smithers.file("//scripts/test/spawnContainment.test.ts"),
    Smithers.file("//scripts/test/workspaceInventory.test.ts"),
    Smithers.file("//scripts/test/conformanceOwnership.test.ts")
  ],
  deps: [conformanceCheck]
})

/**
 * Lints every operator script against the root config's scripts block.
 *
 * Scripts carry no public-JSDoc contract, so the block holds statement style
 * only: no semicolons, the style most of `scripts/` already used.
 *
 * @since 1.0.0
 * @category lint
 */
const lint = Smithers.EsLint({
  sources: [Smithers.glob("//scripts/**/*.mjs")],
  configs: [Smithers.file("//eslint.config.js")],
  deps: [],
  maxWarnings: 0,
  fix: false
})

// 53 end-to-end cases drive commit.mjs through real git, jj and the production
// build CLI's gates: 798 s on a loaded 48-core lane host, past the 10-minute
// default that timed the target out in the Release gates lane (#3765).
const commit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/commit.test.mjs")]),
  srcs: [Smithers.file("//scripts/commit.mjs")],
  deps: [backendSQLC],
  timeout: "30m"
})

/**
 * The security review of the operator, CI and release scripts this package
 * owns. `repo-contract/` is its own package with its own review.
 *
 * These scripts hold the npm publication path, the GitHub triage token, the
 * Cloud CI bootstrap and the host check cache, so the checks follow the
 * credentials and the downloaded bytes.
 */
const reviewed = (pattern: string) =>
  Smithers.glob(pattern, { exclude: ["repo-contract/**", "**/*.test.mjs", "**/*.test.ts", "**/test_*.py", "test/**"] })

const securityReview = Smithers.SecurityReview({
  cwd: "scripts",
  include: [reviewed("**/*.mjs"), reviewed("**/*.ts"), reviewed("**/*.sh"), reviewed("**/*.py")],
  checks: [
    {
      id: "release-publish-integrity",
      title: "npm publishes only the exact tarballs that passed smoke testing at the tagged commit",
      threat:
        "A tampered pack directory, stale evidence or a mismatched tag lets a CI writer publish unreviewed bytes under the @smthrs scope to every consumer.",
      lookFor: [
        "A publish path that skips verifyLocalCandidate, the source sha/tag match, or the smoke-evidence candidateIntegrity comparison.",
        "A manifest filename that can contain a path separator or '..' and escape the pack directory.",
        "Retry or recovery logic that treats a registry integrity mismatch or a missing version as success.",
        "A dist-tag choice that can publish a prerelease as latest."
      ],
      paths: ["publish-release.mjs", "cut-release.mjs", "set-release-version.mjs", "release-process.mjs"]
    },
    {
      id: "release-archive-restore",
      title:
        "A restored release archive comes only from this repository's Release run and cannot write outside staging",
      threat:
        "A fork, another workflow, or a crafted zip substitutes release tarballs or writes files outside the restore directory on the release runner.",
      lookFor: [
        "verifyArchiveIdentity accepting a run whose repository, head_repository, path, event or artifact workflow_run fields differ from this repository's release.yml.",
        "The python extractor admitting a member name with '/', '..', a symlink mode, or a duplicate, or exceeding the byte and count budgets.",
        "A downloaded archive used before its sha256 digest equals the artifact's recorded digest.",
        "The restore writing into an existing destination instead of a fresh mkdtemp staging directory."
      ],
      paths: ["restore-release.mjs"]
    },
    {
      id: "packed-tarball-contents",
      title: "Published tarballs contain only authored package files and no local credentials or caches",
      threat:
        "A maintainer's local .env, .npmrc, .smithers database or credential under a package directory ships publicly inside an npm tarball.",
      lookFor: [
        "copyFilter admitting dotfiles, .smithers state beyond WORKSPACE.ts/agents.ts/sandbox.ts, or files a manifest `files` list does not name.",
        "pnpm pack run without --config.ignore-scripts=true, letting a package lifecycle script execute during packing.",
        "Native helper binaries copied from SMITHERS_NATIVE_HELPERS_DIR without a digest or provenance check."
      ],
      paths: ["pack-release.mjs", "release-native-helpers.mjs", "build-release.mjs", "packed-export-targets.mjs"]
    },
    {
      id: "consumer-install-isolation",
      title: "Smoke installs resolve first-party packages only from the loopback registry and run no install scripts",
      threat:
        "A public-registry package squatting an @smthrs name, or a dependency's install script, runs code on the release runner that holds publish credentials.",
      lookFor: [
        "An npm, pnpm or bun install in a smoke or consumer probe without --ignore-scripts.",
        "A scratch .npmrc that leaves any first-party scope resolving from the public registry.",
        "The loopback registry binding to a non-loopback address or serving a path outside its tarball map."
      ],
      paths: [
        "smoke-release.mjs",
        "release-registry.mjs",
        "release-consumers.mjs",
        "check-npm-dedupe.mjs",
        "fixtures/installed-consumer/**"
      ]
    },
    {
      id: "ci-bootstrap-downloads",
      title: "Every tool the Cloud CI bootstrap downloads and executes is pinned by version and digest",
      threat:
        "A compromised or spoofed release host swaps a jj, ripgrep, Foundry, rustup or Node binary that then runs with the CI task's repository access.",
      lookFor: [
        "A download() or curl that reaches tar/chmod/exec without download_verified, which checks node_digest or tool_digest with sha256sum -c and exits on a mismatch.",
        "A version read from a repository file used unvalidated in a URL or shell word.",
        "apt or npm installs that run lifecycle scripts or use sudo in a Cloud task."
      ],
      paths: ["ci/cloud.sh", "ci/coding-check.sh"]
    },
    {
      id: "check-cache-poisoning",
      title: "The host check cache cannot carry forged verdicts or escape its root",
      threat:
        "Code under check in one revision plants passing target results or links that a later revision's check replays as green, or that overwrite host files.",
      lookFor: [
        "copyMissing following a symlink or special file, or writing outside the partition or the export's .flows/cache.",
        "An existing valid entry replaced by a check's own output.",
        "SMITHERS_CHECK_CACHE_DIR or the partition marker accepted when relative or pointing outside the cache root."
      ],
      paths: ["ci/check-cache.mjs", "bench/rebase-cache.mjs"]
    },
    {
      id: "script-subprocess-args",
      title: "Scripts spawn processes with argument vectors, never shell strings built from inputs",
      threat:
        "A crafted CLI flag, environment value, commit message or git ref makes an operator script run arbitrary shell commands on a maintainer or CI host.",
      lookFor: [
        "exec, execSync or spawn with shell:true, or sh -c, interpolating argv, environment variables, file contents or git output.",
        "A string option split on spaces and executed, like rebase-cache --install.",
        "An unvalidated positional argument placed into go build -ldflags or a similar command-line flag string."
      ],
      paths: [
        "commit.mjs",
        "bench/**",
        "generate-changelog.mjs",
        "run-jj-abi-campaign.mjs",
        "check-mutations.mjs"
      ]
    },
    {
      id: "credential-scrubbing",
      title: "Cache and registry tokens never reach child processes that do not need them",
      threat:
        "A planner, benchmark or consumer probe subprocess inherits SMITHERS_CACHE_* or registry tokens and leaks them into logs or untrusted package code.",
      lookFor: [
        "A spawn passing { ...process.env } to package installs or repository code without deleting SMITHERS_CACHE_TOKEN, SMITHERS_CACHE_READ_TOKEN, SMITHERS_CACHE_WRITE_TOKEN, NPM_TOKEN or GH_TOKEN.",
        "Environment dumps or error messages that print token-bearing variables."
      ],
      paths: ["release-consumers.mjs", "smoke-release.mjs", "bench/**"]
    }
  ]
})

export const Package = Smithers.Package({
  targets: {
    ...repositoryPackages,
    repositoryInputs,
    engineeringScriptRegressions,
    engineeringChecks, integrationSources, gatewaySources, workflowSources, machineSources, ffiSources,
    apiBaseline,
    docsDrift,
    commit,
    conformanceCheck,
    repositoryConformance,
    mutationGate,
    mvpDocs,
    benchmarkGate,
    perf,
    perfUnit,
    perfKeystroke,
    perfDiskWrite,
    perfProjection,
    perfWarmWake,
    perfRebaseHold,
    workingTogetherFaults,
    workingTogetherComponents,
    workingTogetherWikiFaults,
    workingTogetherCodeFaults,
    tierContracts,
    releaseIntegrity,
    webBundleContract,
    changelog,
    dependencyBoundaries,
    dependencyBoundariesUnit,
    issueClaim,
    lint,
    localSmithers,
    localSmithersUnit,
    lockfileParity,
    npmDedupe,
    npmDedupeUnit,
    packManifest,
    releaseCut,
    releasePack,
    releaseRehearsal,
    releaseSmoke,
    releaseVersion,
    signalCampaign,
    testPinRegister,
    ...securityReview
  }
})
