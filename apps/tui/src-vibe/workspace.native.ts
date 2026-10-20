// E-7 (EK4402): the platform calls workspace.vibe makes: process.env, queueMicrotask, setTimeout,
// node:fs and node:crypto. One call each.
// E-5 (D38): the async bodies that hand Promises to TypeScript callers stay TypeScript. Each is
// workspace.ts's own async code, unchanged except that its `this.x` reads are parameters.
import * as SmithersPlugin from "@smthrs/agent/SmithersPlugin"
import { randomUUID as nodeRandomUUID } from "node:crypto"
import { existsSync as nodeExistsSync, readFileSync, writeFileSync } from "node:fs"
import type * as Agents from "./agents.vibe"
import type * as Asks from "./asks.ts"
import * as Context from "./context.ts"
import type * as Extension from "./extension.vibe"
import * as Failures from "./failures.ts"
import type * as Flows from "./flows.vibe"
import type * as Host from "./host.vibe"
import type * as Lifecycle from "./lifecycle.ts"
import type * as Session from "./session.vibe"
import * as Transcript from "./transcript.ts"
import * as Wrapped from "./wrapped.ts"
import type { Tab } from "./workspace.vibe"

/** `process.env.SMITHERS_TUI_WORKERS`. */
export const workers = (): string | undefined => process.env.SMITHERS_TUI_WORKERS
/** `queueMicrotask(task)`. */
export const microtask = (task: () => void): void => queueMicrotask(task)
/** `setTimeout(task, ms)`. */
export const later = (task: () => void, ms: number): void => {
  setTimeout(task, ms)
}
/** `randomUUID()` from node:crypto. */
export const randomUUID = (): string => nodeRandomUUID()
/** `existsSync(path)` from node:fs. */
export const existsSync = (path: string): boolean => nodeExistsSync(path)
/** What an async method that returned before its first await gives its caller. */
export const resolved = (): Promise<void> => Promise.resolve()

/** `(async () => then(await start()))()`: an async arrow that awaits one call. */
export const andThen = async <A, B>(start: () => PromiseLike<A>, then: (value: A) => B): Promise<B> =>
  then(await start())

/** `prepare`'s await: the agent's body read and profile, then the catch or the rest of the method. */
export const prepare = async (
  load: () => Promise<{ readonly descriptor: Extension.Descriptor; readonly body: Flows.Body }>,
  profileOf: (loaded: { readonly descriptor: Extension.Descriptor; readonly body: Flows.Body }) => Agents.Profile,
  failed: (error: unknown) => void,
  ready: (profile: Agents.Profile) => void
): Promise<void> => {
  let profile: Agents.Profile
  try {
    profile = profileOf(await load())
  } catch (error) {
    failed(error)
    return
  }
  ready(profile)
}

/** `describe`'s await: the generated description replaces the title's; a failure is logged. */
export const describe = async (
  generate: () => Promise<string> | undefined,
  description: string,
  logged: (error: unknown) => void,
  settle: (description: string) => void
): Promise<void> => {
  try {
    const generated = await generate()
    description = generated?.replace(/\s+/g, " ").trim().slice(0, 80) || description
  } catch (error) {
    logged(error)
  }
  settle(description)
}

/** A promise and its settlers (workspace.vibe's `Deferred`). */
interface Deferred<A> {
  readonly promise: Promise<A>
  readonly resolve: (value: A) => void
  readonly reject: (error: Error) => void
  readonly settled: () => boolean
}
/** A wrapped worker the person took over. */
interface Handover {
  readonly ready: Deferred<string>
  readonly back: Deferred<void>
  withdrawn?: true
}

