/** Repository flows, release workflows, and the retained migration fixtures. */
import { Smithers } from "@smthrs/targets"
import { existsSync, readdirSync } from "node:fs"
import codingProject from "../.smithers/coding-project.json" with { type: "json" }
import { Package as backendPackage } from "../packages/backend/PACKAGE.ts"
import { backendSQLC } from "../packages/backend/sqlc.ts"
import { libraryPackages, repoRoot } from "../packages/repo-targets/scripts/workspace-packages.mjs"
import { Package as scriptPackage } from "../scripts/PACKAGE.ts"

const pack = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/pack.test.mjs")]),
  srcs: [
    Smithers.glob("//flows/**/flow.mdx"),
    Smithers.glob("//flows/**/flow.ts"),
    Smithers.file("//.smithers/factory.json"),
    Smithers.file("//.smithers/home.json")
  ],
  deps: []
})

const cwd = "flows"
const sources = Smithers.glob("//flows/**/*.ts")
const scripts = Smithers.Filegroup({ cwd: "scripts", srcs: [Smithers.glob("*.mjs")] })

// The real-run model stand-in's script, which the scripted wiki reviewer suite runs.
const todoTurns = [
  Smithers.file("//distribution/fake-todo-turns.mjs"),
  Smithers.file("//distribution/fake-todo-turns.d.mts")
]

const check = Smithers.Typecheck({
  srcs: [sources, ...todoTurns],
  deps: [scripts],
  tsconfig: Smithers.file("tsconfig.json"),
  buildMode: false,
  incremental: false,
  cwd
})
const suite = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/content.test.ts"),
    Smithers.file("//flows/test/catalog-runtime.test.ts"),
    Smithers.file("//flows/test/release-redaction.test.ts"),
    Smithers.file("//flows/test/release-io.test.ts"),
    Smithers.file("//flows/test/release-operations.test.ts"),
    Smithers.file("//flows/test/publication.test.ts"),
    Smithers.file("//flows/test/review-flow.test.ts"),
    Smithers.file("//flows/test/coding-wiki-relay.test.ts"),
    Smithers.file("//flows/test/command-receipts.test.ts"),
    Smithers.file("//flows/test/host-jev-routing.test.ts"),
    Smithers.file("//flows/test/system-flow-catalog.test.ts"),
    Smithers.file("//flows/test/workflows.test.ts"),
    Smithers.file("//flows/test/rollout.test.ts"),
    Smithers.file("//flows/test/worker-rollout.test.ts"),
    Smithers.file("//flows/test/notes.test.ts")
  ]),
  srcs: [
    sources,
    Smithers.file("//flows/review/flow.ts"),
    Smithers.file("//packages/backend/internal/services/flow_catalog.go"),
    Smithers.file("//packages/backend/internal/services/builtin_flows.json"),
    Smithers.file("//packages/backend/flowdispatch/real_host_test.go"),
    Smithers.file("//pnpm-workspace.yaml"),
    Smithers.file("//flows/rollout/refuse-unqualified.mjs"),
    // The Appendix B catalog gate test/catalog-runtime.test.ts imports and spawns.
    Smithers.file("//apps/app/scripts/catalog-allowlist.ts"),
    Smithers.file("//apps/app/scripts/catalog-mvp.ts"),
    Smithers.file("//apps/app/scripts/catalog-host.mts"),
    Smithers.file("//apps/app/scripts/catalog-policy.mts"),
    Smithers.file("//apps/bug-worker/package.json")
  ],
  deps: [scripts],
  cwd
})

// Lints flow sources; suites and fixtures are formatted, not linted.
const lint = Smithers.EsLint({
  sources: [Smithers.glob("**/*.ts")],
  configs: [Smithers.file("eslint.config.js"), Smithers.file("//eslint.invariants.js")],
  deps: [],
  maxWarnings: 0,
  fix: false,
  cwd
})
const fmt = Smithers.Dprint({
  sources: [Smithers.glob("**/*.{ts,tsx,js,jsx,mjs,json,md}")],
  config: Smithers.file("dprint.json"),
  deps: [],
  fix: false,
  cwd
})

const recording = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/test/recording.test.ts")]),
  srcs: [sources],
  deps: [],
  cwd
})
// The bundle shim check reads the coding host's build script and the flow
// sources it may bundle, so it declares those, not the suite's fixtures. It
// also scans packages/smithers, which owns its own sources; this target does
// not re-declare another package's tree.
const codingHostBundle = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/test/coding-host-bundle.test.ts")]),
  srcs: [sources, Smithers.file("//flows/coding/build.mjs")],
  deps: [],
  cwd
})
const issueSweep = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/issue-sweep/test/decide.test.ts"),
    Smithers.file("//flows/issue-sweep/test/sweep-failure.test.ts"),
    Smithers.file("//flows/issue-sweep/test/disk.test.ts"),
    Smithers.file("//flows/issue-sweep/test/accounts.test.ts"),
    Smithers.file("//flows/issue-sweep/test/identity.test.ts"),
    Smithers.file("//flows/issue-sweep/test/claude.test.ts"),
    Smithers.file("//flows/issue-sweep/test/land.test.ts"),
    Smithers.file("//flows/issue-sweep/test/land-baselines.test.ts"),
    Smithers.file("//flows/issue-sweep/test/land-jj.test.ts"),
    Smithers.file("//flows/issue-sweep/test/work.test.ts"),
    Smithers.file("//flows/issue-sweep/test/remote-job.test.ts"),
    Smithers.file("//flows/issue-sweep/test/remote-job-restart.test.ts"),
    Smithers.file("//flows/issue-sweep/test/receipts.test.ts"),
    Smithers.file("//flows/issue-sweep/test/vm.test.ts"),
    Smithers.file("//flows/issue-sweep/test/github.test.ts"),
    Smithers.file("//flows/issue-sweep/test/host.test.ts"),
    Smithers.file("//flows/issue-sweep/test/verdict.test.ts"),
    Smithers.file("//flows/issue-sweep/test/land-queue.test.ts"),
    Smithers.file("//flows/issue-sweep/test/land-baselines.test.ts"),
    Smithers.file("//flows/issue-sweep/test/triage.test.ts"),
    Smithers.file("//flows/issue-sweep/test/judge.test.ts")
  ]),
  srcs: [sources],
  deps: [],
  cwd
})
// Boots real microVMs; skips itself, naming why, without msb or the snapshot.
const issueSweepVm = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/issue-sweep/test/vm.real.test.ts"),
    Smithers.file("//flows/issue-sweep/test/job-restart.real.test.ts"),
    Smithers.file("//flows/issue-sweep/test/vm.shared.real.test.ts"),
    Smithers.file("//flows/issue-sweep/test/vm.claude.real.test.ts")
  ]),
  srcs: [sources],
  deps: [],
  cwd
})
const provider = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/test/provider-runtime.test.ts")]),
  srcs: [sources],
  deps: [],
  cwd
})

