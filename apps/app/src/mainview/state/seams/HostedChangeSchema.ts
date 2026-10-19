import { z } from "zod"
export const TestReceiptSchema = z.object({
  command: z.string(),
  exit_code: z.number().int(),
  commit: z.string(),
  finished_at: z.string(),
  output_tail: z.string().max(4096),
  tests_run: z.number().int().nonnegative().nullable()
})
export const CodingResultSchema = z.object({
  head_commit: z.string().nullable(),
  head_change_id: z.string().nullable(),
  test_receipt: TestReceiptSchema.nullable(),
  test_not_run: z.object({ reason_code: z.string(), reason: z.string() }).nullable().optional()
})
export const HostedSessionSchema = z
  .object({
    id: z.string(),
    stage: z.enum(["queued", "started"]).nullable().optional(),
    queued_at: z.iso.datetime({ offset: true }).nullable().optional(),
    message_count: z.number().int().nonnegative().optional(),
    status: z.enum(["active", "completed", "failed", "cancelled", "timed_out"]),
    reason_code: z.string().nullable(),
    reason: z.string().nullable(),
    retryable: z.boolean(),
    workspace: z.object({ id: z.string(), name: z.string(), status: z.string() }).passthrough().nullable(),
    run: z
      .object({
        id: z.number().int(),
        status: z.enum(["queued", "running", "success", "failure", "cancelled"]),
        model: z.string().nullable().optional(),
        started_at: z.string().nullable().optional(),
        finished_at: z.string().nullable().optional()
      })
      .passthrough()
      .nullable()
  })
  .passthrough()
export const HostedPullSchema = z.object({
  landing_number: z.number().int(),
  branch: z.string(),
  pull_number: z.number().int(),
  pull_url: z.url().refine((value) => new URL(value).protocol === "https:"),
  head_commit: z.string(),
  tested: z.boolean(),
  passed: z.boolean()
})
export const HostedObservationSchema = z.object({
  id: z.string(),
  repo: z.string(),
  request: z.string(),
  sessionId: z.string().nullable(),
  owner: z.string().nullable(),
  phase: z.enum(["starting", "running", "done", "failed"]),
  accepted: z.boolean(),
  session: HostedSessionSchema.nullable(),
  result: CodingResultSchema.nullable(),
  pull: HostedPullSchema.nullable(),
  files: z.array(z.object({ path: z.string(), additions: z.number().optional(), deletions: z.number().optional() })),
  merged: z.object({ by: z.string().nullable(), commit: z.string().nullable() }).optional(),
  observedAt: z.number().optional(),
  busyRetries: z.number().int().min(0).max(4).optional(),
  busyWaiting: z.boolean().optional(),
  noChange: z.boolean().optional(),
  outcome: z.string().optional(),
  activity: z.string().optional(),
  filesRead: z.boolean().optional(),
  filesError: z.string().optional(),
  diff: z.string().optional(),
  diffOpen: z.boolean().optional(),
  error: z.string().nullable(),
  stages: z.partialRecord(
    z.enum(["Admitted", "Allocating a machine", "Cloning", "Model working", "Testing", "Pull request opened"]),
    z.number()
  )
})

export const HostedFilesSchema = z.array(
  z.object({ path: z.string(), additions: z.number().optional(), deletions: z.number().optional() })
)
export const HostedDiffSchema = z.union([
  z.string(),
  z.object({
    diff: z.string().optional(),
    patch: z.string().optional(),
    file_diffs: z
      .array(
        z.object({
          path: z.string(),
          patch: z.string().optional(),
          diff: z.string().optional(),
          additions: z.number().optional(),
          deletions: z.number().optional()
        })
      )
      .optional()
  })
])
export const hostedDiffText = (body: z.infer<typeof HostedDiffSchema>): string =>
  typeof body === "string"
    ? body
    : (body.diff ?? body.patch ?? body.file_diffs?.map((file) => file.patch ?? file.diff ?? "").join("\n") ?? "")
