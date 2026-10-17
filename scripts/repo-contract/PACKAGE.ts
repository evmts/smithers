/**
 * Targets for the repository-contract gates.
 *
 * They live in their own directory, and their own PACKAGE.ts file, because they are
 * about the workspace rather than about any package in it: the CI inventory,
 * the test wiring, the egress client and the Mac distribution. The other
 * repository-contract suites live in `packages/repo-targets/contracts/`.
 * `//scripts/...` is recursive, so the whole set stays under the one pattern the
 * pipeline already runs.
 *
 * The interpreter comes from the root runtime declaration. Nothing here spells
 * `node`.
 */
import { Smithers } from "@smthrs/targets"
import { Package as scriptPackage } from "../PACKAGE.ts"

/** Every gate in this directory, digested as the input of each target. */
const sources = Smithers.glob("//scripts/repo-contract/**/*.mjs")

/**
 * Every workspace member with tests is reachable from the command CI runs.
 *
 * @since 1.0.0
 * @category test
 */
const testScriptWiring = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/repo-contract/test-script-wiring.test.mjs")]),
  srcs: [
    sources,
    Smithers.file("//flows/release/release-rehearsal.mjs"),
    Smithers.file("//PACKAGE.ts"),
    Smithers.file("//.smithers/target-index.json"),
    Smithers.file("//scripts/PACKAGE.ts"),
    Smithers.file("//scripts/repo-contract/PACKAGE.ts"),
    Smithers.file("//.github/workflows/ci.yml"),
    Smithers.file("//package.json"),
    Smithers.file("//pnpm-workspace.yaml")
  ],
  deps: [scriptPackage.repositoryInputs]
})

/** Mac distribution deletion and lifecycle handoff contract. */
const macDistribution = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/repo-contract/mac-distribution.test.mjs")]),
  srcs: [sources, ],
  deps: [scriptPackage.repositoryInputs]
})

/**
 * No shipped Node composition installs an HTTP client that ignores the egress
 * proxy its environment names.
 *
 * The gate reads shipped source across `packages/`, `apps/`, `flows/` and
 * `examples/`, which a declared glob may not cross, so `srcs` names only this
 * directory and the gate re-runs regardless. That is correct here for the same
 * reason it is correct for `packageContract`: its subject is the whole
 * workspace.
 *
 * @since 1.0.0
 * @category test
 */
const egressHttpClient = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/repo-contract/egress-http-client.test.mjs")]),
  srcs: [sources],
  deps: []
})

/**
 * Actual planner selection, runtime policy, sentinels and cache behavior.
 * This only plans commands; distribution outputs are not declaration inputs.
 * Keep it independent of builds so inventory can run beside a release gate.
 * Reuse metadata from identical earlier plans rather than rebuilding the
 * same native plan for each CLI selection, and host CLI invocations serially
 * in a persistent child without reloading its modules. The parent enforces
 * SIGTERM then SIGKILL deadlines. The NodeTest stays uncached.
 */
const ciInventory = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/repo-contract/ci-inventory.test.mjs")]),
  srcs: [sources, Smithers.file("//packages/repo-targets/contracts/ci-inventory.mjs"), Smithers.file("//packages/repo-targets/contracts/ci-planner.mjs")],
  deps: []
})

/**
 * Security review of the repository-contract gates: the egress and privacy
 * gates must keep failing when they should, and the gates' own child
 * processes and temporary files must not widen what a test run can touch.
 *
 * @since 1.0.0
 * @category security
 */
const securityReview = Smithers.SecurityReview({
  cwd: "scripts/repo-contract",
  include: ["*.mjs", "*.md"],
  checks: [
    {
      id: "egress-gate-coverage",
      title: "The egress gate reads every shipped source that could install a proxy-blind HTTP client",
      threat: "A contributor ships a Node host that dials origins directly past the sandbox egress proxy, letting a sandboxed run exfiltrate data, while the gate stays green.",
      lookFor: [
        "A shipped source extension (.js, .cjs, .mts, .cts, .jsx) that isSource drops, so layerUndici or makeDispatcher in it is never scanned.",
        "A skippedDirectories or skippedPaths entry that prunes a directory holding shipped, non-test source.",
        "An isComment rule that exempts a code line (for example one starting with `*` inside an expression, or code after a `/* */` on the same line).",
        "A banned spelling reachable without matching the regex, such as a renamed import or a computed property access on NodeHttpClient.",
        "The defines allowlist or install-count floor changed so the ban can pass with the replacement absent."
      ],
      paths: ["egress-http-client.test.mjs"]
    },
    {
      id: "child-process-containment",
      title: "Gate child processes run fixed code with bounded time and no inherited secrets they do not need",
      threat: "A repository file or environment value controls code a gate evaluates, or a hung child survives the gate, running attacker-chosen code or holding CI runner resources.",
      lookFor: [
        "A spawn or spawnSync `--eval`/`-e` string built by interpolating file contents, package names or environment values instead of passing data on stdin or IPC.",
        "A shell: true spawn or an exec() of a string assembled from repository data.",
        "A child spawned without timeout, SIGKILL fallback or t.after cleanup.",
        "A child env built from `...process.env` that forwards cache tokens or credentials (SMITHERS_CACHE_TOKEN, NPM_TOKEN) to a stub it does not need them for.",
        "A PATH prefix pointing at a directory that is not a fresh mkdtemp owned by the test."
      ],
      paths: ["ci-inventory.test.mjs"]
    },
    {
      id: "temp-file-safety",
      title: "Gates write only inside fresh temporary directories they create and remove",
      threat: "Another local user on a shared CI runner pre-plants a symlink at a predictable temp path so a gate overwrites or reads a file it should not.",
      lookFor: [
        "A writeFileSync to a predictable tmpdir() path (fixed name or pid) instead of a mkdtemp directory, such as the default smithers-ci-inventory-<pid>.json artifact.",
        "An environment-supplied output path (SMITHERS_CI_INVENTORY) written without checking it stays inside the workspace or a temp directory.",
        "rmSync(..., { recursive: true, force: true }) on a path not returned by mkdtemp in the same test.",
        "symlinkSync into a fixture that points outside the fixture root."
      ],
      paths: ["ci-inventory.test.mjs"]
    },
    {
      id: "ci-workflow-gates",
      title: "Workflow gates keep required CI jobs failing on real failures",
      threat: "A contributor edits ci.yml or reliability.yml so a required security or test job passes on failure, letting vulnerable code merge to main.",
      lookFor: [
        "An assertion that tolerates continue-on-error: true, `|| true`, or an allow-failure known-red list on a required job.",
        "A regex match on a workflow run string loose enough to accept an extra command that skips or neuters the suite.",
        "A test file excluded from every target in test-script-wiring without a stated reason.",
        "A skip or todo in the fault matrix accepted without a declared reason row in fault-gaps.md."
      ],
      paths: ["test-script-wiring.test.mjs", "ci-inventory.test.mjs"]
    }
  ]
})

export const Package = Smithers.Package({
  targets: { macDistribution, egressHttpClient, testScriptWiring, ciInventory, ...securityReview }
})