// Source-only dependencies keep the backend graph reactive without building
// every backend package before an uncached coding test. The inventory is checked
// against pnpm workspace membership; each glob retains its owning package boundary.
const codingPackages = [
  // Eighteen repository fixtures import `packages/rpc/src` by relative path.
  // Without the member here those targets cache across an rpc edit.
  "packages/rpc",
  "packages/smithers",
  "packages/smithers/agent",
  "packages/smithers/agent/chain",
  "packages/smithers/agent/evals",
  "packages/smithers/agent/fs",
  "packages/smithers/agent/harness",
  "packages/smithers/agent/harness-detect",
  "packages/smithers/agent/integrations",
  "packages/smithers/agent/memory",
  "packages/smithers/agent/model",
  "packages/smithers/agent/model-host",
  "packages/smithers/agent/plugin",
  "packages/smithers/agent/registry",
  "packages/smithers/agent/scorers",
  "packages/smithers/agent/std",
  "packages/smithers/agent/triggers",
  "packages/smithers/build",
  "packages/smithers/build/build-cli",
  "packages/smithers/build/infra",
  "packages/smithers/build/targets",
  "packages/smithers/control",
  "packages/smithers/flows",
  "packages/smithers/flows/artifacts",
  "packages/smithers/flows/canonical",
  "packages/smithers/flows/capability",
  "packages/smithers/flows/core",
  "packages/smithers/flows/crypto",
  "packages/smithers/flows/database",
  "packages/smithers/flows/engine",
  "packages/smithers/flows/engine-store",
  "packages/smithers/flows/flow",
  "packages/smithers/flows/jj",
  "packages/smithers/flows/journal",
  "packages/smithers/flows/kernel",
  "packages/smithers/flows/keys",
  "packages/smithers/flows/observability",
  "packages/smithers/flows/patterns",
  "packages/smithers/flows/plan",
  "packages/smithers/flows/plan-store",
  "packages/smithers/flows/platform-browser",
  "packages/smithers/flows/platform-bun",
  "packages/smithers/flows/platform-node",
  "packages/smithers/flows/run-store",
  "packages/smithers/flows/sandbox",
  "packages/smithers/flows/step-cache",
  "packages/smithers/flows/sync",
  "packages/smithers/flows/time-travel",
  "packages/smithers/gateway",
  "packages/smithers/mcp",
  "packages/smithers/migrate",
  "packages/smithers/notifications",
  "packages/smithers/ui",
  "packages/smithers/ui/ui-styleguide"
] as const
const codingBackend = codingPackages.map((cwd) =>
  Smithers.Filegroup({
    cwd,
    srcs: [Smithers.glob("src/**"), Smithers.file("package.json"), Smithers.file("tsconfig.json")]
  })
)
const codingScripts = scripts
const codingWiki = Smithers.Filegroup({ cwd: "flows/wiki", srcs: [Smithers.glob("**/*.ts")] })
const codingFiles = [
  sources,
  Smithers.glob("//flows/**/*.mjs"),
  Smithers.glob("//flows/coding/**/*.md"),
  // `@smthrs/coding`'s export map: what `flows/todo/flow.ts` resolves its steps to.
  Smithers.file("//flows/coding/package.json"),
  Smithers.glob("//flows/create-flow/**/flow.mdx"),
  Smithers.file("//flows/issue/repro/flow.mdx"),
  Smithers.file("//flows/issue/poc/flow.mdx"),
  Smithers.file("//flows/pr-triage/flow.mdx"),
  Smithers.file("//flows/review/change/flow.mdx"),
  Smithers.file("//flows/tsconfig.json")
]
const codingSources = [
  ...codingFiles,
  Smithers.pnpmWorkspace("//pnpm-workspace.yaml"),
  Smithers.file("//pnpm-lock.yaml")
]
const codingDependencies = [...codingBackend, codingScripts, codingWiki]
const codingHostInputs = Smithers.Filegroup({ srcs: [...codingFiles, ...codingDependencies] })
// The repository config test reads every wiki page's document and inputs too.
// Declare them so both runtime targets track changes outside their TS sources.
const codingProjectSources = [
  ".smithers/coding-project.json",
  ".smithers/factory.json",
  ...new Set(codingProject.pages.flatMap((page) => [page.document, ...page.inputs]))
].map((path) => Smithers.file(`//${path}`))
const codingProjectInputs = [
  ...codingProjectSources,
  Smithers.glob("//flows/checks/**/flow.mdx")
]
const node = Smithers.Runtime.Node({ version: ">=26.4.0" })
const bun = Smithers.Runtime.Bun({ version: ">=1.4.0" })

