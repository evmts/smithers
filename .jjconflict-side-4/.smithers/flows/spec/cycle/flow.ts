import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

const payload = Schema.Struct({ kind: Schema.Literals(["sync", "live"]), config: Schema.String })
const implementationVersion = "spec-cycle/v1"
const Cycle = Action.make("spec/cycle/run", { implementationVersion, payload, success: Schema.Void, error: ModuleFailed, nondeterministic: true })
export const layer = Cycle.toLayer(request => runModule(new URL("../../../../apps/app/spec/cycle.ts", import.meta.url), [request.kind, request.config], { interpreter: "bun" }), { implementationVersion })
export default Flow.make("spec/cycle", {
  description: "Rebuild the living mock or run scheduled read-only live journeys and budgeted judges.",
  capabilities: ["fs:read:**", "fs:write:**", "proc:spawn:bun *", "proc:spawn:pnpm *", "net:get:**"],
  effects: { reads: ["**"], writes: ["**"], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: false,
  payload: Schema.Struct({ kind: Schema.Literals(["sync", "live"]), config: Schema.String }), success: Schema.Void, error: ModuleFailed,
  body: Node.capture({ implementationVersion }, request => Cycle.call(request))
})
