import { refusalLine } from "@smthrs/rpc/RefusalCopy"
import { z } from "zod"
import { createCloudClient } from "./CloudClient"
import { captureCloudOwner, type SeamContext } from "./SeamContext"
import { actorSharedState } from "../ActorBindings"
import { accountOwnerOf } from "../AccountOwner"
import { resolveTargetRepo } from "../RepoContext"
import { randomUuid } from "../../runtime/RandomUuid"
import { TOAST_SUPERSEDED } from "../controller/failures"
import {
  CodingResultSchema,
  HostedSessionSchema,
  HostedPullSchema,
  HostedFilesSchema,
  HostedDiffSchema,
  hostedDiffText
} from "./HostedChangeSchema"
import {
  BOX_BUSY_REASON,
  observeStages,
  hostedSessionPhase,
  hostedFailureReason,
  landingRefusal,
  type HostedObservation
} from "./HostedChange"

export interface HostedChangeScheduler {
  schedule: (delay: number, callback: () => void) => () => void
  now?: () => number
}
const scheduler: HostedChangeScheduler = {
  schedule: (delay, callback) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer) }
}
// Automatic retries cover the start cap, which clears in seconds. A box_busy that ends a queue wait (the
// 20-minute queue bound) or a long attempt means sustained saturation: the person decides with Try again (8e f-85pitc).
export const BOX_BUSY_RETRY_WINDOW_MS = 60_000
export const hostedChangePolling = { delayMs: 2000, maxAttempts: 900 }
const repoPath = (repo: string) => `/repos/${repo.split("/").map(encodeURIComponent).join("/")}`
const messageSchema = z.object({
  role: z.string(),
  sequence: z.number().int().optional(),
  created_at: z.string().optional(),
  parts: z
    .array(
      z
        .object({
          part_type: z.string().optional(),
          type: z.string().optional(),
          content: z.unknown().optional(),
          data: z.unknown().optional()
        })
        .passthrough()
    )
    .optional()
})
const messagesSchema = z.union([z.array(messageSchema), z.object({ messages: z.array(messageSchema) })])
const lastReplyOf = (messages: unknown) => {
  const parsed = messagesSchema.safeParse(messages)
  if (!parsed.success) return null
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.messages
  return [...rows].reverse().find((message) => message.role === "assistant") ?? null
}
export const codingActivityOf = (messages: unknown): string | undefined => {
  for (const part of lastReplyOf(messages)?.parts ?? []) {
    if (part.type !== "text") continue
    const text = z.object({ value: z.string() }).safeParse(part.content)
    if (text.success && text.data.value.trim()) return text.data.value
  }
  return undefined
}
export const codingResultOf = (messages: unknown) => {
  const message = lastReplyOf(messages)
  if (!message) return null
  const parts = message.parts ?? []
  for (const part of [...parts].reverse()) {
    const row = part as Record<string, unknown>
    if (row.part_type !== "coding_result" && row.type !== "coding_result") continue
    let body = row.content ?? row.data ?? row
    if (typeof body === "string") {
      try {
        body = JSON.parse(body)
      } catch {
        continue
      }
    }
    const value = CodingResultSchema.safeParse(body)
    if (value.success) return value.data
  }
  return null
}
export const createHostedChangeSeam = (ctx: SeamContext, clock: HostedChangeScheduler = scheduler) => {
  const client = createCloudClient(ctx, { retainFailurePayload: true })
  const flights = actorSharedState(ctx, "hosted-change-flights", () => new Map<string, Promise<unknown>>())
  const cycles = actorSharedState(ctx, "hosted-change-cycles", () => new Map<string, AbortController>())
  const retired = actorSharedState(ctx, "hosted-change-retired-retries", () => new WeakSet<AbortController>())
  const mounted = actorSharedState(ctx, "hosted-change-mounted", () => new Set<string>())
  const cancelHostedRetries = (all = false) => {
    for (const [id, cycle] of cycles) {
      retired.add(cycle)
      // An unrelated prompt must not interrupt observation of an ordinary run.
      if (all || read(id)?.busyWaiting) cycle.abort()
    }
  }
  const watchHostedChange = (cardId: string) => {
    const id = cardId.replace(/^hosted-change-/, "")
    mounted.add(id)
    const row = read(id)
    if (row?.phase === "running" && row.accepted && !flights.has(id)) background(row, false, Promise.resolve())
    return () => {
      mounted.delete(id)
      // React can detach and attach the same ref in one commit (including StrictMode).
      queueMicrotask(() => { if (!mounted.has(id)) cycles.get(id)?.abort() })
    }
  }
  const wait = (delay: number, signal: AbortSignal) => new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return }
    const finish = () => { cancel(); signal.removeEventListener("abort", finish); resolve() }
    const cancel = clock.schedule(delay, finish)
    signal.addEventListener("abort", finish, { once: true })
  })
  const owner = () => accountOwnerOf(ctx.store.collections.identitySessions.get("identity")) ?? null
  const rows = () => ctx.store.session().hostedChanges ?? []
  const read = (id: string) => rows().find((row) => row.id === id)
  const save = (row: HostedObservation) =>
    ctx.dispatch({
      type: "hosted.changes.changed",
      actor: ctx.actor(),
      requests: [...rows().filter((item) => item.id !== row.id), row]
    }).isPersisted.promise
  const patch = async (id: string, values: Partial<HostedObservation>) => {
    const row = read(id)
    if (row) await save({ ...row, ...(values.phase === "failed" && values.busyRetries === undefined ? { busyWaiting: false, busyRetries: undefined } : {}), ...values })
  }
  const card = async (row: HostedObservation) => {
    const id = `hosted-change-${row.id}`
    const prior = ctx.store.collections.cards.get(id)
    await ctx.dispatch({
      type: "card.upsert",
      actor: ctx.actor(),
      card: {
        id,
        kind: "hosted-change",
        title: row.request,
        status: "active",
        createdAt: prior?.createdAt ?? Date.now(),
        ordinal: prior?.ordinal ?? ctx.nextOrdinal(),
        payload: { repo: row.repo, sessionId: row.sessionId ?? row.id, request: row.request }
      }
    }).isPersisted.promise
  }
  const follow = async (id: string, current: () => boolean, signal: AbortSignal, queued: () => void): Promise<string | typeof TOAST_SUPERSEDED | void> => {
    for (let attempt = 0; attempt < hostedChangePolling.maxAttempts && current(); attempt++) {
      const row = read(id)
      if (!row?.sessionId) return
      const base = `${repoPath(row.repo)}/agent/sessions/${encodeURIComponent(row.sessionId)}`
      const answer = await client.get(base)
      if (!current()) return TOAST_SUPERSEDED
      if ("error" in answer) {
        await patch(id, { phase: "failed", error: answer.error })
        return answer.error
      }
      const parsed = HostedSessionSchema.safeParse(answer.body)
      if (!parsed.success) {
        const error = "The agent run could not be read."
        await patch(id, { phase: "failed", error })
        return error
      }
      const session = parsed.data
      if (session.status === "failed" && session.reason_code === "box_busy" && session.retryable) {
        await patch(id, { session, error: null })
        return "box_busy"
      }
      // ListMessages is oldest-first; cursorToPage requires offsets divisible by limit.
      const limit = 100
      let cursor = Math.floor(Math.max(0, (session.message_count ?? 1) - 1) / limit) * limit
      const messages: z.infer<typeof messageSchema>[] = []
      while (current()) {
        const page = await client.get(`${base}/messages?limit=${limit}&cursor=${cursor}`)
        if (!current()) return TOAST_SUPERSEDED
        if ("error" in page) {
          await patch(id, { phase: "failed", error: page.error })
          return page.error
        }
        const parsedPage = messagesSchema.safeParse(page.body)
        if (!parsedPage.success) {
          const error = "The agent replies could not be read."
          await patch(id, { phase: "failed", error })
          return error
        }
        const rows = Array.isArray(parsedPage.data) ? parsedPage.data : parsedPage.data.messages
        messages.push(...rows)
        const lastSequence = Math.max(0, ...rows.map((message) => message.sequence ?? 0))
        if (!rows.length || (rows.length < limit && (!lastSequence || lastSequence >= (session.message_count ?? 0))))
          break
        cursor += limit
      }
      if (!current()) return TOAST_SUPERSEDED
      const result = codingResultOf(messages)
      const activity =
        session.run?.status === "running" && !result ? (codingActivityOf(messages) ?? row.activity) : row.activity
      const phase = hostedSessionPhase(session, result)
      const failed = phase === "failed"
      const done = phase === "done"
      const stages = observeStages(row.stages, session, row.accepted, result, row.pull, Date.now())
      await patch(id, {
        session,
        busyWaiting: false,
        ...(failed ? { busyRetries: undefined } : {}),
        observedAt: Date.now(),
        activity,
        outcome: done ? codingActivityOf(messages) : row.outcome,
        noChange: done && (!result?.head_commit || (typeof session.base_commit === "string" && result.head_commit === session.base_commit)),
        result,
        stages,
        // Publish completion only after the files/diff have settled: the ready card
        // must enter the transcript at its final height.
        phase: failed ? "failed" : "running",
        error: failed ? hostedFailureReason(session) : null
      })
      queued()
      if (failed) return hostedFailureReason(session)
      if (done) {
        if (result?.head_change_id) {
          const [files, diff] = await Promise.all([
            client.get(`${repoPath(row.repo)}/changes/${encodeURIComponent(result.head_change_id)}/files`),
            client.get(`${repoPath(row.repo)}/changes/${encodeURIComponent(result.head_change_id)}/diff`)
          ])
          if (!current()) return TOAST_SUPERSEDED
          if ("body" in files) {
            const body = files.body as { files?: unknown }
            const parsedFiles = HostedFilesSchema.safeParse(Array.isArray(body) ? body : body?.files)
            if (parsedFiles.success) {
              const measured = "body" in diff ? HostedDiffSchema.safeParse(diff.body) : null
              const diffs =
                measured?.success && typeof measured.data !== "string" ? measured.data.file_diffs : undefined
              await patch(id, {
                noChange: parsedFiles.data.length === 0 || read(id)?.noChange === true,
                filesRead: true,
                files: parsedFiles.data.map((file) => {
                  const counts = diffs?.find((item) => item.path === file.path)
                  return {
                    ...file,
                    ...(counts?.additions === undefined ? {} : { additions: counts.additions }),
                    ...(counts?.deletions === undefined ? {} : { deletions: counts.deletions })
                  }
                }),
                ...(measured?.success ? { diff: hostedDiffText(measured.data) } : {})
              })
            } else await patch(id, { filesError: "The changed files could not be read." })
          } else await patch(id, { filesError: files.error })
        }
        await patch(id, { phase: "done" })
        return
      }
      await wait(hostedChangePolling.delayMs, signal)
    }
    return current() ? "The agent run is still running. Reload to reconnect." : TOAST_SUPERSEDED
  }
  const background = (row: HostedObservation, launch: boolean, persisted: Promise<unknown>) => {
    if (flights.has(row.id)) return
    const owned = captureCloudOwner(ctx, false)
    const cycle = new AbortController()
    cycles.set(row.id, cycle)
    const selection = ctx.store.session().activeRepoKey
    const subscription = ctx.store.collections.sessions.subscribeChanges(changes => {
      if (changes.some(change => change.value.id === "main" && change.value.activeRepoKey !== selection)) cycle.abort()
    })
    let following = true
    const current = () => following && !cycle.signal.aborted && owned() && read(row.id)?.owner === owner()
    let stopQueueClock: (() => void) | undefined
    const now = clock.now ?? Date.now
    let attemptStart = row.stages.Admitted ?? now()
    let sawQueue = false
    const queued = () => {
      stopQueueClock?.()
      stopQueueClock = undefined
      if (read(row.id)?.session?.stage === "queued") sawQueue = true
      if (current() && read(row.id)?.phase === "running" && read(row.id)?.session?.stage === "queued") {
        stopQueueClock = clock.schedule(1000, () => {
          if (!current()) return
          void patch(row.id, { observedAt: Date.now() }).then(queued)
        })
      }
    }
    const work = async () => {
      await persisted
      if (!current()) return TOAST_SUPERSEDED
      await card(row)
      if (!current()) return TOAST_SUPERSEDED
      let shouldLaunch = launch
      let retries = row.busyRetries ?? 0
      while (current()) {
        if (shouldLaunch) {
          attemptStart = now()
          sawQueue = false
          const created = await client.send("POST", `${repoPath(row.repo)}/agent/sessions`, { title: row.request })
          if (!current()) return TOAST_SUPERSEDED
          if ("error" in created) {
            if (created.code === "box_busy" && created.status === 503) {
              const busy = z.object({ reason: z.string().trim().min(1).max(500).optional(), message: z.string().trim().min(1).max(500).optional() }).safeParse(created.payload)
              const reason = busy.success ? busy.data.reason ?? busy.data.message ?? BOX_BUSY_REASON : BOX_BUSY_REASON
              if (await retryBusy(reason)) { shouldLaunch = true; continue }
              return cycle.signal.aborted ? TOAST_SUPERSEDED : reason
            }
            await patch(row.id, { phase: "failed", busyWaiting: false, busyRetries: undefined, error: created.error })
            return created.error
          }
          const session = z.object({ id: z.string() }).safeParse(created.body)
          if (!session.success) {
            const error = "The agent run could not be started."
            await patch(row.id, { phase: "failed", error })
            return error
          }
          await patch(row.id, { sessionId: session.data.id, phase: "running", stages: { ...row.stages, Admitted: Date.now() } })
          await card({ ...row, sessionId: session.data.id })
        }
        const latest = read(row.id)!
        if (!latest.accepted) {
          // Only this live launch posts the message. Reload recovery never repeats an unacknowledged write.
          const posted = await client.send(
            "POST",
            `${repoPath(row.repo)}/agent/sessions/${encodeURIComponent(latest.sessionId!)}/messages`,
            { role: "user", text: row.request }
          )
          if (!current()) return TOAST_SUPERSEDED
          if ("error" in posted) {
            await patch(row.id, { phase: "failed", error: posted.error })
            return posted.error
          }
          await patch(row.id, {
            accepted: true,
            phase: "running",
            stages: observeStages(latest.stages, null, true, null, null, Date.now())
          })
        }
        const outcome = await follow(row.id, current, cycle.signal, queued)
        if (outcome !== "box_busy") return outcome
        if (sawQueue || now() - attemptStart > BOX_BUSY_RETRY_WINDOW_MS) retries = 4
        if (!(await retryBusy())) return cycle.signal.aborted ? TOAST_SUPERSEDED : read(row.id)?.session?.reason ?? BOX_BUSY_REASON
        shouldLaunch = true
      }
      return TOAST_SUPERSEDED

      async function retryBusy(reason = read(row.id)?.session?.reason ?? BOX_BUSY_REASON) {
        stopQueueClock?.()
        if (retries === 4 || retired.has(cycle)) {
          await patch(row.id, { phase: "failed", busyWaiting: false, busyRetries: retries, error: reason })
          return false
        }
        // The backoff starts as the waiting state shows; a slow write must not delay it.
        await Promise.all([
          patch(row.id, { phase: "running", busyWaiting: true, busyRetries: retries,
            sessionId: null, accepted: false, result: null, session: null, error: null, stages: {} }),
          wait(2000 * 2 ** retries, cycle.signal)
        ])
        if (!current()) return false
        retries++
        return true
      }
    }
    const pending = (
      ctx.withToast
        ? ctx.withToast(`change.${row.id}`, "Starting agent…", "Agent finished", work, false, current)
        : work()
    )
      .catch(async (error) => {
        ctx.report?.("Hosted change", error)
        if (current()) await patch(row.id, { error: "The agent run could not be followed. Reload to reconnect." })
      })
      .finally(() => {
        following = false
        stopQueueClock?.()
        subscription.unsubscribe()
        cycles.delete(row.id)
        flights.delete(row.id)
        if (cycle.signal.aborted && read(row.id)?.busyWaiting) void patch(row.id, {
          phase: "failed", busyWaiting: false, busyRetries: read(row.id)?.busyRetries, error: BOX_BUSY_REASON
        })
        else if (cycle.signal.aborted && mounted.has(row.id) && owned() && ctx.store.session().activeRepoKey === selection) {
          const latest = read(row.id)
          if (latest?.phase === "running" && latest.accepted) background(latest, false, Promise.resolve())
        }
      })
    flights.set(row.id, pending)
  }
  const askHostedChange = async (input: { repo?: string; request: string }): Promise<string | void> => {
    const target = resolveTargetRepo(ctx.store, input.repo)
    if ("error" in target) return target.error
    if (!owner()) {
      ctx.promptSignIn?.("Sign in to start an agent.")
      return
    }
    if (
      rows().some(
        (row) =>
          row.owner === owner() &&
          row.repo === target.repo &&
          row.request === input.request &&
          ["starting", "running"].includes(row.phase)
      )
    )
      return
    cancelHostedRetries()
    const row: HostedObservation = {
      id: randomUuid(),
      repo: target.repo,
      request: input.request,
      owner: owner(),
      sessionId: null,
      phase: "starting",
      accepted: false,
      session: null,
      result: null,
      pull: null,
      files: [],
      filesRead: false,
      error: null,
      stages: {}
    }
    const persisted = save(row)
    background(row, true, persisted)
    await persisted
  }
  // GitHub reports the person's merge. This read never requests or performs one.
  const followPull = (row: HostedObservation) => {
    if (!row.pull || row.merged || flights.has(`observe-pull:${row.id}`)) return
    const current = captureCloudOwner(ctx, false)
    const pull = row.pull
    const url = new URL(pull.pull_url)
    if (url.hostname !== "github.com") return
    const [owner, repo] = url.pathname.split("/").filter(Boolean)
    if (!owner || !repo) return
    const work = async () => {
      for (let attempt = 0; attempt < hostedChangePolling.maxAttempts && current(); attempt++) {
        const answer = await client.get(
          `/user/github-repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pull.pull_number}`
        )
        if (!current() || "error" in answer) return
        const parsed = z
          .object({
            state: z.string(),
            merged: z.boolean().optional(),
            merged_by: z.object({ login: z.string() }).nullable().optional(),
            merge_commit_sha: z.string().nullable().optional(),
            base: z.object({ ref: z.string() }).optional()
          })
          .safeParse(answer.body)
        if (!parsed.success) return
        if (parsed.data.merged === true) {
          await patch(row.id, {
            merged: {
              by: parsed.data.merged_by?.login ?? null,
              commit: parsed.data.base?.ref === "main" ? (parsed.data.merge_commit_sha ?? null) : null
            }
          })
          return
        }
        if (parsed.data.state === "closed") return
        await new Promise((resolve) => setTimeout(resolve, hostedChangePolling.delayMs))
      }
    }
    const pending = work()
      .catch((error) => ctx.report?.("Read pull request", error))
      .finally(() => flights.delete(`observe-pull:${row.id}`))
    flights.set(`observe-pull:${row.id}`, pending)
  }
  const openHostedPull = async ({ repo, session }: { repo: string; session: string }): Promise<void> => {
    const row = read(session)
    if (
      !row ||
      row.repo !== repo ||
      row.owner !== owner() ||
      !row.sessionId ||
      row.pull ||
      row.noChange ||
      (row.filesRead === true && row.files.length === 0) ||
      flights.has(`pull:${session}`)
    )
      return
    const owned = captureCloudOwner(ctx, false)
    const work = async () => {
      const response = await client.send(
        "POST",
        `${repoPath(repo)}/agent/sessions/${encodeURIComponent(row.sessionId!)}/landing`,
        {}
      )
      if (!owned()) return
      // CloudClient retains the typed details of already_landed; it is an opened PR, not an error.
      const value = "body" in response ? response.body : response.code === "already_landed" ? response.details : null
      const pull = HostedPullSchema.safeParse(value)
      if (pull.success) {
        await patch(session, {
          pull: pull.data,
          error: null,
          stages: observeStages(row.stages, row.session, row.accepted, row.result, pull.data, Date.now())
        })
        followPull({ ...row, pull: pull.data })
      } else if ("error" in response && response.code === "no_turn_head") {
        await patch(session, { noChange: true, error: null })
      } else
        await patch(session, {
          error:
            "error" in response
              ? landingRefusal(
                  response.code,
                  response.githubRefusal?.sentence ?? refusalLine(response.refusal, response.error)
                )
              : "GitHub couldn't open the pull request. Try again."
        })
    }
    const pending = work().finally(() => flights.delete(`pull:${session}`))
    flights.set(`pull:${session}`, pending)
    void pending.catch((error) => ctx.report?.("Open pull request", error))
  }
  const resume = () => {
    for (const row of rows()) if (row.owner === owner() && owner() && row.pull && !row.merged) followPull(row)
    for (const row of rows())
      if (row.owner === owner() && owner() && ["starting", "running"].includes(row.phase) && !flights.has(row.id)) {
        if (!row.sessionId || !row.accepted) {
          void patch(row.id, {
            phase: "failed",
            error: "The launch was interrupted before acceptance was recorded."
          })
          continue
        }
        background(row, false, Promise.resolve())
      }
  }
  const openHostedDiff = async (id: string): Promise<void> => {
    const row = read(id)
    if (!row || row.owner !== owner()) return
    if (row.diffOpen) {
      await patch(id, { diffOpen: false })
      return
    }
    const current = captureCloudOwner(ctx, false)
    const suffix = row.pull
      ? `/landings/${row.pull.landing_number}/diff`
      : row.result?.head_change_id
        ? `/changes/${encodeURIComponent(row.result.head_change_id)}/diff`
        : null
    if (!suffix) return
    const response = await client.get(`${repoPath(row.repo)}${suffix}`)
    if (!current()) return
    if ("error" in response) {
      await patch(id, { filesError: response.error })
      return
    }
    const parsed = HostedDiffSchema.safeParse(response.body)
    if (parsed.success) await patch(id, { diff: hostedDiffText(parsed.data), diffOpen: true })
  }
  return { askHostedChange, openHostedPull, openHostedDiff, resume, cancelHostedRetries, watchHostedChange }
}