// Existing policy integration uses actual JJ and the Node SQLite fixture.
const coding = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/coding.test.ts"),
    Smithers.file("//flows/test/coding-state.test.ts"),
    Smithers.file("//flows/test/coding-learnings.test.ts"),
    Smithers.file("//flows/test/coding-recovery-policy.test.ts"),
    Smithers.file("//flows/test/learning.test.ts"),
    // The local landers over a real colocated jj repository and a recording `gh`.
    Smithers.file("//flows/test/coding-local-landing.test.ts"),
    // The coding host's bundle shim, checked against every `bun:sqlite` import
    // under `packages/smithers` and `flows`. It reads more than this target's
    // srcs name, so it belongs to this uncached runner: a cached verdict would
    // survive a new import the shim does not re-export, which is the build
    // break it exists to catch (#3839).
    Smithers.file("//flows/test/coding-host-bundle.test.ts")
  ]),
  srcs: codingSources,
  deps: codingDependencies,
  cwd
})
const codingPolicy = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/coding-host.test.ts"),
    Smithers.file("//flows/test/coding-host-registry.test.ts"),
    Smithers.file("//flows/test/coding-wiki-selection.test.ts"),
    Smithers.file("//flows/test/coding-build-only.test.ts"),
    Smithers.file("//flows/test/coding-install-project.test.ts"),
    Smithers.file("//flows/test/coding-builtin-routes.test.ts"),
    Smithers.file("//flows/test/coding-flow-load.test.ts"),
    Smithers.file("//flows/test/coding-runtime-bridge.test.ts"),
    Smithers.file("//flows/test/coding-gates.test.ts"),
    Smithers.file("//flows/test/coding-pool-default-model.test.ts"),
    Smithers.file("//flows/test/coding-planning-wiki-prior.test.ts")
  ]),
  // `coding-host.test.ts` and `coding-builtin-routes.test.ts` load the checked-in project configuration.
  srcs: [
    ...codingSources,
    ...codingProjectInputs,
    Smithers.file("//packages/smithers/flows/flow/test/MemoryFlowRuntime.ts")
  ],
  deps: codingDependencies,
  cwd,
  cache: true
})
const codingRuntime = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/coding-planning-authority.test.ts"),
    Smithers.file("//flows/test/coding-planning-sources.test.ts"),
    Smithers.file("//flows/test/coding-planning-placement.test.ts"),
    Smithers.file("//flows/test/coding-planning-answers.test.ts"),
    Smithers.file("//flows/test/coding-project-memory.test.ts"),
    Smithers.file("//flows/test/coding-stack-base.test.ts"),
    Smithers.file("//flows/test/coding-stack-reserved.test.ts"),
    Smithers.file("//flows/test/source-refusal-sites.test.ts"),
    Smithers.file("//flows/test/coding-project-config.test.ts"),
    Smithers.file("//flows/test/coding-project-defaults.test.ts"),
    Smithers.file("//flows/test/coding-candidate-equality.test.ts"),
    Smithers.file("//flows/test/coding-pinned-source.test.ts"),
    Smithers.file("//flows/test/coding-steering.test.ts"),
    Smithers.file("//flows/test/coding-request-coordinator.test.ts"),
    Smithers.file("//flows/test/factory-todo.test.ts"),
    Smithers.file("//flows/test/todo-pause.test.ts"),
    Smithers.file("//flows/test/coding-todo-failures.test.ts"),
    Smithers.file("//flows/test/todo-conflict.test.ts"),
    Smithers.file("//flows/test/coding-correction-stall.test.ts"),
    Smithers.file("//flows/test/coding-host-policy.test.ts"),
    Smithers.file("//flows/test/coding-host-modules.test.ts"),
    Smithers.file("//flows/test/coding-wiki-registry.test.ts"),
    Smithers.file("//flows/test/coding-create-flow-registry.test.ts"),
    Smithers.file("//flows/test/coding-pr-triage-host.test.ts"),
    Smithers.file("//flows/test/coding-jev-check.test.ts"),
    Smithers.file("//flows/test/coding-review-check.test.ts"),
    Smithers.file("//flows/test/coding-security-review-check.test.ts"),
    Smithers.file("//flows/test/coding-wiki-memory.test.ts"),
    Smithers.file("//flows/test/coding-catalog-refresh.test.ts"),
    Smithers.file("//flows/test/coding-vibe-evidence.test.ts"),
    Smithers.file("//flows/test/coding-vibe-admission.test.ts"),
    Smithers.file("//flows/test/coding-landing.test.ts"),
    Smithers.file("//flows/test/coding-landing-config.test.ts"),
    Smithers.file("//flows/test/coding-check-environment.test.ts"),
    Smithers.file("//flows/test/coding-check-output.test.ts"),
    Smithers.file("//flows/test/coding-vibe-landing.test.ts"),
    Smithers.file("//flows/test/coding-source-publication.test.ts"),
    Smithers.file("//flows/test/coding-dispatch.test.ts"),
    Smithers.file("//flows/test/coding-metered-steps.test.ts"),
    Smithers.file("//flows/test/moved-off-agent-dispatch.test.ts")
  ]),
  srcs: [...codingSources, ...codingProjectInputs],
  deps: codingDependencies,
  cwd,
  cache: true
})
// Agent memory: the dependency-doc import, calibration, the transcript miner
// and the wrapped-harness launch, each over `@smthrs/agent/Memory`.
const memory = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/memory-deps.test.ts"),
    Smithers.file("//flows/test/coding-wiki-import-docs.test.ts"),
    Smithers.file("//flows/test/memory-calibrate.test.ts"),
    Smithers.file("//flows/test/memory-mine.test.ts"),
    Smithers.file("//flows/test/wrapped.test.ts")
  ]),
  srcs: [
    ...codingSources,
    ...codingProjectInputs,
    Smithers.file("//flows/test/fixtures/memory-calibrate-e2e.jsonl")
  ],
  deps: codingDependencies,
  cwd,
  cache: true
})
const codingConfigBun = Smithers.NodeTest({
  runtime: bun,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/coding-project-config.test.ts"),
    Smithers.file("//flows/test/coding-host-policy.test.ts"),
    Smithers.file("//flows/test/coding-host-modules.test.ts"),
    Smithers.file("//flows/test/coding-wiki-registry.test.ts"),
    Smithers.file("//flows/test/coding-vibe-evidence.test.ts"),
    Smithers.file("//flows/test/coding-vibe-admission.test.ts"),
    Smithers.file("//flows/test/coding-landing.test.ts"),
    Smithers.file("//flows/test/coding-landing-config.test.ts"),
    Smithers.file("//flows/test/coding-vibe-landing.test.ts"),
    Smithers.file("//flows/test/coding-source-publication.test.ts")
  ]),
  srcs: [...codingSources, ...codingProjectInputs],
  deps: codingDependencies,
  cwd
})

// Explicit slow gates: preflight refuses missing native tools instead of letting
// opt-in integration cases silently skip. Shell.Test caches a green verdict, so
// the JJ and exporter bytes the gate spawns are key material through `tools`.
const nativeTools = [
  Smithers.Host.bin("jj"),
  Smithers.Host.bin("smithers-jj-export", { env: "SMITHERS_WORKSPACE_JJ_EXPORT_BINARY" })
]
const codingNative = Smithers.Shell.Test({
  bin: Smithers.Runtime.bin,
  runtime: node,
  args: ["flows/test/coding-native-gate.mjs", "source"],
  tools: nativeTools,
  data: [...codingSources, ...codingDependencies],
  timeout: "45m"
})

// The target index runs this inventory before accepting a declaration set.
const testCoverage = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/test/target-coverage.test.ts")]),
  srcs: [sources, Smithers.file("//flows/PACKAGE.ts"), Smithers.file("//flows/test/coding-native-gate.mjs")],
  deps: [],
  cwd
})
const codingNativeBun = Smithers.Shell.Test({
  bin: Smithers.Runtime.bin,
  runtime: bun,
  args: ["flows/test/coding-native-gate.mjs", "source"],
  tools: nativeTools,
  data: [...codingSources, ...codingDependencies],
  timeout: "45m"
})
const codingBundle = Smithers.Shell.Test({
  bin: Smithers.Runtime.bin,
  runtime: node,
  args: ["flows/test/coding-native-gate.mjs", "bundle"],
  tools: nativeTools,
  data: [...codingSources, ...codingDependencies],
  timeout: "45m"
})
const codingBundleBun = Smithers.Shell.Test({
  bin: Smithers.Runtime.bin,
  runtime: bun,
  args: ["flows/test/coding-native-gate.mjs", "bundle"],
  tools: nativeTools,
  data: [...codingSources, ...codingDependencies],
  timeout: "45m"
})
const wiki = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/wiki.test.ts"),
    Smithers.file("//flows/test/wiki-scripted-reviewer.test.ts")
  ]),
  srcs: [sources, ...todoTurns],
  deps: [],
  cwd
})

// Subscription judges share the native resolver and use the configured proxy.
// The fixtures serve a local account pool and refuse a proxy tunnel, so no
// live subscription or provider credential is needed.
const egress = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    Smithers.file("//flows/test/repository-jev-egress.test.ts"),
    Smithers.file("//flows/test/subscription-judge.test.ts")
  ]),
  srcs: codingSources,
  deps: codingDependencies,
  cwd
})

// The repository flows' offline fixtures, on `egress`'s key material. Before
// this target `egress` was the only one of its family declared anywhere, so the
// rest ran under bare `pnpm test`, which no workflow invokes.
//
// Legacy Plue adapter fixtures were removed with the Python adapter.
/** Explicit cross-package inputs; declaration-scoped globs do not cross child packages. */
const packageDocInputs = libraryPackages().flatMap(({ dir }) => {
  const docs = `${repoRoot}/${dir}/docs`
  const walk = (path: string): Array<string> =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${path}/${entry.name}`) : [`${path}/${entry.name}`]
    )
  return [
    Smithers.file(`//${dir}/package.json`),
    ...(existsSync(`${repoRoot}/${dir}/README.md`) ? [Smithers.file(`//${dir}/README.md`)] : []),
    ...(existsSync(docs) ? walk(docs).map((path) => Smithers.file(`//${path.slice(repoRoot.length + 1)}`)) : [])
  ]
})

