import { Smithers } from "@smthrs/targets"
import { ReviewDocsAgainstCode, ReviewJsdocAgainstCode } from "./src/index.ts"
import { Package as scriptPackage } from "../../scripts/PACKAGE.ts"

const cwd = "packages/repo-targets"
const sources = Smithers.glob("src/**/*.ts")
// Files the cases import or read beside the suites themselves: the shared
// test helpers, the property helper every package typechecks against, the
// build scripts `BuildLibrary.test.ts` runs, and this declaration, which
// `CiSelection.test.ts` loads.
const testSupportFiles = [
  Smithers.glob("test/**/*.ts"),
  Smithers.glob("test-utils/**"),
  Smithers.glob("scripts/**"),
  Smithers.file("PACKAGE.ts")
]
const testSupport = Smithers.Filegroup({
  srcs: [Smithers.file("//packages/smithers/build/targets/test-support/plan.ts")],
  cwd
})
const check = Smithers.Typecheck({
  srcs: [sources, ...testSupportFiles],
  deps: [testSupport],
  tsconfig: Smithers.file("tsconfig.json"),
  buildMode: false,
  incremental: false,
  cwd
})
const test = Smithers.Vitest({
  tests: [Smithers.glob("test/**/*.test.ts")],
  sources: [sources, ...testSupportFiles],
  deps: [testSupport],
  config: Smithers.file("vitest.config.ts"),
  environment: "node",
  passWithNoTests: false,
  cwd
})

/**
 * The repository contract gates under `contracts/`, digested as the input of
 * each gate here, with the workspace inventory they import from this package's
 * `scripts/`.
 */
const contracts = [
  Smithers.glob("//packages/repo-targets/contracts/**/*.mjs"),
  Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs")
]

/**
 * Fails on a git or jj conflict marker committed into a tracked text file
 * (#3151). A per-commit drift gate: `git grep` over the tree takes a second.
 * Check mode runs it in a scratch copy with no `.git`, where it searches every
 * file no `.gitignore` excludes.
 *
 * @since 1.0.0
 * @category lint
 */
const conflictMarkers = Smithers.Shell.Diff({
  shell: "node packages/repo-targets/contracts/check-conflict-markers.mjs",
  changes: [],
  timeout: "2m"
})

/**
 * The conflict-marker check's own contract: every git and jj marker form, the
 * look-alikes it leaves, binary and untracked files, and a failed search.
 *
 * @since 1.0.0
 * @category test
 */
const conflictMarkersUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/check-conflict-markers.test.mjs")]),
  srcs: contracts,
  deps: []
})

/** Tracked files must resolve declared paths and exclude local build and agent state. */
const trackedHygiene = Smithers.Shell.Diff({
  shell: "node packages/repo-targets/contracts/check-tracked-hygiene.mjs --projected-tree",
  data: [scriptPackage.repositoryInputs],
  changes: [],
  timeout: "2m"
})

const trackedHygieneUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/check-tracked-hygiene.test.mjs")]),
  srcs: contracts,
  deps: []
})

/**
 * The toolchain drift gate: package.json `engines` and `packageManager`,
 * flake.nix, and the generated CI workflow must agree with the runtimes and
 * package manager `.smithers/WORKSPACE.ts` declares, and every workflow,
 * script and image that names a Rust release must name the channel
 * `rust-toolchain.toml` pins. The gate reads both declarations itself, so a
 * version moves in one file.
 *
 * @since 0.1.0
 * @category test
 */
const toolchainPins = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/check-toolchain-pins.test.mjs")]),
  srcs: [
    ...contracts,
    Smithers.file("//.smithers/WORKSPACE.ts"),
    Smithers.file("//package.json"),
    Smithers.file("//flake.nix"),
    Smithers.file("//.node-version"),
    Smithers.file("//rust-toolchain.toml"),
    Smithers.file("//PACKAGE.ts"),
    Smithers.file("//scripts/ci/cloud.sh")
  ],
  deps: [scriptPackage.workflowSources]
})

