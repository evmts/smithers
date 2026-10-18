/**
 * Converter requests and results live in the transcript's durable collection.
 * Reload resumes the same server key; Chat stays available during compilation.
 * @since 0.1.0
 */
import { parseRepoSelection, conversationTabIdOf, inConversation } from "../AppState"
import { randomUuid } from "../../runtime/RandomUuid"
import type { ControllerContext } from "./context"
import { PromptRefusal } from "./sharedPrompts"

/** Input shared by the converter's person and agent doors.
 * @category models
 * @since 0.1.0
 */
export interface ConversionRequest {
  readonly source: string
  readonly idempotencyKey?: string
  readonly sourceLabel?: "hn" | "x" | "discord" | "telegram" | "share" | "direct" | "other"
}
/** Persist first, then observe the server's idempotent conversion.
 * @category constructors
 * @since 0.1.0
 */
export const createConversion = (ctx: ControllerContext) => {
  const active = new Set<string>()
  const aborts = new Set<AbortController>()
  const observe = () => {
    const selection = ctx.store.session().activeRepoKey
    const repoId = selection ? parseRepoSelection(selection)?.repoId : undefined
    for (const row of ctx.store.collections.messages.values()) {
      const input = row.conversion
      if (!inConversation(row, conversationTabIdOf(ctx.store.session())) || !input || input.repo !== repoId || input.result !== undefined || active.has(input.key)) continue
      active.add(input.key)
      const epoch = ctx.accountEpoch
      const current = () => !ctx.disposed && ctx.accountEpoch === epoch
      const base = `${ctx.baseUrl}/api/repos/${input.repo.split("/").map(encodeURIComponent).join("/")}/guest`
      void ctx.withToast(`convert-${input.key}`, "Convert", "Convert", async () => {
        const abort = new AbortController(); aborts.add(abort)
        const timer = setTimeout(() => abort.abort(), 75_000); ctx.unref(timer)
        try {
          const submit = () => ctx.http(`${base}/conversions`, { method: "POST", credentials: "same-origin", signal: abort.signal,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: input.source, idempotencyKey: input.key, sourceLabel: input.sourceLabel }) })
          let response = await submit()
          if (response.status === 429 && (await response.clone().json() as { refusal?: string }).refusal === "guest_session_required") {
            const boot = await ctx.http(base, { credentials: "same-origin", signal: abort.signal })
            if (!boot.ok) throw new Error("conversion_unavailable")
            response = await submit()
          }
          while (response.status === 202 && current()) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            response = await ctx.http(`${base}/conversions/${encodeURIComponent(input.key)}`, { credentials: "same-origin", signal: abort.signal })
          }
          const result: unknown = await response.json()
          if (!current()) return
          if (!result || typeof result !== "object" || !["compiled", "diagnostics", "refused", "failed"].includes(String((result as { state?: unknown }).state))) throw new Error("conversion_invalid")
          await ctx.store.dispatch({ type: "conversion.settled", actor: "system", id: row.id, result: JSON.stringify(result) }).isPersisted.promise
          if (!response.ok || ["failed", "refused"].includes(String((result as { state?: unknown }).state))) throw new PromptRefusal({ sentence: "Conversion failed." })
        } catch {
          // A lost transport response is not a terminal server receipt. Keep
          // the persisted key for reload/reconnect; never invent completion.
          throw new PromptRefusal({ sentence: "Conversion failed." })
        } finally { clearTimeout(timer); aborts.delete(abort); active.delete(input.key) }
      }, false, current).catch(error => ctx.failures.report("prompt.queue", error))
    }
  }
  let scheduled = false
  const schedule = () => {
    if (scheduled || ctx.disposed) return
    scheduled = true
    queueMicrotask(() => { void (async () => { await ctx.store.settled?.(); scheduled = false; if (!ctx.disposed) observe() })().catch(error => ctx.failures.report("prompt.queue", error)) })
  }
  const messages = ctx.store.collections.messages.subscribeChanges(schedule)
  const sessions = ctx.store.collections.sessions.subscribeChanges(schedule)
  ctx.onDispose(() => { messages.unsubscribe(); sessions.unsubscribe(); for (const abort of aborts) abort.abort() })
  schedule()
  return async (input: ConversionRequest): Promise<void> => {
    const selection = ctx.store.session().activeRepoKey
    const repo = selection ? parseRepoSelection(selection)?.repoId : undefined
    if (!repo) throw new PromptRefusal({ sentence: "Open a repository." })
    const key = input.idempotencyKey ?? randomUuid()
    if ([...ctx.store.collections.messages.values()].some(row => inConversation(row, conversationTabIdOf(ctx.store.session())) && row.conversion?.key === key && row.conversion.repo === repo)) return
    await ctx.store.dispatch({ type: "message.appended", actor: "user", text: "Convert", conversion: { repo, key, source: input.source, sourceLabel: input.sourceLabel ?? "direct" } }).isPersisted.promise
    schedule()
  }
}
