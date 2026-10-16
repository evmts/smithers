import { afterAll, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Kit from "../../../examples/use-cases/kit.ts"
import { Approve, layer, RollbackAdvisor, RollbackDenied } from "../../../examples/use-cases/rollback-advisor.ts"

const directory = mkdtempSync(join(tmpdir(), "rollback-advisor-"))

afterAll(() => rmSync(directory, { recursive: true, force: true }))

/**
 * An evidence agent whose findings name the symptoms it was handed, an advisor
 * that recommends a rollback when the findings mention 5xx, and a person who
 * answers `decision`. Every request, the person's included, is recorded in
 * order.
 */
const script = (decision: "approve" | "deny") => {
  const turns: Array<string> = []
  const answer: Kit.Script = (asked) => {
    const gather = /Gather evidence about a failed deployment\.\n\nDeployment: (.+)\nSymptoms: (.*)/.exec(asked)
    if (gather !== null) {
      turns.push(`gather ${gather[1]}: ${gather[2]}`)
      return {
        deployment: gather[1],
        errorRate: 12,
        affectedEndpoints: ["/checkout"],
        timeline: "errors began 2 minutes after the deploy",
        severity: "high",
        rawFindings: `findings for ${gather[2]}`
      }
    }
    const advise = /recommend whether to rollback, mitigate, or observe\.\n\nDeployment: (.+)\nEvidence: (.+)/.exec(
      asked
    )
    if (advise !== null) {
      turns.push(`advise on ${advise[2]}`)
      const rollback = advise[2]!.includes("5xx")
      return {
        shouldRollback: rollback,
        reason: rollback ? `${advise[2]} after the deploy` : "latency only",
        mitigation: "Disable the new-cart flag. Shift 10% of traffic back",
        rollbackSafe: true,
        risks: []
      }
    }
    return undefined
  }
  const person = Approve.toLayer((request) =>
    Effect.suspend(() => {
      turns.push(`approve ${request.reason}: ${JSON.stringify(request.input)}`)
      return decision === "approve"
        ? Effect.succeed("approved" as const)
        : Effect.fail(new RollbackDenied({ note: "not during the sale" }))
    })
  )
  return { actions: Layer.mergeAll(layer, person), answer, turns }
}

it.effect("rolls back once a person approves", () =>
  Effect.gen(function*() {
    const { actions, answer, turns } = script("approve")
    const outcome = yield* Kit.run(RollbackAdvisor, { deployment: "api-v42", symptoms: ["5xx spike", "timeouts"] }, {
      filename: join(directory, "approved.sqlite"),
      executionId: "rollback-advisor-approved",
      script: answer,
      actions
    })

    // The person was asked after the advisor, about this deployment and the advisor's reason.
    expect(turns).toEqual([
      "gather api-v42: 5xx spike, timeouts",
      "advise on findings for 5xx spike, timeouts",
      "approve Rollback api-v42: {\"deployment\":\"api-v42\",\"reason\":\"findings for 5xx spike, timeouts after the deploy\"}"
    ])
    expect(outcome).toEqual({
      action: "rollback",
      summary: "Approved rollback for api-v42: findings for 5xx spike, timeouts after the deploy",
      steps: ["Initiate rollback", "Verify service health", "Notify stakeholders"]
    })
  }))

it.effect("observes when a person denies the rollback", () =>
  Effect.gen(function*() {
    const { actions, answer, turns } = script("deny")
    const outcome = yield* Kit.run(RollbackAdvisor, { deployment: "api-v42", symptoms: ["5xx spike"] }, {
      filename: join(directory, "denied.sqlite"),
      executionId: "rollback-advisor-denied",
      script: answer,
      actions
    })

    expect(turns.at(-1)).toMatch(/^approve Rollback api-v42: /)
    expect(outcome).toEqual({
      action: "observe",
      summary: "Rollback recommended but awaiting approval: findings for 5xx spike after the deploy",
      steps: ["Await approval", "Monitor error rates"]
    })
  }))

it.effect("mitigates without asking anyone when no rollback is recommended", () =>
  Effect.gen(function*() {
    const { actions, answer, turns } = script("approve")
    const outcome = yield* Kit.run(RollbackAdvisor, {}, {
      filename: join(directory, "mitigate.sqlite"),
      executionId: "rollback-advisor-mitigate",
      script: answer,
      actions
    })

    // The 0.x defaults: an unknown deployment and no symptoms. Nobody was asked to approve.
    expect(turns).toEqual(["gather unknown: ", "advise on findings for "])
    expect(outcome).toEqual({
      action: "mitigate",
      summary: "Mitigation plan: Disable the new-cart flag. Shift 10% of traffic back",
      steps: ["Disable the new-cart flag", "Shift 10% of traffic back"]
    })
  }))