/**
 * One `effect` version across every manifest, both lockfiles, and the install.
 *
 * Two Effect instances do not share schema internals, so a duplicate is a
 * runtime defect rather than a size problem. The release pins one supported
 * version and this target proves the tree agrees.
 *
 * @since 0.1.0
 * @category test
 */
const effectVersion = Smithers.NodeTest({
  summary: "Exactly one effect version resolves across every manifest and both lockfiles.",
  featured: true,
  runner: Smithers.entrypoint(Smithers.file("//packages/repo-targets/contracts/check-single-effect-version.mjs")),
  srcs: [...contracts, Smithers.file("//flows/release/pack-release.mjs"), Smithers.file("//pnpm-lock.yaml"), Smithers.file("//bun.lock")],
  deps: []
})

/**
 * The effect-version gate's own cases, installed consumer boundaries, and
 * development-only compiler isolation in the root pnpm hook.
 *
 * @since 0.1.0
 * @category test
 */
const releaseContracts = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//packages/repo-targets/contracts/check-single-effect-version.test.mjs"),
    Smithers.file("//packages/repo-targets/contracts/installed-consumer-boundary.test.mjs"),
    Smithers.file("//packages/repo-targets/contracts/dev-compiler-isolation.test.mjs")
  ]),
  srcs: [
    ...contracts,
    Smithers.file("//flows/release/pack-release.mjs"),
    Smithers.file("//scripts/check-dependency-boundaries.mjs"),
    Smithers.file("//flows/release/fixtures/installed-consumer/consumer-boundary.mjs"),
    Smithers.file("//flows/release/fixtures/installed-consumer/dependency-adapters.mjs"),
    Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs"),
    Smithers.file("//.pnpmfile.mjs")
  ],
  deps: []
})

/**
 * Fails on any pin in the engine or tooling groups that
 * `packages/repo-targets/contracts/test-pins.md` does not explain.
 *
 * A test the default gate never runs to a pass is only acceptable when it is
 * written down.
 *
 * @since 0.1.0
 * @category test
 */
const testPinRegister = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/check-test-pins.test.mjs")]),
  srcs: [...contracts, Smithers.file("//packages/repo-targets/contracts/test-pins.md")],
  deps: []
})

/** The workspace packages whose manifests declare private Effect adapters. */
const privateAdapterManifests = [
  "packages/smithers",
  "packages/smithers/build/build-cli",
  "packages/smithers/migrate",
  "packages/smithers/flows/platform-node",
  "packages/smithers/flows/platform-bun",
  "packages/smithers/gateway",
  "packages/smithers/flows"
].map((directory) => Smithers.file(`//${directory}/package.json`))

const privateEffectAdapters = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/private-effect-adapters.test.mjs")]),
  srcs: [
    ...contracts,
    Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs"),
    Smithers.file("//packages/repo-targets/package.json"),
    Smithers.file("//packages/repo-targets/scripts/build-library.mjs"),
    Smithers.file("//packages/smithers/scripts/compile-commonjs.mjs"),
    ...privateAdapterManifests,
    Smithers.file("//package.json"),
    Smithers.file("//pnpm-lock.yaml"),
    Smithers.file("//pnpm-workspace.yaml")
  ],
  deps: []
})

const driftJob = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/drift-job.test.mjs")]),
  srcs: [
    ...contracts,
    Smithers.file("//.github/actions/trusted-ci-setup/action.yml"),
    Smithers.file("//.github/actions/trusted-ci-setup/setup.py"),
    Smithers.file("//.github/actions/trusted-ci-setup-campaign/action.yml"),
    Smithers.file("//.github/workflows/trusted-drift.yml"),
    Smithers.file("//.github/workflows/trusted-setup-validation.yml"),
    Smithers.file("//PACKAGE.ts"),
    Smithers.file("//package.json"),
    Smithers.file("//scripts/PACKAGE.ts"),
    Smithers.file("//flows/release/check-api-baseline.mjs"),
    Smithers.file("//flows/PACKAGE.ts"),
    Smithers.file("//flows/land/engineering-gate-environment.mjs"),
    Smithers.file("//flows/checks/coding-check.sh"),
    Smithers.file("//.github/workflows/drift.yml"),
    Smithers.file("//.github/workflows/ci.yml")
  ],
  deps: []
})