/**
 * The `docs-sync` flow and the modules it runs. `flow.test.ts` drives the
 * real graph over `check` on this checkout, which packs every published
 * package (`package-docs.test.mjs`); `package-docs-redirect.test.mjs` holds the
 * Worker's generated page map to the docs it is built from.
 *
 * @since 1.0.0
 * @category test
 */
const packageDocs = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/docs-sync/package-docs-redirect.test.mjs"),
    Smithers.file("//flows/docs-sync/flow.test.ts")
  ]),
  timeout: "30m",
  cache: false,
  srcs: [
    sources,
    Smithers.file("//flows/docs-sync/package-docs.mjs"),
    Smithers.file("//flows/docs-sync/package-docs.d.mts"),
    Smithers.file("//flows/docs-sync/package-docs.test.mjs"),
    Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs"),
    Smithers.file("//pnpm-workspace.yaml"),
    Smithers.file("//apps/server/src/docsRedirectMap.ts"),
    ...packageDocInputs
  ],
  deps: [],
  cwd
})

const fixture = (name: string) => Smithers.file(`//flows/test/${name}`)
const repositoryFixtures = [
  "apply-proof",
  "approved-text",
  "budget",
  "check-context",
  "check-receipt",
  "checks",
  "chore-events",
  "ci-policy",
  "consolidated-reply",
  "evaluation",
  "feature-issue-mode",
  "heldout",
  "inspection-sources",
  "intake-screen",
  "intake-bounds",
  "jev-checks",
  "jev-duplicates",
  "jev-observation",
  "jev-reproduction",
  "jev-score",
  "native-error",
  "notification-policy",
  "pause-integrity",
  "policy-identity",
  "proposal-review",
  "push",
  "remote-source",
  "reply-trust",
  "retention",
  "review-eval",
  "selection",
  "setup-policy",
  "setup-suggestion",
  "sources",
  "stored-registration",
  "trial-checks",
  "trial-registration",
  "trigger-resume"
] as const
const repository = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner(
    repositoryFixtures.map((name) => fixture(`repository-${name}.test.ts`)) as [
      Smithers.Input.File,
      ...Array<Smithers.Input.File>
    ]
  ),
  // `repository-notification-policy` reads this repository's own projected
  // catalog to prove the policy flow is discovered into it.
  srcs: [...codingSources, Smithers.file("//.smithers/factory.json")],
  deps: codingDependencies,
  cwd,
  timeout: "20m"
})

// The wiki, release-content and canary fixtures, also in no target until now.
// Grouped by the inputs they read, as `suite` and `codingRuntime` are: each
// reaches a backend package, so none fits `suite` or `wiki`, which declare no
// dependency. `wiki-reuse` replays a whole reuse pass, two minutes on a loaded
// machine, so the group carries an explicit deadline.
const fixtures = Smithers.NodeTest({
  runtime: node,
  runner: Smithers.testRunner([
    fixture("coding-typecheck-build.test.mjs"),
    fixture("coding-flow-typecheck-build.test.mjs"),
    fixture("wiki-reuse.test.ts"),
    fixture("wiki-install-defaults.test.ts"),
    fixture("wiki-jev-citations.test.ts"),
    fixture("content-jev-template.test.ts"),
    fixture("coding-fault.test.ts"),
    fixture("run-record.test.ts"),
    fixture("canary-coding-setup.test.mjs"),
    fixture("invoke-native-host.test.ts"),
    fixture("decide-with-jev-docs.test.ts")
  ]),
  // `decide-with-jev-docs` reads the guide.
  srcs: [
    ...codingSources,
    Smithers.file("//docs/api/failure-codes.json"),
    Smithers.file("//packages/smithers/agent/model/docs/guides/decide-with-jev.md")
  ],
  deps: codingDependencies,
  cwd,
  timeout: "20m"
})

// Security review over the files this package owns. `wiki/` is a nested
// package with its own review; suites, fixtures and installs are excluded.
/**
 * The untrusted-report boundary for issue and pull-request triage.
 *
 * The model never receives a GitHub token; this suite holds the deterministic
 * publisher to an allowlisted schema and proves that a failed model run still
 * asks the author for the concrete evidence needed to continue. `flow.test.ts`
 * runs the `triage-publish` flow's real graph and layer over the module.
 *
 * @since 1.0.0
 * @category test
 */
const triagePublish = Smithers.NodeTest({
  summary:
    "GitHub triage publishes only validated labels and mention-free comments to the event's own issue, updating only its own comment.",
  featured: true,
  runner: Smithers.testRunner([
    Smithers.file("//flows/triage-publish/github-triage.test.mjs"),
    Smithers.file("//flows/triage-publish/flow.test.ts")
  ]),
  srcs: [
    sources,
    Smithers.file("//flows/triage-publish/github-triage.mjs"),
    Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs"),
    Smithers.file("//flows/issue-triage/flow.mdx"),
    Smithers.file("//flows/pr-triage/flow.mdx")
  ],
  deps: [],
  cwd
})

// Benchmarks, reliability campaign verifiers and installed-product performance
// checks. Each runnable entry is a flow under `bench/` or `perf/`; the gates
// below run the same modules from the checkout root, where their evidence
// directories resolve, and the suites run each flow's graph over its module.
const runModuleSource = Smithers.file("//flows/automation/run-module.ts")
const benchSources = [
  Smithers.glob("//flows/bench/**/*"),
  runModuleSource,
  Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs")
]
const perfSources = [Smithers.glob("//flows/perf/**/*"), runModuleSource]
const gatewaySources = Smithers.Filegroup({
  cwd: "packages/smithers/gateway",
  srcs: [Smithers.glob("src/**/*.ts"), Smithers.glob("test/**/*.ts")]
})
const machineSources = Smithers.Filegroup({ cwd: "packages/smithers-machined", srcs: [Smithers.glob("**/*")] })
const ffiSources = Smithers.Filegroup({ cwd: "packages/smithers-ffi", srcs: [Smithers.glob("src/**")] })

/** Required fast behavioral mutation tier, including both exact-byte guards. */
const mutationGate = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/bench/mutations/check-mutations.mjs")),
  srcs: benchSources,
  deps: [gatewaySources]
})

/** Deterministic scheduler and journal cost regressions, after output validation. */
const benchmarkGate = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/bench/gate/gate.mjs")),
  srcs: benchSources,
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
  runner: Smithers.testRunner([
    Smithers.file("//flows/bench/signal-campaign/check-signal-campaign.test.mjs"),
    Smithers.file("//flows/bench/signal-campaign/flow.test.ts")
  ]),
  srcs: [sources, ...benchSources],
  deps: [],
  cwd
})

