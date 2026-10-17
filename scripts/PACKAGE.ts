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
import { backendSQLC } from "../packages/backend/sqlc.ts"
import { Smithers } from "@smthrs/targets"
import { readdirSync } from "node:fs"
import { listFiles } from "../packages/repo-targets/contracts/check-tracked-hygiene.mjs"
import { repoRoot } from "../packages/repo-targets/scripts/workspace-packages.mjs"
import { Package as backendPackage } from "../packages/backend/PACKAGE.ts"

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
  Smithers.file("//packages/repo-targets/contracts/check-tracked-hygiene.d.mts"),
  Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs")
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
    Smithers.file("//scripts/check-bindings.test.mjs")
  ]),
  srcs: [],
  deps: [repositoryInputs, backendSQLC]
})

const engineeringChecks = Smithers.Filegroup({ cwd: ".specs/engineering", srcs: [Smithers.glob("checks/*.md")] })
const integrationSources = Smithers.Filegroup({ cwd: "packages/smithers/agent/integrations", srcs: [Smithers.glob("src/**/*.ts")] })
const gatewaySources = Smithers.Filegroup({ cwd: "packages/smithers/gateway", srcs: [Smithers.glob("src/**/*.ts"), Smithers.glob("test/**/*.ts")] })
const workflowSources = Smithers.Filegroup({ cwd: ".github", srcs: [Smithers.glob("workflows/*.yml")] })
const machineSources = Smithers.Filegroup({ cwd: "packages/smithers-machined", srcs: [Smithers.glob("**/*")] })
const ffiSources = Smithers.Filegroup({ cwd: "packages/smithers-ffi", srcs: [Smithers.glob("src/**")] })

/**
 * Checks the release workflow's rehearsal driver, the gate inventory and the
 * release graph, and that the dry-run path skips publication while a tag push
 * does not. The release modules these read live in `flows/release/`.
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
    Smithers.file("//scripts/release-graph.test.mjs"),
    Smithers.file("//scripts/release-gates.test.mjs"),
    Smithers.file("//scripts/check-lockfile-parity.test.mjs")
  ]),
  srcs: [
    ...sources,
    Smithers.file("//flows/release/release-rehearsal.mjs"),
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
  srcs: [...sources, Smithers.file("//flows/release/set-release-version.mjs")],
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

const docsDrift = Smithers.Shell.Diff({
  shell:
    "pnpm run docs:check && cd apps/site && node scripts/sync-support-docs.mjs --check && node scripts/gen-cli-data.mjs --check && node scripts/sync-api-docs.mjs --check && node scripts/ingest-reference.mjs --check && node scripts/generate-llms.mjs --check",
  changes: [],
  timeout: "5m"
})


/**
 * `bun.lock` records the dependency ranges the manifests declare.
 *
 * A manifest change is required to refresh both lockfiles, but only
 * `pnpm-lock.yaml` was ever proved: every CI job installs with pnpm and
 * `--frozen-lockfile` rejects a stale one on the spot, while no job runs `bun
 * install` at all. Bun still executes `apps/*`, the `//packages/...:bunTest`
 * matrix, and `evals/agent`, so a stale entry resolves a real package at the
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
      id: "ci-bootstrap-downloads",
      title: "Every tool the Cloud CI bootstrap downloads and executes is pinned by version and digest",
      threat:
        "A compromised or spoofed release host swaps a jj, ripgrep, Foundry, rustup or Node binary that then runs with the CI task's repository access.",
      lookFor: [
        "A download() or curl that reaches tar/chmod/exec without download_verified, which checks node_digest or tool_digest with sha256sum -c and exits on a mismatch.",
        "A version read from a repository file used unvalidated in a URL or shell word.",
        "apt or npm installs that run lifecycle scripts or use sudo in a Cloud task."
      ],
      paths: ["ci/cloud.sh"]
    }
  ]
})

export const Package = Smithers.Package({
  targets: {
    ...repositoryPackages,
    repositoryInputs,
    engineeringScriptRegressions,
    engineeringChecks, integrationSources, gatewaySources, workflowSources, machineSources, ffiSources,
    docsDrift,
    conformanceCheck,
    repositoryConformance,
    webBundleContract,
    dependencyBoundaries,
    dependencyBoundariesUnit,
    issueClaim,
    lint,
    localSmithers,
    localSmithersUnit,
    lockfileParity,
    releaseRehearsal,
    releaseVersion,
    ...securityReview
  }
})
