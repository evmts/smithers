import { parseRepoSelection } from "../AppState"
import { identityProviderFor } from "../IdentityProvider"
import { randomUuid } from "../../runtime/RandomUuid"
import type { ControllerContext } from "./context"
import { PromptRefusal } from "./sharedPrompts"

/** Guest discovery never grants a member role or a general model credential. */
export const guestRepository = (ctx: Pick<ControllerContext, "store">) => {
  const key = ctx.store.session().activeRepoKey
  const id = key ? parseRepoSelection(key)?.repoId : undefined
  const repo = id ? ctx.store.collections.repositories.get(id) : undefined
  return repo?.guest && ctx.store.collections.identitySessions.get("identity")?.state === "signed-out" ? repo : undefined
}

/** One action behind the composer, slash and agent doors; all work stays in
 * the server's fixed, tool-free flow. The browser only projects text. */
export const createGuestChat = (ctx: ControllerContext) => {
  let pending = false
  const aborts = new Set<AbortController>()
  ctx.onDispose(() => { for (const abort of aborts) abort.abort(); aborts.clear() })
  const submit = async (text: string, draftCurrent?: () => boolean): Promise<boolean> => {
    const repo = guestRepository(ctx)
    if (repo === undefined || pending || ctx.store.session().phase !== "idle" || !text.trim()) return false
    pending = true
    const epoch = ctx.accountEpoch
    const turnId = randomUuid(), landing = repo.guest!.landingId
    const current = () => !ctx.disposed && ctx.accountEpoch === epoch
    const draft=ctx.store.session().draft
    const preserveDraft=draftCurrent?.() === false || (draft !== "" && draft.trim() !== text.trim())
    const persist = ctx.store.dispatch({ type: "message.submitted", actor: "user", turnId, text: text.trim(), preserveDraft }).isPersisted.promise
    try { await persist } catch (error) { pending = false; throw error }
    const abort = new AbortController(); aborts.add(abort)
    const timer = setTimeout(() => abort.abort(), 45_000); ctx.unref(timer)
    void ctx.withToast(`guest-${turnId}`, "Chat", "Chat", async () => {
      try {
        if (!current()) return
        const path = `${ctx.baseUrl}/api/repos/${repo.id.split("/").map(encodeURIComponent).join("/")}/guest/chat`
        const response = await ctx.http(path, { method: "POST", credentials: "same-origin", signal: abort.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text.trim(), idempotencyKey: turnId, landingId: landing }) })
        if (!current()) return
        if (!response.ok) {
          throw new PromptRefusal({ sentence:"Sign in to continue." })
        }
        if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("guest_stream_unavailable")
        const reader = response.body.getReader(), decoder = new TextDecoder()
        let buffer = "", bytes = 0, done = false
        try {
          while (current()) {
            const chunk = await reader.read()
            if (chunk.done) break
            bytes += chunk.value.length
            if (bytes > 1024 * 1024) throw new Error("guest_stream_limit")
            buffer += decoder.decode(chunk.value, { stream: true })
            let newline: number
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline).trimEnd(); buffer = buffer.slice(newline + 1)
              if (!line.startsWith("data:")) continue
              const data = line.slice(5).trim()
              if (data === "[DONE]") { done = true; continue }
              if (!data) continue
              const frame: unknown = JSON.parse(data)
              const content = (frame as { choices?: ReadonlyArray<{ delta?: { content?: unknown } }> })?.choices?.[0]?.delta?.content
              if (typeof content === "string" && current()) await ctx.store.dispatch({ type: "message.response.delta", actor: "smithers", turnId, channel: "text", delta: content }).isPersisted.promise
            }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
        if (!done) throw new Error("guest_stream_incomplete")
        if (current()) await ctx.store.dispatch({ type: "message.response.completed", actor: "smithers", turnId }).isPersisted.promise
      } catch {
        if (current()) {
          await ctx.store.dispatch({ type: "chat.sign-in.required", actor: "system", turnId, failed:true, provider: identityProviderFor(ctx.services), draft: text }).isPersisted.promise
        }
        throw new PromptRefusal({ sentence:"Sign in to continue." })
      } finally { clearTimeout(timer); aborts.delete(abort); pending = false }
    }, false, current).catch(error => ctx.failures.report("prompt.queue", error))
    return true
  }
  return { submit, stop: () => { for (const abort of aborts) abort.abort() } }
}
