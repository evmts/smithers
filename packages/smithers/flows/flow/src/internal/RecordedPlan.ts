/**
 * Resume compatibility is weaker than result reuse: unchanged callback source
 * may rebuild a recorded plan, but an opaque closure still cannot earn a cache
 * hit. Only the interpreter's PlanRecorded guard uses this projection. Approval
 * digests and dispatch keys keep the original entropy-bearing material.
 *
 * @since 1.0.0
 * @internal
 */

import { isRecord } from "@smthrs/canonical/Record"
import type * as Plan from "@smthrs/plan/Plan"
import * as Graph from "../Graph.ts"

/** Missing source metadata retains the old identity and fails closed. */
const callback = (value: unknown): unknown =>
  isRecord(value) && value._tag === "FunctionIdentity" && value.algorithm === "sha256-source-ephemeral/v4" &&
    typeof value.sourceDigest === "string"
    ? { _tag: value._tag, algorithm: value.algorithm, digest: value.sourceDigest }
    : value

/**
 * Project only callback slots, never identity-shaped application data. `Graph`
 * records every node's body as an object tagged with its node kind.
 */
const body = (value: Readonly<Record<string, unknown>>): unknown => {
  switch (value._tag) {
    case "FlowCall":
      return isRecord(value.declaration)
        ? { ...value, declaration: { ...value.declaration, body: callback(value.declaration.body) } }
        : value
    case "Map":
      return { ...value, mapper: callback(value.mapper) }
    case "AndThen":
      return { ...value, continuation: callback(value.continuation) }
    case "Branch":
      return { ...value, predicate: callback(value.predicate) }
    case "Catch":
      return { ...value, filterIdentity: callback(value.filterIdentity) }
    default:
      return value
  }
}

/**
 * The same drafts, with only callback identities made restart-comparable.
 *
 * @since 1.0.0
 * @private
 */
export const recordedPlanDrafts = (graph: Graph.Graph): ReadonlyArray<Plan.NodeDraft> =>
  Graph.drafts(graph).map((draft) => ({
    ...draft,
    material: { ...draft.material, body: body(draft.material.body as Readonly<Record<string, unknown>>) }
  }))
