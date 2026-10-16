import { Schema } from "effect"

// Frozen evaluator declaration from 6206550c. Importing today's error here
// silently changes the archived declaration whenever its usage schema grows.
class EvaluatorError extends Schema.TaggedError<EvaluatorError>()("flows/model/EvaluatorError", {
  code: Schema.Literals([
    "unconfigured",
    "unreachable",
    "refused",
    "empty",
    "timeout",
    "invalid_answer",
    "invalid_question"
  ]),
  status: Schema.optional(Schema.Number),
  resetAtEpochMillis: Schema.optional(Schema.Number),
  message: Schema.String,
  usage: Schema.optional(Schema.Struct({
    inputTokens: Schema.Number,
    outputTokens: Schema.Number,
    modelId: Schema.optional(Schema.String)
  }))
}) {}

// Archived declaration immediately before approval_unavailable (#3161).
export class HarnessErrorBeforeApproval extends Schema.TaggedError<HarnessErrorBeforeApproval>()(
  "/harness/HarnessError",
  {
    code: Schema.Literals([
      "assembly_failed",
      "incompatible_journal",
      "render_failed",
      "model_failed",
      "engine_failed",
      "read_only_cap",
      "completion_unjudged",
      "completion_incomplete",
      "claim_unproven",
      "suspended"
    ]),
    message: Schema.String,
    cause: Schema.optional(Schema.Union([EvaluatorError, Schema.Defect()]))
  }
) {}