/** The Windows kernel suite runs independently of the native and Node host jobs. */
const nativeWindowsWorkflow = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/native-windows.test.mjs")]),
  srcs: [...contracts, Smithers.file("//.github/workflows/native-windows.yml")],
  deps: []
})

/** Real-runner sentinels: a declared runner executes its suite and fails closed. */
const runnerContract = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/runner-contract.test.mjs")]),
  srcs: [...contracts, Smithers.file("//apps/app/scripts/run-pr-e2e.mjs")],
  deps: []
})

/** Every red required target in a CI log has an owned known-red entry. */
const knownRedCoverage = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/check-known-red-coverage.test.mjs")]),
  srcs: [...contracts, Smithers.file("//packages/smithers/build/build-cli/src/KnownRed.ts")],
  deps: []
})

/** Exercises real Bun coverage collection and sealed process receipts. */
const bunCoverage = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//packages/repo-targets/bun-coverage/coverage.test.mjs"),
    Smithers.file("//packages/repo-targets/bun-coverage/receipts.test.mjs"),
    Smithers.file("//packages/repo-targets/bun-coverage/run.test.mjs")
  ]),
  srcs: [Smithers.glob("//packages/repo-targets/bun-coverage/**/*")],
  timeout: "2m",
  deps: []
})

/**
 * The workspace membership reader every release and repository gate shares.
 *
 * @since 0.1.0
 * @category test
 */
const workspacePackages = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/scripts/workspace-packages.test.mjs")]),
  srcs: [Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs"), Smithers.file("//packages/repo-targets/scripts/workspace-packages.d.mts")],
  deps: []
})

/**
 * Lints the contract gates and the Bun coverage collector against the root
 * config's operator-script block: statement style only, no semicolons.
 *
 * @since 1.0.0
 * @category lint
 */
const contractsLint = Smithers.EsLint({
  sources: [
    Smithers.glob("//packages/repo-targets/contracts/**/*.mjs"),
    Smithers.glob("//packages/repo-targets/bun-coverage/**/*.mjs"),
    Smithers.glob("//packages/repo-targets/scripts/**/*.mjs")
  ],
  configs: [Smithers.file("//eslint.config.js")],
  deps: [],
  maxWarnings: 0,
  fix: false
})

/**
 * Changed public APIs against the README. This private package has no docs
 * directory and no site reference page, so the README is its whole prose.
 *
 * @since 0.1.0
 * @category lint
 */
const reviewDocsAgainstCode = ReviewDocsAgainstCode({ cwd, context: [Smithers.file("README.md")] })

/**
 * Changed exports against their own JSDoc.
 *
 * @since 0.1.0
 * @category lint
 */
const reviewJsdocAgainstCode = ReviewJsdocAgainstCode({ cwd })

