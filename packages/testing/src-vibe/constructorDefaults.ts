// B-2: schema construction at module scope must retain cold default Effects.
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
const constantCode = <const C extends string>(code: C) =>
  Schema.Literal(code).pipe(Schema.withConstructorDefault(Effect.succeed(code)))
export const defaults = {
  conformance_violation: constantCode("conformance_violation"),
  unscripted_model: constantCode("unscripted_model"),
  fixture_not_encodable: constantCode("fixture_not_encodable"),
  replay_harness_mismatch: constantCode("replay_harness_mismatch"),
  fixture_divergence: constantCode("fixture_divergence"),
  exactly_once_unsupported: constantCode("exactly_once_unsupported"),
  capability_contract_violation: constantCode("capability_contract_violation"),
  conformance_skipped: constantCode("conformance_skipped"),
  engine_unavailable: constantCode("engine_unavailable"),
  execution_conflict: constantCode("execution_conflict"),
  capability_operation_failed: constantCode("capability_operation_failed"),
  transaction_commit_failed: constantCode("transaction_commit_failed"),
  rewind_failed: constantCode("rewind_failed"),
  flow_hash_mismatch: constantCode("flow_hash_mismatch"),
}