/** Fail-closed benchmark and campaign-verifier regressions, and each bench flow over its module. */
const campaignVerifiers = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/bench/mutations/check-mutations.test.mjs"),
    Smithers.file("//flows/bench/mutations/flow.test.ts"),
    Smithers.file("//flows/bench/soak-campaign/check-soak-campaign.test.mjs"),
    Smithers.file("//flows/bench/soak-campaign/flow.test.ts"),
    Smithers.file("//flows/bench/gate/gate.test.mjs"),
    Smithers.file("//flows/bench/gate/flow.test.ts"),
    Smithers.file("//flows/bench/jj-abi-campaign/run-jj-abi-campaign.test.mjs"),
    Smithers.file("//flows/bench/jj-abi-campaign/flow.test.ts"),
    Smithers.file("//flows/bench/rebase-cache/flow.test.ts")
  ]),
  srcs: [
    sources,
    ...benchSources,
    Smithers.file("//flows/release/release-rehearsal.mjs"),
    Smithers.file("//.github/workflows/reliability.yml")
  ],
  deps: [],
  cwd
})

/** Installed-product measurements are opt-in; the library counter gate cannot serve. */
const perf = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/run.mjs")),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "24h"
})

/** Installed two-member keystroke workload; never substitutes for a receipt. */
const perfKeystroke = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/keystroke.mjs")),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "1h"
})

/** Persistent member SSH writes observed through the installed File card. */
const perfDiskWrite = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/disk-write.mjs")),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "1h"
})

/** Per-budget availability reports retain honest incomplete evidence. */
const perfProjection = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/run.mjs"), ["C-PERF-02"]),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "1h"
})
const perfWarmWake = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/run.mjs"), ["C-PERF-05"]),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "1h"
})
const perfRebaseHold = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/perf/run.mjs"), ["C-PERF-06"]),
  srcs: perfSources,
  deps: [],
  exclusive: true,
  timeout: "1h"
})

/** Performance and working-together drivers, their verifiers, and each perf flow over its module. */
const perfUnit = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/perf/working-together/faults.test.mjs"),
    Smithers.file("//flows/perf/working-together/flow.test.ts"),
    Smithers.file("//flows/perf/keystroke.test.mjs"),
    Smithers.file("//flows/perf/disk-write.test.mjs"),
    Smithers.file("//flows/perf/github-freshness/github-freshness.test.mjs"),
    Smithers.file("//flows/perf/github-freshness/flow.test.ts"),
    Smithers.file("//flows/perf/projection-delta.test.mjs"),
    Smithers.file("//flows/perf/questions.test.mjs"),
    Smithers.file("//flows/perf/warm-wake.test.mjs"),
    Smithers.file("//flows/perf/lib/ssh-member.test.mjs"),
    Smithers.file("//flows/perf/lib/stats.test.mjs"),
    Smithers.file("//flows/perf/lib/artifact.test.mjs"),
    Smithers.file("//flows/perf/flow.test.ts")
  ]),
  srcs: [sources, ...perfSources],
  deps: [],
  cwd
})

/** K1–K8 campaign keeps component evidence distinct from integrated proof. */
const workingTogetherFaults = Smithers.Shell.Test({
  shell: "node flows/perf/working-together/faults.mjs",
  data: [...perfSources, machineSources, ffiSources, Smithers.file("//Cargo.toml"), Smithers.file("//Cargo.lock")],
  exclusive: true,
  timeout: "1h"
})
const workingTogetherComponents = Smithers.Shell.Test({
  shell: "node flows/perf/working-together/faults.mjs --components-only",
  data: [...perfSources, machineSources, ffiSources, Smithers.file("//Cargo.toml"), Smithers.file("//Cargo.lock")],
  exclusive: true,
  timeout: "1h"
})

// The composed host suites build the backend; these are the inputs they read.
const composedHostInputs = [
  backendPackage.buildInputs,
  Smithers.file("//go.mod"),
  Smithers.file("//go.sum"),
  Smithers.file("//apps/app/package.json"),
  Smithers.file("//pnpm-lock.yaml")
]

/** K8 through the composed wiki host, real native state and PostgreSQL. */
const workingTogetherWikiFaults = Smithers.Shell.Test({
  shell: "node flows/perf/working-together/faults.mjs --wiki-only",
  data: [...perfSources, ...composedHostInputs],
  exclusive: true,
  timeout: "1h"
})

/** Code mirror recovery through composed HTTP/live with a scripted daemon peer. */
const workingTogetherCodeFaults = Smithers.Shell.Test({
  shell: "node flows/perf/working-together/faults.mjs --code-only",
  data: [...perfSources, ...composedHostInputs],
  exclusive: true,
  timeout: "1h"
})

/**
 * The runner every `checks/*` command check spawns, `checks/coding-check.sh`,
 * and its host check cache: real-runner sentinels and fail-closed gate
 * regressions. The runner is not a flow; the `checks/*` bodies name it in
 * their argv and their `proc:spawn` grant.
 */
const checkRunner = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/checks/coding-check.test.mjs"),
    Smithers.file("//flows/checks/check-cache.test.mjs")
  ]),
  srcs: [
    Smithers.file("//flows/checks/coding-check.sh"),
    Smithers.file("//flows/checks/check-cache.mjs"),
    Smithers.file("//packages/smithers/build/build-cli/src/KnownRed.ts")
  ],
  deps: [],
  cwd
})

/** `runModule`, which every automation flow runs its module through. */
const automation = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/automation/run-module.test.ts")]),
  srcs: [runModuleSource],
  deps: [],
  cwd
})

/**
 * The landing helper: the `land`, `land/renumber-migration` and
 * `land/lane-gates` flows over their modules, the lane gate and prerequisite
 * regressions, and the migration-landing suite, which drives the production
 * renumbering and push gates through real Go, the pinned sqlc and `smthrs`.
 * The gates read the checkout they land, so all of it is an input.
 *
 * @since 1.0.0
 * @category test
 */
const landSources = [Smithers.glob("//flows/land/**/*"), runModuleSource]
const land = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/land/flow.test.ts"),
    Smithers.file("//flows/land/renumber-migration/flow.test.ts"),
    Smithers.file("//flows/land/lane-gates/flow.test.ts"),
    Smithers.file("//flows/land/lane-gates.test.mjs"),
    Smithers.file("//flows/land/lane-prerequisites.test.mjs"),
    Smithers.file("//flows/land/migration-landing.test.mjs")
  ]),
  srcs: [sources, ...landSources],
  deps: [scriptPackage.repositoryInputs, backendSQLC],
  cwd
})

// 53 end-to-end cases drive commit.mjs through real git, jj and the production
// build CLI's gates: 798 s on a loaded 48-core lane host, past the 10-minute
// default that timed the target out in the Release gates lane (#3765).
const landCommit = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/land/commit.test.mjs")]),
  srcs: landSources,
  deps: [backendSQLC],
  timeout: "30m",
  cwd
})

/**
 * The release tooling: the modules the Release workflow and the
 * `smithers/Release` flow run, in `release/`, a typed flow for each runnable
 * step in `release/<step>/`, and the C-REL host evidence recorders in
 * `release/host/` and `release/journeys/`. The module suites run from the
 * checkout root, where they ran under `scripts/`, because they read the
 * workflows and the root manifest by repository path.
 */
