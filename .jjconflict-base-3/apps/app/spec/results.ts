import { z } from "zod"

export type Mode = "mock" | "live"
export type State = "shipped" | "ahead" | "regressed" | "stale" | "unverified"
export interface AssertionResult {
  readonly kind: string
  readonly verdict?: "pass" | "fail" | "uncertain" | "missing" | "stale" | "inconclusive"
  readonly blocking?: boolean
  readonly ok: boolean | null
  readonly expected: unknown
  readonly actual: unknown
  readonly reason?: string
}
export interface StepResult {
  readonly caption: string
  readonly spec: string
  readonly status: "passed" | "failed" | "skipped"
  readonly assertions: ReadonlyArray<AssertionResult>
  readonly screenshot: string
  readonly ms: number
}
export interface RunResult {
  readonly journey: string
  readonly mode: Mode
  readonly revision: string
  readonly startedAt: string
  readonly steps: ReadonlyArray<StepResult>
  readonly state: State
  readonly reason?: string
}
/** Shared runtime schema for player, drift and on-disk CLI receipts. */
export const ResultsSchema = z.array(z.strictObject({
  journey: z.string().min(1),
  mode: z.enum(["mock", "live"]),
  revision: z.string().min(1),
  startedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), "invalid timestamp"),
  state: z.enum(["shipped", "ahead", "regressed", "stale", "unverified"]),
  reason: z.string().optional(),
  steps: z.array(z.strictObject({
    caption: z.string().min(1),
    spec: z.string().min(1),
    status: z.enum(["passed", "failed", "skipped"]),
    screenshot: z.string().min(1),
    ms: z.number().finite().nonnegative(),
    assertions: z.array(
      z.strictObject({
        kind: z.string().min(1),
        verdict: z.enum(["pass", "fail", "uncertain", "missing", "stale", "inconclusive"]).optional(),
        blocking: z.boolean().optional(),
        ok: z.boolean().nullable(),
        expected: z.unknown(),
        actual: z.unknown(),
        reason: z.string().optional()
      }).refine(
        (value) => Object.hasOwn(value, "expected") && Object.hasOwn(value, "actual"),
        "expected and actual required"
      )
    )
  }))
}))
/** Validate external results before the player or drift reads them. */
export const results = (value: unknown): ReadonlyArray<RunResult> => ResultsSchema.parse(value)
