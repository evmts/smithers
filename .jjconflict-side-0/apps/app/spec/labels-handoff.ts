import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { resolve } from "node:path"

interface Offset { bytes: number; digest: string }
interface Pending { workspace: string; workspaceName: string; queueName: string; base: string; offsets: Record<string, Offset>; files: Record<string, string>; commit?: string }
interface State { tip?: string; offsets: Record<string, Offset>; pending?: Pending }
export interface HandoffOptions { repo: string; labels: string; queue: string; base?: string }
const digest = (text: string) => createHash("sha256").update(text).digest("hex")
const jj = (cwd: string, ...args: string[]) => execFileSync("jj", args, { cwd, encoding: "utf8", env: { ...process.env, RAYON_NUM_THREADS: "2" }, stdio: ["ignore", "pipe", "pipe"] }).trim()
const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(path, "utf8")) as T } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error }
}
/** Snapshot external labels into one isolated jj change and queue it; never push or land. */
export const labelsHandoff = async (options: HandoffOptions) => {
  const repo = resolve(options.repo); const labels = resolve(options.labels); const queue = resolve(options.queue)
  const stateDirectory = resolve(labels, ".handoff")
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
  const lock = resolve(stateDirectory, "lock")
  await mkdir(lock).catch(() => { throw new Error("Label handoff locked; check the previous process before removing .handoff/lock") })
  const stateFile = resolve(stateDirectory, "state.json")
  let state: State = { offsets: {} }
  const save = async () => { await writeFile(stateFile + ".tmp", JSON.stringify(state) + "\n", { mode: 0o600 }); await rename(stateFile + ".tmp", stateFile) }
  try {
    state = await readJson<State>(stateFile, { offsets: {} })
    if (!state.pending) {
      const files: Record<string, string> = {}; const offsets = { ...state.offsets }
      for await (const file of new Bun.Glob("*.jsonl").scan(labels)) {
        if (!/^[a-zA-Z0-9_-]+\.jsonl$/.test(file)) throw new Error("Invalid label filename")
        const text = await readFile(resolve(labels, file), "utf8")
        const previous = state.offsets[file]
        const bytes = Buffer.from(text)
        if (previous && (bytes.length < previous.bytes || digest(bytes.subarray(0, previous.bytes).toString()) !== previous.digest)) throw new Error(`Label history changed: ${file}`)
        const end = bytes.lastIndexOf(10) + 1
        const complete = bytes.subarray(0, end).toString()
        const added = bytes.subarray(previous?.bytes ?? 0, end).toString()
        for (const line of added.split("\n").filter(Boolean)) {
          const value = JSON.parse(line)
          if (!value || typeof value.journey !== "string" || !Number.isSafeInteger(value.step) || value.step < 0 || !["mock", "live"].includes(value.mode) || typeof value.revision !== "string" || !["up", "down"].includes(value.thumb) || !Array.isArray(value.assertions) || typeof value.by !== "string" || !Number.isFinite(Date.parse(value.at))) throw new Error(`Invalid label: ${file}`)
        }
        if (added) files[file] = added
        offsets[file] = { bytes: end, digest: digest(complete) }
      }
      if (!Object.keys(files).length) return { labels: 0 }
      const workspaceName = `spec-labels-${Date.now()}`
      const workspace = resolve(await mkdtemp(resolve(tmpdir(), "spec-labels-")), "workspace")
      let base = jj(repo, "log", "-r", options.base ?? "main@origin", "--no-graph", "-T", "commit_id")
      if (state.tip && jj(repo, "log", "-r", `${state.tip} ~ ancestors(${base})`, "--no-graph", "-T", "commit_id")) base = state.tip
      state.pending = { workspace, workspaceName, queueName: workspaceName + ".01-labels", base, offsets, files }
      await save()
      jj(repo, "workspace", "add", "--name", workspaceName, "--revision", base, workspace)
    }
    const pending = state.pending
    if (!await stat(resolve(pending.workspace, ".jj")).then(() => true, () => false)) {
      jj(repo, "workspace", "add", "--name", pending.workspaceName, "--revision", pending.base, pending.workspace)
    }
    if (!pending.commit) {
      // A restart after commit but before save finds the named commit below @.
      const parentDescription = jj(pending.workspace, "log", "-r", "@-", "--no-graph", "-T", "description")
      if (parentDescription.includes(`Handoff-ID: ${pending.workspaceName}`)) pending.commit = jj(pending.workspace, "log", "-r", "@-", "--no-graph", "-T", "commit_id")
      else {
        const destination = resolve(pending.workspace, "apps/app/spec/labels")
        await mkdir(destination, { recursive: true })
        for (const [file, text] of Object.entries(pending.files)) {
          let existing = ""
          try { existing = execFileSync("jj", ["file", "show", "-r", "@-", `apps/app/spec/labels/${file}`], { cwd: pending.workspace, encoding: "utf8", env: { ...process.env, RAYON_NUM_THREADS: "2" }, stdio: ["ignore", "pipe", "pipe"] }) } catch (error) { if (!String((error as { stderr?: unknown }).stderr).includes("No such path")) throw error }
          await writeFile(resolve(destination, file), existing + text, { mode: 0o600 })
        }
        const message = `🏷️ chore(spec): hand off owner labels\n\nPeople's new spec thumbs are ready for calibration. Refs #4267\n\nHandoff-ID: ${pending.workspaceName}\n\nCo-Authored-By: Codex GPT-6.1 Sol <noreply@openai.com>`
        jj(pending.workspace, "commit", "-m", message)
        pending.commit = jj(pending.workspace, "log", "-r", "@-", "--no-graph", "-T", "commit_id")
      }
      await save()
    }
    const commit = pending.commit
    const directory = resolve(queue, pending.queueName); await mkdir(directory, { recursive: true })
    const dependencies: string[] = []
    for await (const file of new Bun.Glob("*/commit.txt").scan(queue)) {
      const sha = (await readFile(resolve(queue, file), "utf8")).trim().split(/\s+/)[1]
      if (sha && /^[a-f0-9]{40}$/.test(sha) && jj(repo, "log", "-r", `present(${sha}) & ancestors(${commit}-)`, "--no-graph", "-T", "commit_id")) dependencies.push(file.split("/")[0]!)
    }
    const artifacts = {
      "change.patch": execFileSync("jj", ["diff", "--git", "-r", commit], { cwd: repo, encoding: "utf8", env: { ...process.env, RAYON_NUM_THREADS: "2" } }),
      "base.txt": jj(repo, "log", "-r", commit + "-", "--no-graph", "-T", "commit_id") + "\n",
      "commit.txt": jj(repo, "log", "-r", commit, "--no-graph", "-T", 'change_id ++ " " ++ commit_id') + "\n",
      "message.txt": jj(repo, "log", "-r", commit, "--no-graph", "-T", "description") + "\n",
      "test.txt": "cd apps/app && bun test --isolate spec/labels-handoff.test.ts\n",
      "HOLD.txt": `HOLD: land after the launch tag (Monday 2026-10-19). Depends on: ${dependencies.join(", ") || "none"}\n`
    }
    for (const [name, text] of Object.entries(artifacts)) await writeFile(resolve(directory, name), text)
    jj(repo, "bookmark", "set", `landing-queue/${pending.queueName}`, "-r", commit)
    state.offsets = pending.offsets; state.tip = commit; delete state.pending; await save()
    jj(repo, "workspace", "forget", pending.workspaceName)
    await rm(resolve(pending.workspace, ".."), { recursive: true, force: true })
    return { commit, directory, labels: Object.values(pending.files).reduce((sum, text) => sum + text.split("\n").filter(Boolean).length, 0) }
  } finally { await rm(lock, { recursive: true, force: true }) }
}
if (import.meta.main) {
  const args = process.argv.slice(2)
  const option = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1]! : fallback
  labelsHandoff({ repo: option("--repo", resolve(import.meta.dirname, "../../..")), labels: option("--labels", process.env.SPEC_LABELS_DIR ?? resolve(homedir(), "smithers-spec/labels")), queue: option("--queue", resolve(homedir(), "smithers-lanes/landing-queue")), base: option("--base", "main@origin") }).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error); process.exitCode = 1 })
}