const releaseSources = [
  Smithers.glob("//flows/release/**/*"),
  runModuleSource,
  Smithers.file("//packages/repo-targets/scripts/workspace-packages.mjs"),
  Smithers.file("//packages/repo-targets/contracts/check-single-effect-version.mjs")
]

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
  runner: Smithers.testRunner([Smithers.file("//flows/release/pack-release.test.mjs")]),
  // Both workflows are inputs: the suite compares the release workflow's gate
  // and toolchain steps against the generated CI workflow's, so an edit to
  // either one has to re-run this gate rather than read a cached pass.
  srcs: [
    ...releaseSources,
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
  runner: Smithers.testRunner([Smithers.file("//flows/release/generate-changelog.test.mjs")]),
  srcs: releaseSources,
  deps: []
})

/**
 * Checks that a cut writes the version and the changelog, verifies both, and
 * tags without pushing.
 *
 * The fixture is a temporary repository holding copies of the scripts a cut
 * spawns, so a case cannot reach this checkout's manifests: every one of them
 * resolves its repository root from its own location.
 *
 * @since 1.0.0
 * @category test
 */
const releaseCut = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//flows/release/cut-release.test.mjs")]),
  srcs: releaseSources,
  deps: []
})

/**
 * Checks release preparation, installed consumer boundaries and runtime floors,
 * and the publication path's registry adapter.
 *
 * Several assertions read `release.yml` itself, so an edit that breaks the
 * release fails here instead of at the next release.
 *
 * @since 0.1.0
 * @category test
 */
const releaseSuite = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/release/release-publish.test.mjs"),
    Smithers.file("//flows/release/build-release.test.mjs"),
    Smithers.file("//flows/release/check-api-baseline.test.mjs"),
    Smithers.file("//flows/release/release-consumers.test.mjs"),
    Smithers.file("//flows/release/release-npm-support.test.mjs"),
    Smithers.file("//flows/release/release-node-support.test.mjs"),
    Smithers.file("//flows/release/release-peer-ranges.test.mjs"),
    Smithers.file("//flows/release/release-registry.test.mjs"),
    Smithers.file("//flows/release/release-process.test.mjs"),
    Smithers.file("//flows/release/runtime-node-support.test.mjs"),
    Smithers.file("//flows/release/release-mcp-handshake.test.mjs")
  ]),
  srcs: [
    ...releaseSources,
    Smithers.file("//packages/repo-targets/scripts/build-library.mjs"),
    Smithers.file("//packages/repo-targets/scripts/private-effect-adapters.mjs"),
    Smithers.file("//packages/repo-targets/contracts/package-contract.test.mjs"),
    Smithers.file("//.pnpmfile.mjs"),
    Smithers.file("//.github/workflows/release.yml"),
    Smithers.file("//.github/workflows/ci.yml")
  ],
  deps: []
})

/**
 * Every public package's declarations hash to the reviewed
 * `release/fixtures/public-api-baseline.json`.
 *
 * Compiles with each package's release compiler into an isolated temporary
 * tree. Private adapter declarations use the same producer as publication;
 * packing and the full package JavaScript builds remain separate gates.
 *
 * @since 1.0.0
 * @category build
 */
const apiBaseline = Smithers.NodeBinary({
  entry: Smithers.file("//flows/release/check-api-baseline.mjs"),
  args: ["--build-declarations"],
  timeout: "30m",
  srcs: [
    ...releaseSources,
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
  entry: Smithers.file("//flows/release/pack-release.mjs"),
  args: [packDirectory],
  srcs: releaseSources,
  // Most packages use workspace default-target synthesis and therefore have
  // no PACKAGE.ts export this file can import. The selector is still a real
  // graph edge: every package `lib` settles before packing, including future
  // packages admitted under `packages/`. `lib` is the whole distribution,
  // `dist/esm` and `dist/cjs`, which is what `assertBuilt` in the packing
  // program requires; nothing here depends on a prior `pnpm run build`.
  deps: [apiBaseline, Smithers.Target.subtree("//packages/...", "lib")]
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
  runner: Smithers.entrypoint(Smithers.file("//flows/release/smoke-release.mjs"), [packDirectory]),
  srcs: releaseSources,
  deps: [releasePack]
})

/**
 * What an npm consumer of the published set actually resolves.
 *
 * pnpm settles every internal edge from one workspace-wide pin, so
 * `//packages/repo-targets:effectVersion` stays green while an npm install of
 * the same tarballs duplicates Effect or drags a test runner into a production
 * dependency tree. This packs the release manifests, resolves them with npm's
 * own arborist, and asserts a single `effect` copy and no optional peer in the
 * default install.
 *
 * The resolution reads registry metadata, so this target needs the network and
 * is not cacheable. It re-runs regardless, which is what a gate over an
 * external resolver has to do.
 *
 * @since 0.1.0
 * @category test
 */
const npmDedupe = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("//flows/release/check-npm-dedupe.mjs")),
  srcs: releaseSources,
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
  runner: Smithers.testRunner([Smithers.file("//flows/release/check-npm-dedupe.test.mjs")]),
  srcs: releaseSources,
  deps: []
})

/** Verifies immutable-artifact publication and partial-retry refusal using a fake registry. */
const releaseIntegrity = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/release/publish-release.test.mjs"),
    Smithers.file("//flows/release/installer-release.test.mjs"),
    Smithers.file("//flows/release/restore-release.test.mjs")
  ]),
  srcs: releaseSources,
  deps: []
})

/**
 * The documentation-lane checks a cut runs, the Homebrew formula, bottle and
 * publication refusals, and the C-REL-02/03/06 recorders' portable logic.
 */
const releaseTools = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/release/lane-checks.test.mjs"),
    Smithers.file("//flows/release/homebrew-publish.test.mjs"),
    Smithers.file("//flows/release/homebrew-release.test.mjs"),
    Smithers.file("//flows/release/journeys/release-install.test.mjs"),
    Smithers.file("//flows/release/host/host-maintenance-evidence.test.mjs")
  ]),
  srcs: releaseSources,
  deps: [scriptPackage.repositoryInputs, backendSQLC]
})

/**
 * Every `release/<step>` flow through the flow API: the real graph and layer
 * over a real child process running the step's module, for a refusal and,
 * where the module has a side-effect-free path, a success.
 *
 * @since 1.0.0
 * @category test
 */
const releaseSteps = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("//flows/release/build-packages/flow.test.ts"),
    Smithers.file("//flows/release/api-baseline/flow.test.ts"),
    Smithers.file("//flows/release/version/flow.test.ts"),
    Smithers.file("//flows/release/changelog/flow.test.ts"),
    Smithers.file("//flows/release/cut/flow.test.ts"),
    Smithers.file("//flows/release/pack/flow.test.ts"),
    Smithers.file("//flows/release/smoke/flow.test.ts"),
    Smithers.file("//flows/release/restore/flow.test.ts"),
    Smithers.file("//flows/release/publish/flow.test.ts"),
    Smithers.file("//flows/release/installer/flow.test.ts"),
    Smithers.file("//flows/release/homebrew/flow.test.ts"),
    Smithers.file("//flows/release/homebrew-publish/flow.test.ts"),
    Smithers.file("//flows/release/rehearsal/flow.test.ts"),
    Smithers.file("//flows/release/npm-dedupe/flow.test.ts")
  ]),
  srcs: [sources, ...releaseSources],
  deps: [],
  cwd
})

