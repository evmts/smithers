// A-2: keys runs Effect.runSync and must remain synchronous.
import * as Digest from "@smthrs/core/Digest"
import type * as Flow from "@smthrs/flow/Flow"
import * as Graph from "@smthrs/flow/Graph"
import type * as Placement from "@smthrs/plan/Placement"
import type * as PlanPackage from "@smthrs/plan/Plan"
import * as StepKey from "@smthrs/plan/StepKey"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { compare } from "./internal/Structural.vibe"
import type { PlanLike, PlanNodeLike, PlanPlacementLike } from "./PlanLike.vibe"
import {declaredEffects, placementProjection} from "./planPresentation.vibe"
import type {KeysOptions, FromGraphOptions} from "./Plan.vibe"
export const keys = (graph: Graph.Graph, options: KeysOptions = {}): Record<string, string> => {
  const runId = options.runId ?? "plan"
  const digests: Record<string, string> = {}
  Graph.drafts(graph).forEach((draft, index) => {
    const material = draft.material
    digests[draft.id] = Effect.runSync(Digest.provideSync(
      material.kind === "sealed"
        ? StepKey.fromKeyMaterial(material, digests)
        : StepKey.ordinal({
          runId,
          parentScope: draft.id,
          ordinal: index,
          tier: material.kind
        })
    ))
  })
  return digests
}