/** A worker's `ask`: workspace.ts `ask`, its seat free while it waits. */
export const ask = async (
  tabs: Pick<Lifecycle.Pool<Tab, unknown>, "get" | "move">,
  asks: Asks.Asks,
  seated: (id: string, signal?: AbortSignal) => Promise<void>,
  id: string,
  input: Asks.Input,
  signal?: AbortSignal
): Promise<{ readonly answer: string; readonly approved: boolean }> => {
  const asker = tabs.get(id)
  if (asker === undefined) throw new Error("Unknown tab")
  const blocked = asker.status === "running"
  if (blocked) tabs.move(asker, "block")
  try {
    return { answer: await asks.ask(asker, input, signal), approved: true }
  } finally {
    if (blocked) await seated(id, signal)
  }
}

/** workspace.ts `handedOver`: the vendor's own TUI once the headless run stopped. */
export const handedOver = async (
  handovers: Map<string, Handover>,
  tabs: Pick<Lifecycle.Pool<Tab, unknown>, "get">,
  host: Host.Host,
  id: string
): Promise<{ readonly command: string; readonly args: ReadonlyArray<string> }> => {
  const handover = handovers.get(id)
  if (handover === undefined) throw new Error(`${id} is not taken over`)
  const brief = await handover.ready.promise
  const tab = tabs.get(id)
  if (tab?.harness?.session === undefined) throw new Error(`${id} has no session to resume`)
  return Wrapped.interactive(
    tab.harness.vendor,
    tab.harness.session,
    host.cwd,
    brief,
    host.approvals?.mode ?? "all"
  )
}

/** The workspace state a wrapped worker's run reads and writes. */
export interface WrappedState {
  readonly tabs: Pick<Lifecycle.Pool<Tab, unknown>, "get" | "put">
  readonly host: Host.Host
  readonly transcripts: Map<string, Transcript.Transcript>
  readonly transcript: (id: string) => Transcript.Transcript
  readonly changed: () => void
  readonly announced: Map<string, string>
  readonly vendorRuns: Map<string, Wrapped.Handle>
  readonly handovers: Map<string, Handover>
  readonly ended: (tab: Tab, at: number) => Tab
}

/**
 * A wrapped worker's run: its memory and brief first, then the vendor headless on one session.
 * A take-over stops it (Claude Code at once, Codex once its turn completes, the 0.x rule), hands
 * the terminal over, and once released runs it on headless on the same session and brief.
 */
