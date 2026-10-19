// A-1/A-2: synchronous throwing memo factory; runSync constructs the cold cache.
import * as Effect from "effect/Effect"
import type * as SnapshotRecorder from "./SnapshotRecorder.vibe"
import { canonicalJson } from "./internal/Canonical.vibe"
import type { Source, Input } from "./Source.vibe"
import { load } from "./SourceLoad.vibe"
export const makeSource = (options: { readonly capacity?: number | undefined } = {}): Source => {
  const capacity = options.capacity ?? 1_024
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new TypeError("memory source capacity must be a positive safe integer")
  }
  type Read = ReturnType<Source["read"]>
  const snapshots = new Map<string, {
    readonly effect: Read
    readonly fields: Readonly<Record<string, string>>
  }>()
  const fields = (input: Input): Readonly<Record<string, string>> => ({
    banks: canonicalJson(input.banks),
    query: canonicalJson(input.query),
    tagGroups: canonicalJson(input.tagGroups),
    maxTokens: canonicalJson(input.maxTokens),
    budget: canonicalJson(input.budget),
    primerBanks: canonicalJson(input.primerBanks),
    maxBytes: canonicalJson(input.maxBytes)
  })
  return {
    read: (input) => {
      const key = `${input.lineageId}\u0000${input.iteration}`
      const existing = snapshots.get(key)
      if (existing !== undefined) {
        snapshots.delete(key)
        snapshots.set(key, existing)
        const currentFields = fields(input)
        const changed = Object.keys(existing.fields).filter((field) => existing.fields[field] !== currentFields[field])
        return changed.length === 0
          ? existing.effect
          : Effect.logWarning(
            `memory source ignored changed fields for frozen snapshot ${key}: ${changed.join(", ")}`
          ).pipe(Effect.andThen(existing.effect))
      }
      const identity: SnapshotRecorder.Identity = {
        lineageId: input.lineageId,
        iteration: input.iteration
      }
      const current: Read = Effect.runSync(Effect.cached(load(input, identity).pipe(
        Effect.onError(() => Effect.sync(() => {
          if (snapshots.get(key)?.effect === current) snapshots.delete(key)
        }))
      )))
      snapshots.set(key, { effect: current, fields: fields(input) })
      while (snapshots.size > capacity) snapshots.delete(snapshots.keys().next().value!)
      return current
    }
  }
}