const securityReview = Smithers.SecurityReview({
  cwd,
  include: [
    // The lane gates are bash; they were reviewed under scripts/ before.
    Smithers.glob("land/**/*.sh"),
    Smithers.glob("**/*.{ts,mjs,js,mdx}", {
      exclude: ["wiki/**", "test/**", "node_modules/**", "migrate-smithers-v1/test/**", "**/*.test.ts", "**/*.test.mjs"]
    }),
    Smithers.glob("checks/*.sh"),
    // The C-REL-05 credential soak recorder; it was reviewed under scripts/ before.
    Smithers.glob("release/host/*.{sh,py}", { exclude: ["**/*.test.py"] })
  ],
  checks: [
    {
      id: "repository-credential-containment",
      title: "The reserved repository token and gateway credential never reach tools, models, logs or child processes",
      threat:
        "A prompt-injected agent or approved shell tool reads SMITHERS_JJHUB_TOKEN or the gateway credential and acts as the workspace on its repository.",
      lookFor: [
        "SMITHERS_JJHUB_TOKEN read from process.env anywhere other than coding/landing-config.ts, or read before it is deleted there.",
        "A spawned process or check environment built from process.env instead of the PATH/HOME/proxy allowlist in coding/check-environment.ts.",
        "SMITHERS_CACHE_TOKEN or SMITHERS_CACHE_URL left in process.env after coding/check-environment.ts consumes them, or given to anything but repository checks (repositoryCheckEnvironment).",
        "A token or credential passed to a model prompt, a run output, a receipt, an error message, or Redacted.value outside the HTTP bearer header.",
        "invoke/serve.ts rpc or serve paths that print or journal the credential file contents."
      ],
      paths: [
        "coding/serve.ts",
        "coding/check-environment.ts",
        "coding/landing-config.ts",
        "coding/landing.ts",
        "coding/host.ts",
        "invoke/**",
        "repository/remote.ts",
        "repository/check-receipt.ts",
        "coding/check-detection.ts"
      ]
    },
    {
      id: "remote-url-construction",
      title: "Repository API URLs are built only from validated, encoded identifiers",
      threat:
        "A repository event, PR body or server response steers a credentialed request to another repository, gateway or host.",
      lookFor: [
        "A path segment interpolated into a URL without encodeURIComponent or a pattern check (job keys like flow:<slug>, change ids from a landing response, fullName from repository-source).",
        "The github(path) proxy accepting a path that githubReadable does not fully anchor, or fullName taken from event text instead of repository-source metadata.",
        "apiBaseUrl accepted over plain http: outside a loopback test host while carrying a bearer token.",
        "A PR link parsed from comment text used to pick the repository whose source is retained or reviewed."
      ],
      paths: ["repository/remote.ts", "repository/check-receipt.ts", "coding/landing.ts"]
    },
    {
      id: "source-tree-confinement",
      title: "Every read, write and process cwd stays inside its captured source tree",
      threat:
        "A model-authored reproduction fixture, prompt-named path or repository symlink reads or overwrites host files outside the isolated checkout.",
      lookFor: [
        "A path from a model, event or repository joined to a root without normalizePath plus realPath containment (admitSourcePath, contained, inside).",
        "A check done on the path string but the write or read done through a symlinked ancestor created after the check (TOCTOU).",
        "Reproduction fixtures written without flag wx or able to overwrite existing source; repro.cwd resolved outside root.",
        "Reads of .smithers/repository-jobs or other host-private paths through a symlink that repositorySourceReader does not re-check.",
        "release-support atomicWrite/inside accepting an absolute, backslash or .. path."
      ],
      paths: [
        "repository/source.ts",
        "repository/execution.ts",
        "repository/inspection.ts",
        "repository/checks.ts",
        "repository/check-context.ts",
        "coding/filesystem.ts",
        "coding/immutable-source.ts",
        "coding/snapshots.ts",
        "release-support/io.ts",
        "coding/check-detection.ts"
      ]
    },
    {
      id: "process-exec-argv",
      title: "Spawned commands use fixed programs and argv arrays, never shell strings built from untrusted text",
      threat:
        "An issue author or model output runs arbitrary commands on the coding or release host with its credentials.",
      lookFor: [
        "ChildProcess.make or spawn with a shell (sh -c, shell: true) whose string includes event, model or repository text.",
        "jj revsets or templates built by interpolating a commit id or ref that is not pattern-checked to hex first.",
        "A model-authored argv (repro.argv, check commands) run without a timeout, output bound, or the isolated source cwd.",
        "A flow.mdx/flow.ts capability grant `proc:spawn:<cmd> *` broader than the commands the body runs."
      ],
      paths: ["repository/**", "coding/**", "release-support/**", "**/flow.mdx", "**/flow.ts"]
    },
    {
      id: "check-command-provenance",
      title:
        "Shell check commands come only from the pinned, reviewed repository CI policy and run without credentials",
      threat:
        "A change author or issue author gets arbitrary shell text run by /bin/sh -c on the coding host, or reads host credentials from inside a check.",
      lookFor: [
        "executeCommand's check.rule reaching /bin/sh -eu -c from the candidate tree, event payload, model output or an unpinned policy instead of readCiPolicy's pinned registration.",
        "composeCiChecks or rawCheckId letting a local check reuse the inherited CI namespace, or a policy revision/digest change not refused by assertCiPolicyCurrent before execution.",
        "checkEnvironment or ImmutableSourceOptions.environment carrying SMITHERS_JJHUB_TOKEN, a gateway credential or process.env instead of an explicit allowlist (runSourceProcess uses extendEnv: false).",
        "A command check run with no deadline, or outside the scoped immutable export root."
      ],
      paths: [
        "repository/checks.ts",
        "repository/ci-policy.ts",
        "repository/changes.ts",
        "coding/immutable-source.ts",
        "coding/host.ts",
        "coding/serve.ts"
      ]
    },
    {
      id: "untrusted-event-prompt-injection",
      title: "Issue, PR and comment text is treated as data and cannot authorize actions",
      threat:
        "An outside GitHub user writes an issue or comment that makes an agent land code, publish a reply, approve a step or exfiltrate repository content.",
      lookFor: [
        "Event author text concatenated into a prompt without the untrusted-content framing in repository/intake.ts.",
        "A publish, land, approve or pause decision keyed on text the event author controls rather than a verified role or approved digest (approved-text.ts, reply-trust).",
        "A steering or correction message accepted from someone other than the run owner.",
        "Withheld or hidden fields from the intake screen still reaching a later model step."
      ],
      paths: [
        "repository/intake.ts",
        "repository/replies.ts",
        "repository/approved-text.ts",
        "repository/triggers.ts",
        "repository/delivery.ts",
        "repository/jev-*.ts",
        "coding/steering.ts",
        "coding/correction.ts",
        "coding/feedback.ts",
        "issue-triage/**",
        "pr-triage/**",
        "review/**"
      ]
    },
    {
      id: "pinned-invocation-integrity",
      title: "An invocation runs only the approved flow bytes under its own tag",
      threat:
        "A repository author swaps the body of an approved flow via a sibling module or node_modules alias and runs it with the invocation credential.",
      lookFor: [
        "invoke/host.ts digest covering only flow.ts while relative imports run live.",
        "registerPinnedLibraries replacing or trusting an existing repository node_modules entry.",
        "A flow name with ./.. or backslash segments accepted by options.flow.",
        "A descriptor registered whose declaredTag differs from its path-derived name."
      ],
      paths: [
        "invoke/**",
        "coding/host-modules.ts",
        "coding/host-modules-build.mjs",
        "coding/build.mjs",
        "repository/registry.ts"
      ]
    },
    {
      id: "landing-authority",
      title: "Landing and publication write only the approved change to the bound repository",
      threat:
        "A coding run pushes unreviewed commits, rewrites main, or publishes to a repository or ref it was not bound to.",
      lookFor: [
        "A push or land call whose target ref, repository id or commit is not the one recorded in the approved plan or receipt.",
        "Force pushes, deletes or ref updates outside refs/smithers/workspaces/<workspaceId>/.",
        "A landing that proceeds when checks or the completion receipt are missing or failed.",
        "vibe-cleanup deleting refs or files it did not create."
      ],
      paths: [
        "coding/landing.ts",
        "coding/vibe-*.ts",
        "coding/source-*.ts",
        "repository/delivery.ts",
        "repository/changes.ts",
        "repository/retention.ts"
      ]
    },
    {
      id: "release-secret-redaction",
      title: "Release and publishing steps never leak registry or social credentials",
      threat:
        "A release failure prints NPM or X tokens into logs, run outputs or public release notes that anyone can read.",
      lookFor: [
        "Diagnostics that redact only env keys matching token|secret|password|api.?key, missing names like *_AUTH, *_PAT or CREDENTIAL.",
        "Output truncated before redaction so a partial secret survives the split/join.",
        "Release notes or tweets built from model output without review before publishing.",
        "npm publish, tag push or X post reachable without the release approval step."
      ],
      paths: ["release/**", "release-support/**", "release-content/**", "release-notes/**", "rollout/**"]
    },
    {
      id: "triage-untrusted-report",
      title: "Issue and PR triage publishes only validated output to the repository the event named",
      threat:
        "An issue or PR author steers the triage model or code it runs into labeling, commenting on, or redirecting writes to issues the GitHub token can reach.",
      lookFor: [
        "apply() reading repository and number from .triage/context.json, a file the model step or the `pnpm test` it may spawn can rewrite before apply runs.",
        "A report comment posted with a live @mention: any `@` after a non-alphanumeric character, inside emphasis, or spelled as an HTML entity (&#64;, &#x40;, &commat;) that neutralizeMentions leaves unbroken.",
        "apply() writing without the issue or PR number passed on its command line, or without refusing an event file that names a different number.",
        "A label, comment or PATCH target not checked against LABELS, the event's own number, or a comment authored by the triage bot itself.",
        "GH_TOKEN or GitHub error bodies echoed into the fallback comment or stdout."
      ],
      paths: ["triage-publish/**"]
    },
    {
      id: "land-subprocess-args",
      title: "The landing helper spawns processes with argument vectors, never shell strings built from inputs",
      threat:
        "A crafted CLI flag, environment value, commit message or git ref makes the landing helper run arbitrary shell commands on a maintainer or CI host.",
      lookFor: [
        "exec, execSync or spawn with shell:true, or sh -c, interpolating argv, environment variables, file contents or git output.",
        "A string option split on spaces and executed."
      ],
      paths: ["land/commit.mjs"]
    },
    {
      id: "bench-subprocess-args",
      title: "Benchmarks and campaigns spawn processes with argument vectors, never shell strings built from inputs",
      threat:
        "A crafted CLI flag, environment value, commit message or git ref makes a benchmark or campaign run arbitrary shell commands on a maintainer or CI host.",
      lookFor: [
        "exec, execSync or spawn with shell:true, or sh -c, interpolating argv, environment variables, file contents or git output.",
        "A string option split on spaces and executed, like rebase-cache --install."
      ],
      paths: ["bench/**"]
    },
    {
      id: "bench-check-cache-poisoning",
      title: "The rebase cache benchmark cannot carry forged verdicts or escape its scratch root",
      threat:
        "Code under check in one revision plants passing target results or links that a later revision's check replays as green, or that overwrite host files.",
      lookFor: [
        "copyMissing following a symlink or special file, or writing outside the partition or the export's .flows/cache.",
        "An existing valid entry replaced by a check's own output.",
        "SMITHERS_CHECK_CACHE_DIR or the partition marker accepted when relative or pointing outside the cache root."
      ],
      paths: ["bench/rebase-cache/**"]
    },
    {
      id: "bench-credential-scrubbing",
      title: "Cache and registry tokens never reach benchmark child processes that do not need them",
      threat:
        "A benchmark subprocess inherits SMITHERS_CACHE_* or registry tokens and leaks them into logs or untrusted package code.",
      lookFor: [
        "A spawn passing { ...process.env } to package installs or repository code without deleting SMITHERS_CACHE_TOKEN, SMITHERS_CACHE_READ_TOKEN, SMITHERS_CACHE_WRITE_TOKEN, NPM_TOKEN or GH_TOKEN.",
        "Environment dumps or error messages that print token-bearing variables."
      ],
      paths: ["bench/**"]
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
      paths: ["checks/coding-check.sh"]
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
      paths: ["checks/check-cache.mjs"]
    },
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
      paths: [
        "release/publish-release.mjs",
        "release/cut-release.mjs",
        "release/set-release-version.mjs",
        "release/release-process.mjs"
      ]
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
      paths: ["release/restore-release.mjs"]
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
      paths: [
        "release/pack-release.mjs",
        "release/release-native-helpers.mjs",
        "release/build-release.mjs",
        "release/packed-export-targets.mjs"
      ]
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
        "release/smoke-release.mjs",
        "release/release-registry.mjs",
        "release/release-consumers.mjs",
        "release/check-npm-dedupe.mjs",
        "release/fixtures/installed-consumer/**"
      ]
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
      paths: ["release/generate-changelog.mjs"]
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
      paths: ["release/release-consumers.mjs", "release/smoke-release.mjs"]
    }
  ]
})

