/** Stage-4 evidence, separate from repository display configuration. All authors/outcomes are mock scenarios. */
export type Runtime = "Node" | "Deno" | "Bun"
export type DependencyKind = "runtime" | "peer" | "dev" | "optional"

/** Explicit discovery scope. Empty packages plus shared-input means repository-wide, not unaffected. */
export interface Relation {
  kind: "issue" | "pull" | "commit" | "run" | "stack"
  ref: string
  packages: string[]
  basis: "declared" | "changed-path" | "dependency" | "shared-input"
  paths: string[]
  owners: string[]
}

export interface PendingChangeset {
  id: string
  path: string
  summary: string
  packages: Array<{ name: string; type: "patch" | "minor" | "major" }>
}

/** Direct/fixed/dependency impact stays distinct; exact next versions await the pinned CLI preview. */
export interface ReleasePlan {
  status: "needs-preview" | "ready" | "stale" | "failed"
  source: string
  origin: "derived"
  currentVersion: string
  nextVersion: string | null
  mode: "pre"
  tag: string
  changesets: PendingChangeset[]
  fixedGroup: string[]
  directChanges: Array<{ package: string; type: "patch" | "minor" | "major"; changesets: string[] }>
  fixedGroupExpansion: string[]
  dependencyPropagation: Array<{ package: string; dependency: string; kind: DependencyKind }>
  packages: Array<{
    name: string; path: string; currentVersion: string; nextVersion: string | null
    type: "patch" | "minor" | "major"; reason: "direct" | "fixed" | "dependency"
    changesets: string[]; publish: boolean
  }>
  privatePackagesExcluded: string[]
  tooling: { package: string; version: string; command: string; publishCommand: string; source: string }
  preview: { run: string; baseSha: string; inputsHash: string; state: "waiting" | "ready" | "failed"; reason: string }
  existingPull: number | null
  historyDirectory: string
  releaseWorkflow: string
  website: { state: string; detail: string }
}

/** A workspace may have no project; runtime eligibility and file exclusions are different facts. */
export interface CiProject {
  name: string
  package: string
  path: string
  runtimes: Runtime[]
  configured: boolean
  exclusions: Partial<Record<Runtime, string[]>>
  integration: boolean
  condition: string
  commands: Partial<Record<Runtime, string>>
}

export interface CiResult {
  package: string
  project: string
  runtime: Runtime
  state: "success" | "failure" | "excluded" | "skipped" | "missing" | "running" | "queued" | "cancelled"
  reason: string
  stage: string
  run: string
  duration: string
  path?: string
  line?: number
  test?: string
}

/** Results are package/project cells within three runtime jobs, never one GitHub job per cell. */
export interface CiMatrix {
  run: string
  workflow: string
  event: string
  state: string
  sharedChecks: Array<{ stage: string; name: string; state: string; reason: string }>
  results: CiResult[]
}

export interface CiProjects {
  source: string
  workflow: string
  documentationSource: string
  jobs: Array<{ id: string; name: string; runtime?: Runtime; command: string; condition: string; version?: string }>
  environment: Record<string, string>
  containers: string[]
  projects: CiProject[]
  additionalProjects: Array<{ name: string; package: string; path: string; runtimes: Runtime[]; condition: string; command: string; state: string }>
  matrices: CiMatrix[]
  sourceNotes: string[]
}

/** Technical notes are checkout-derived; publication dates and tags are explicit scenario receipts. */
export interface PackageRelease {
  package: string
  slug: string
  version: string
  tag: string
  body: string
  source: string
  date: string
  publication: "scenario"
}

export interface EffectExtras {
  relations: Relation[]
  releasePlan: ReleasePlan
  ciProjects: CiProjects
  packageReleases: PackageRelease[]
}