export const runWrapped = (self: WrappedState, tab: Tab, writer: Session.Writer): Host.Turn => {
  const vendor = tab.harness!.vendor
  // A retried or restarted worker has a new file; nothing from an older run writes into it.
  const own = () =>
    self.tabs.get(tab.id)?.file === writer.file && self.tabs.get(tab.id)?.continuationId === tab.continuationId
  const note = (text: string) => {
    if (!own()) return
    const at = Date.now()
    writer.append({ type: "note", at, text })
    self.transcripts.set(tab.id, Transcript.note(self.transcript(tab.id), text, at))
    self.changed()
  }
  let cancelled = false
  let current: Wrapped.Handle | undefined
  const body = async (): Promise<Host.Outcome> => {
    // A take-over does not survive a restart: the vendor's own TUI went with the process.
    const restored = self.tabs.get(tab.id)
    if (restored?.driver !== undefined) self.tabs.put(self.ended(restored, Date.now()))
    let resume = tab.harness!.session !== undefined
    let prompt = tab.harness!.prompt ?? (resume ? Wrapped.continuePrompt : tab.prompt)
    const accepted = () => {
      if (!own()) return
      prompt = Wrapped.continuePrompt
      const launched = self.tabs.get(tab.id)!
      if (launched.harness?.prompt !== undefined) {
        const { prompt: _delivered, ...harness } = launched.harness
        self.tabs.put({ ...launched, harness })
      }
    }
    const file = tab.harness!.brief ?? `${tab.file}.brief.md`
    let brief: string
    if (nodeExistsSync(file)) brief = readFileSync(file, "utf8")
    else {
      const memory = self.host.memory
      const recalled = memory === undefined ? undefined : await memory(tab.prompt).catch((error: unknown) => {
        note(`→ ${Failures.line("memory", error)}`)
        return undefined
      })
      note(
        memory === undefined
          ? "→ memory unavailable"
          : recalled === undefined
          ? "→ memory none"
          : `→ memory ${recalled.kept} in · ${recalled.withheld} withheld`
      )
      // The brief is frozen for the session: every launch on it passes these bytes, so the prefix caches.
      brief = [SmithersPlugin.brief, Context.vcsRule(self.host.cwd), recalled?.text ?? ""].filter((part) =>
        part !== ""
      ).join("\n\n")
      writeFileSync(file, brief, { mode: 0o600 })
    }
    const now = self.tabs.get(tab.id)
    if (now !== undefined && now.harness?.brief !== file) {
      self.tabs.put({ ...now, harness: { ...now.harness!, brief: file } })
    }
    // Claude Code takes the id we choose; it is recorded once the vendor reports it started.
    const chosen = tab.harness!.session ?? (vendor === "claude" ? nodeRandomUUID() : undefined)
    // The vendor repeats a call's usage on each of its blocks: count each call once.
    const counted = new Set<string>()
    {
      for (;;) {
        if (cancelled) return { _tag: "cancelled" }
        const session = self.tabs.get(tab.id)?.harness?.session ?? chosen
        const handle = Wrapped.run({
          vendor,
          prompt,
          cwd: self.host.cwd,
          brief,
          ...(session === undefined ? {} : { session }),
          resume,
          approve: self.host.approvals?.mode ?? "all"
        }, (folded) => {
          if (!own()) return
          if (folded.error === undefined && (folded.settled === true || folded.answer !== undefined)) accepted()
          if (folded.announce !== undefined) self.announced.set(tab.id, folded.announce)
          const at = self.tabs.get(tab.id)!
          if (folded.session !== undefined && at.harness?.session !== folded.session) {
            self.tabs.put({ ...at, harness: { ...at.harness!, session: folded.session } })
          }
          for (const row of folded.rows) note(`${row.glyph} ${row.text}`)
          const usage = folded.usage
          if (usage !== undefined && (usage.call === undefined || !counted.has(usage.call))) {
            if (usage.call !== undefined) counted.add(usage.call)
            const transcript = self.transcript(tab.id)
            self.transcripts.set(tab.id, {
              ...transcript,
              usage: {
                input: transcript.usage.input + usage.input,
                output: transcript.usage.output + usage.output,
                cached: transcript.usage.cached + usage.cached,
                context: usage.input,
                usd: transcript.usage.usd + (usage.usd ?? 0)
              }
            })
            self.changed()
          }
        })
        current = handle
        self.vendorRuns.set(tab.id, handle)
        const outcome = await handle.done
        if (outcome._tag === "done") accepted()
        self.vendorRuns.delete(tab.id)
        const handover = self.handovers.get(tab.id)
        if (handover?.withdrawn === true && !cancelled) {
          // Released before the terminal was handed over: the run just goes on.
          self.handovers.delete(tab.id)
          if (outcome._tag === "stopped") {
            resume = true
            continue
          }
        } else if (handover !== undefined && !cancelled && outcome._tag !== "failed") {
          handover.ready.resolve(brief)
          await handover.back.promise
          self.handovers.delete(tab.id)
          resume = true
          continue
        }
        return outcome._tag === "done"
          ? { _tag: "done", answer: outcome.answer }
          : outcome._tag === "failed"
          ? { _tag: "failed", message: outcome.message, detail: "" }
          : { _tag: "cancelled" }
      }
    }
  }
  const done = (async (): Promise<Host.Outcome> => {
    try {
      return await body()
    } finally {
      // Whatever ended the run, a take-over waiting on it hears so and is gone.
      self.handovers.get(tab.id)?.ready.reject(new Error(`${tab.title} stopped before it was handed over`))
      self.handovers.delete(tab.id)
      self.vendorRuns.delete(tab.id)
      self.announced.delete(tab.id)
    }
  })()
  return {
    done,
    cancel: () => {
      cancelled = true
      current?.stop()
      self.handovers.get(tab.id)?.back.resolve()
    }
  }
}
