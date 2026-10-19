/**
 * A-2/E-4 (D38): `IssueSync.make`'s `ingest` and `drain` are async functions
 * that return Promises to TypeScript callers, a runner boundary VibeLang has
 * no form for (no `async` functions), and they call `setTimeout` and
 * `crypto.randomUUID` (E-7/EK4402, EK4403). The body is the source's `make`,
 * byte for byte; `IssueSync.vibe` keeps the schemas, the connector contract,
 * `requireDurableRuntime` and the failure walk, and passes the two helpers in.
 */
import { isRecord } from "@smthrs/canonical/Record"
import type { IntegrationFailure } from "./ActionFailure.vibe"
import type { ExternalEvent } from "./ExternalEvent.vibe"
import type { Connector, Delivery, Options } from "./IssueSync.vibe"

/** @vibelang trusted */
export const make = (
  options: Options,
  decodeDeliveries: (value: unknown) => ReadonlyArray<typeof Delivery.Type>,
  failureOf: (value: unknown) => IntegrationFailure | undefined
) => {
  const base = `/api/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/issues/sync`
  const request = async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
    const response = await options.request(`${base}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw Object.assign(new Error(`Issue sync ${method} ${path}: HTTP ${response.status}`), {
        status: response.status,
        retryAfter: response.headers.get("Retry-After")
      })
    }
    return response.json()
  }
  // 409: another worker already settled this row (a replayed lapsed claim), so this receipt is moot.
  const settle = async (id: number, receipt: unknown): Promise<boolean> => {
    try {
      await request(`/deliveries/${id}`, "PUT", receipt)
      return true
    } catch (error) {
      if (isRecord(error) && error["status"] === 409) return false
      throw error
    }
  }
  const ingest = async (body: unknown, event?: ExternalEvent): Promise<"ignored" | "applied"> => {
    let receipt: unknown
    for (let attempt = 0;; attempt++) {
      try {
        receipt = await request("/events", "POST", body)
        break
      } catch (error) {
        // A post can reach the provider before its backend receipt commits.
        // Keep the same intake identity during this short race. Exhaustion
        // fails the source without acknowledging, preserving provider retry.
        const reaction = isRecord(body) && (body["kind"] === "reaction_add" || body["kind"] === "reaction_remove")
        if (!reaction || !isRecord(error) || error["status"] !== 409 || attempt === 3) throw error
        await new Promise<void>((resolve) => setTimeout(resolve, 100 * 2 ** attempt))
      }
    }
    // A routine refusal (unmapped conversation, disallowed user) is acknowledged, not retried.
    if (isRecord(receipt) && typeof receipt["ignored"] === "string") return "ignored"
    if (
      event !== undefined && options.onMessage !== undefined && isRecord(receipt) &&
      typeof receipt["issue_id"] === "number"
    ) await options.onMessage({ issueId: receipt["issue_id"], event })
    return "applied"
  }
  const listDeliveries = async () => {
    const all: Array<typeof Delivery.Type> = []
    let after = 0
    while (true) {
      const page = decodeDeliveries(await request(after === 0 ? "/deliveries" : `/deliveries?after_id=${after}`))
      all.push(...page)
      if (page.length < 100) return all
      const next = page[page.length - 1]!.id
      if (next <= after) throw new Error("Issue delivery cursor did not advance")
      after = next
    }
  }
  const drain = async (): Promise<number> => {
    const deliveries = await listDeliveries()
    let completed = 0
    const unsettled: Array<unknown> = []
    for (const initial of deliveries) {
      if (!options.connector.accepts(initial.mapping)) continue
      const d = (await listDeliveries()).find((row) => row.id === initial.id)
      if (d === undefined) continue
      // The backend reveals a dispatching claim's token only after its lease lapses.
      let token = d.state === "dispatching" ? d.claim_token ?? "" : ""
      if (d.state === "dispatching" && token === "") continue
      if (d.state !== "pending" && token === "") {
        if (d.event !== "comment.created") continue
        const found = await options.connector.reconcile(d, `issue-sync-reconcile:${d.id}:${crypto.randomUUID()}`)
        if (found !== undefined) {
          if (await settle(d.id, { state: "sent", message_id: found, token: "" })) completed++
        }
        continue
      }
      if (token === "") {
        const claim = await request(`/deliveries/${d.id}`, "POST")
        if (!isRecord(claim) || claim["state"] !== "dispatching" || typeof claim["token"] !== "string") continue
        token = claim["token"]
      }
      // The claim's execution identity is durable: re-executing it after a lost
      // receipt replays the journaled outcome instead of acting again.
      let result: Awaited<ReturnType<Connector["deliver"]>>
      try {
        result = await options.connector.deliver(d, `issue-sync:${d.id}:${token}`)
      } catch (error) {
        const failure = failureOf(error)
        const partial = (failure?.deliveredMessageIds?.length ?? 0) > 0
        await settle(d.id, {
          state: failure !== undefined && failure.outcomeUnknown !== true && !partial ? "failed" : "outcome_unknown",
          token,
          message_id: partial ? failure!.deliveredMessageIds!.join(",") : d.message_id,
          error: failure?.message ?? "Delivery did not settle; reconcile before retrying"
        })
        continue
      }
      // A failed receipt write leaves the row dispatching for replay; it is not an unknown outcome.
      try {
        const settled = await settle(d.id, {
          state: result.unsupported === undefined ? "sent" : "unsupported",
          token,
          message_id: result.messageId,
          ...(result.unsupported === undefined ? {} : { error: result.unsupported })
        })
        if (settled) completed++
      } catch (error) {
        // A quota refusal pauses the whole host batch. Retain the durable
        // claim, but make no further calls before its Retry-After elapses.
        if (isRecord(error) && error["status"] === 429) throw error
        unsettled.push(error)
      }
    }
    if (unsettled.length > 0) throw new AggregateError(unsettled, "Issue delivery receipts did not commit")
    return completed
  }
  return { ingest, drain }
}