export const Package = Smithers.Package({
  targets: {
    scripts,
    codingHostInputs,
    coding,
    codingPolicy,
    codingRuntime,
    memory,
    codingConfigBun,
    codingNative,
    testCoverage,
    codingNativeBun,
    codingBundle,
    codingBundleBun,
    codingHostBundle,
    egress,
    fixtures,
    pack,
    check,
    lint,
    fmt,
    repository,
    suite,
    recording,
    issueSweep,
    issueSweepVm,
    packageDocs,
    provider,
    wiki,
    triagePublish,
    automation,
    packManifest,
    changelog,
    releaseCut,
    releaseSuite,
    apiBaseline,
    releasePack,
    releaseSmoke,
    npmDedupe,
    npmDedupeUnit,
    releaseIntegrity,
    releaseTools,
    releaseSteps,
    land,
    landCommit,
    mutationGate,
    benchmarkGate,
    signalCampaign,
    campaignVerifiers,
    perf,
    perfUnit,
    checkRunner,
    perfKeystroke,
    perfDiskWrite,
    perfProjection,
    perfWarmWake,
    perfRebaseHold,
    workingTogetherFaults,
    workingTogetherComponents,
    workingTogetherWikiFaults,
    workingTogetherCodeFaults,
    ...securityReview
  }
})