const securityReview = Smithers.SecurityReview({
  cwd,
  include: ["src/**",
    Smithers.glob("contracts/**/*.mjs", { exclude: ["**/*.test.mjs"] }),
    Smithers.glob("bun-coverage/**/*.mjs", { exclude: ["**/*.test.mjs"] }),
    Smithers.glob("bun-coverage/**/*.ts", { exclude: ["**/*.test.ts"] }),
    "scripts/**", "test-utils/**"],
  checks: [
    {
      id: "review-gate-strength",
      title: "Shared review macros cannot be weakened or silenced by the code they review",
      threat:
        "A contributor whose diff carries prompt text or a narrowed include makes every package's model review pass their change unreviewed.",
      lookFor: [
        "smithersReviewPrompt or a rubric that lets diff contents redefine the rubric, or that tells the model to skip files, instead of treating reviewed text as data.",
        "A macro whose failOn defaults to a weaker severity than its README states, or a caller option that overrides failOn or rubric silently.",
        "An anchor or include mapping in review() where the gitDiff paths and the include globs can diverge so changed files escape the reviewed set."
      ],
      paths: ["src/ReviewLint.ts", "src/ReviewTagsMigrationsAndKeys.ts", "src/ReviewDocsAgainstCode.ts", "src/ReviewJsdocAgainstCode.ts"]
    },
    {
      id: "review-context-confinement",
      title: "A review sends the model only the declaring package's files and its named prose",
      threat:
        "A review macro ships a maintainer's .env, keys, or another package's private sources to a third-party model CLI because a default or derived glob matches more than the package.",
      lookFor: [
        "ReviewDocsAgainstCode interpolating packageName, taken from cwd, into a site glob without escaping glob metacharacters such as *, ?, {, or [.",
        "A default include or context glob in any macro that can match .env*, *.pem, credentials files, or node_modules.",
        "anchor() re-rooting an exclude or pattern without Input.resolvePath, so a '..' segment survives into the emitted workspace glob."
      ],
      paths: ["src/ReviewLint.ts", "src/ReviewDocsAgainstCode.ts"]
    },
    {
      id: "build-script-exec",
      title: "Build scripts execute only the package's own toolchain and write only its dist",
      threat:
        "A build started from the wrong working directory deletes or overwrites another tree's dist on a maintainer's machine or CI runner, or ships a CommonJS bundle whose rewritten require() loads a different module.",
      lookFor: [
        "A spawnSync or exec in build-library.mjs that uses a shell or a string command instead of process.execPath with an argv array.",
        "rmSync, cpSync, or writeFileSync whose target is not confined under packageRoot/dist, or that follows a symlink out of it.",
        "The require-path rewrite or import() lowering regex rewriting non-relative or computed specifiers, or content outside require() and import() calls, in emitted CommonJS."
      ],
      paths: ["scripts/**"]
    },
    {
      id: "gate-cache-integrity",
      title: "Every file a gate reads is a declared cache input",
      threat:
        "A contributor changes an undeclared test fixture, config, or tool script so CI reuses a stale green result and merges a broken or malicious change.",
      lookFor: [
        "A target in BuildAndCheckTypeScriptPackage whose tool reads a file (tsconfig, vitest config, eslint config, test-utils, build script) absent from its srcs or sources.",
        "A tsconfig.test.json or vitest config that extends or imports a file (tsconfig.json, a shared base) that the check or test target does not list as an input.",
        "A default such as maxWarnings, passWithNoTests, or fix that a caller can flip to make lint or test pass vacuously."
      ],
      paths: ["src/BuildAndCheckTypeScriptPackage.ts"]
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
      paths: ["contracts/require-toolchain.mjs"]
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
      paths: ["contracts/check-known-red-coverage.mjs", "bun-coverage/**"]
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
      paths: ["contracts/ci-planner.mjs", "contracts/ci-inventory.mjs"]
    }
  ]
})

/**
 * Checks the proposed Mac install ADR, its supersession links and relative
 * architecture document links, including target headings.
 *
 * @since 0.1.0
 * @category test
 */
const mvpDocs = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//packages/repo-targets/contracts/mvp-docs.test.mjs")]),
  srcs: [
    Smithers.file("//packages/repo-targets/contracts/mvp-docs.test.mjs"),
    Smithers.file("//AGENTS.md"),
    Smithers.file("//docs/architecture/0001-shared-product.md"),
    Smithers.file("//docs/architecture/0002-mac-install.md"),
    Smithers.file("//docs/architecture/self-host-implementation.md"),
    Smithers.file("//.specs/product/mvp.md"),
    Smithers.file("//packages/repo-targets/contracts/check-release-evidence-tags.mjs"),
    Smithers.file("//.specs/engineering/README.md"),
    Smithers.file("//.specs/design/README.md"),
    Smithers.file("//.specs/engineering/spec.md")
  ],
  deps: [scriptPackage.repositoryInputs]
})

export const Package = Smithers.Package({ targets: { check, test, workspacePackages, conflictMarkers, mvpDocs, conflictMarkersUnit, trackedHygiene, trackedHygieneUnit, toolchainPins, effectVersion, releaseContracts, privateEffectAdapters, driftJob, nativeWindowsWorkflow, runnerContract, knownRedCoverage, bunCoverage, testPinRegister, contractsLint, reviewDocsAgainstCode, reviewJsdocAgainstCode, ...securityReview } })
