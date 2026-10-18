import { branches, commits, file, MOCK_NOW, pull, pulls, repo, run } from "../../repo/fixtures"
import { extras } from "../../repo/fixtures/data/Effect-TS__effect"
import type { Commit, DiffFile, PackageInfo, Pull } from "../../repo/fixtures/types"
import scenarios from "./scenarios.json"

export interface Preview {
  base: string
  inputs: string
  nextVersion: string
  packages: typeof extras.releasePlan.packages
  direct: number
  fixed: number
  dependencies: number
}
export interface ReleaseSession {
  preview: Preview | null
  state: "idle" | "running" | "failed" | "opened"
  requestedAt?: number
}
const memory = new Map<string, ReleaseSession>()
const key = () => `effect-release-plan:v1:${repo.slug}`
export const initialSession = (): ReleaseSession => ({ preview: null, state: "idle" })
export const loadSession = (): ReleaseSession => {
  if (memory.has(repo.slug)) return memory.get(repo.slug)!
  try {
    const saved = JSON.parse(sessionStorage.getItem(key()) ?? "null") as ReleaseSession | null
    if (saved && ["idle", "running", "failed", "opened"].includes(saved.state)) return saved
  } catch { /* The mock also works without browser storage. */ }
  return initialSession()
}
export const saveSession = (value: ReleaseSession) => {
  memory.set(repo.slug, value)
  try { sessionStorage.setItem(key(), JSON.stringify(value)) } catch { /* In-memory fallback. */ }
}

/** The exact version is a mocked CLI response, not a prediction from the checkout. */
export const computePreview = (base = extras.releasePlan.preview.baseSha): Preview => {
  const plan = extras.releasePlan
  const packages = plan.packages.filter(pkg => pkg.publish && !plan.privatePackagesExcluded.includes(pkg.name))
    .map(pkg => ({ ...pkg, nextVersion: scenarios.preview.nextVersion }))
  return {
    base, inputs: plan.preview.inputsHash, nextVersion: scenarios.preview.nextVersion, packages,
    direct: plan.directChanges.length, fixed: plan.fixedGroupExpansion.length,
    dependencies: new Set(plan.dependencyPropagation.map(item => item.package)).size
  }
}
export const previewIsStale = (preview: Preview, head: string) =>
  preview.base !== head || preview.inputs !== extras.releasePlan.preview.inputsHash
export const movedHead = scenarios.preview.movedSha
export const preparationFailure = scenarios.failure
export const versionPullNumber = scenarios.pull.n
export const slugOf = (pkg: PackageInfo) => pkg.slug ?? pkg.name.replace(/^@effect\//, "")

const versionFiles = (): DiffFile[] => {
  const plan = extras.releasePlan
  const packageFiles = plan.packages.filter(pkg => pkg.publish).flatMap<DiffFile>(pkg => {
    const manifestPath = `${pkg.path}/package.json`
    const original = file(manifestPath)?.content
    const next = original?.replaceAll(plan.currentVersion, scenarios.preview.nextVersion)
    const manifest: DiffFile = {
      path: manifestPath, status: "modified", additions: 1, deletions: 1,
      lines: [
        { kind: "hunk", text: "@@ -1,4 +1,4 @@" },
        { kind: "ctx", text: "{", old: 1, new: 1 },
        { kind: "ctx", text: `  \"name\": \"${pkg.name}\",`, old: 2, new: 2 },
        { kind: "del", text: `  \"version\": \"${pkg.currentVersion}\",`, old: 3 },
        { kind: "add", text: `  \"version\": \"${scenarios.preview.nextVersion}\",`, new: 3 }
      ]
    }
    // Include every changed internal version reference, rather than imply that only the manifest version changes.
    if (original && next) {
      const before = original.split("\n")
      const after = next.split("\n")
      manifest.lines = [{ kind: "hunk", text: `@@ -1,${before.length} +1,${after.length} @@` }]
      before.forEach((line, index) => {
        if (line === after[index]) manifest.lines.push({ kind: "ctx", text: line, old: index + 1, new: index + 1 })
        else {
          manifest.lines.push({ kind: "del", text: line, old: index + 1 })
          manifest.lines.push({ kind: "add", text: after[index]!, new: index + 1 })
        }
      })
      manifest.additions = manifest.lines.filter(line => line.kind === "add").length
      manifest.deletions = manifest.lines.filter(line => line.kind === "del").length
    }
    const notes = [`## ${scenarios.preview.nextVersion}`, "", "### Patch Changes", "",
      ...(pkg.reason === "direct" ? plan.changesets.map(item => `- ${item.summary}`) : [`- Updated workspace dependencies to ${scenarios.preview.nextVersion}.`]), ""]
    return [manifest, {
      path: `${pkg.path}/CHANGELOG.md`, status: "modified", additions: notes.length, deletions: 0,
      lines: [{ kind: "hunk", text: `@@ -0,0 +1,${notes.length} @@` }, ...notes.map((text, i) => ({ kind: "add" as const, text, new: i + 1 }))]
    }]
  })
  const consumed: DiffFile[] = plan.changesets.map(changeset => {
    const lines = (file(changeset.path)?.content ?? `---\n\"effect\": patch\n---\n\n${changeset.summary}\n`).trimEnd().split("\n")
    return {
      path: changeset.path, status: "deleted", additions: 0, deletions: lines.length,
      lines: [{ kind: "hunk", text: `@@ -1,${lines.length} +0,0 @@` }, ...lines.map((text, i) => ({ kind: "del" as const, text, old: i + 1 }))]
    }
  })
  return [...packageFiles, ...consumed]
}

/** Runtime scenario registration lets the shared PR, diff, commit and branch views open the prepared change. */
export const hydrateVersionPull = (): Pull => {
  const existing = pull(versionPullNumber)
  if (existing) return existing
  const files = versionFiles()
  const item = { ...scenarios.pull, files } as Pull
  const commit = { ...scenarios.commit, files } as Commit
  pulls.push(item)
  if (!commits.some(value => value.sha === commit.sha)) commits.unshift(commit)
  if (!branches.some(value => value.name === item.head)) branches.push({
    name: item.head, head: commit.sha, author: item.author, updated: MOCK_NOW, ahead: 1, behind: 0, pull: item.n
  })
  const preparation = run(extras.releasePlan.preview.run)
  if (preparation) {
    preparation.state = "succeeded"
    preparation.pull = item.n
    preparation.finished = MOCK_NOW
    preparation.approvals = []
    preparation.stages = preparation.stages.map(stage => ({ ...stage, state: "succeeded",
      summary: stage.id === "prepare" ? `Opened version PR #${item.n}; awaiting a person's review.` : stage.id === "preview" ? `31 packages → ${scenarios.preview.nextVersion}.` : stage.summary,
      log: stage.id === "prepare" ? [`Opened ${item.head} → main as #${item.n}.`, "No packages published."] : stage.log
    }))
  }
  return item
}
