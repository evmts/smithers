import type { BrowserEngine } from "@smthrs/platform-browser"
import type { Effect } from "effect"
import { Schema } from "effect"

// Runs on this tab (decision 0014 §1 "On the device", docs/features/runs.md#the-browser): this device's engine's runs,
// read through `BrowserEngine` (its leader's `RunInspection`), kept in local collections, never in Postgres. Nothing
// here is stored on the device: a reload reads the engine again.

/** One run of this device's engine, as `BrowserEngine.inspect` reads it. */
export type Inspection = Effect.Success<ReturnType<BrowserEngine.Service["inspect"]>>

/** The engine's statuses. */
export const RunStatus = Schema.Literals(["pending", "running", "suspended", "completed", "failed", "cancelled"])
export type RunStatus = typeof RunStatus.Type

/** One run of the list: `localRuns` of decision 0014 §1. */
export const RunRow = Schema.Struct({
  id: Schema.String,
  flow: Schema.String,
  status: RunStatus,
  cancelRequested: Schema.Boolean,
  createdAtMs: Schema.Number,
  startedAtMs: Schema.NullOr(Schema.Number),
  finishedAtMs: Schema.NullOr(Schema.Number),
  seq: Schema.Number,
})
export type RunRow = typeof RunRow.Type

/**
 * One run's page as the engine last read it (`runTraces`): `read` with its inspection, or why there is none: the engine
 * doesn't hold it (`not_found`, shown as `On another device`) or couldn't be reached (`unavailable`).
 */
export const RunPage = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals(["read", "not_found", "unavailable"]),
  inspection: Schema.NullOr(Schema.Unknown),
  /** The journal events read past the first page, by More. */
  more: Schema.Array(Schema.Unknown),
  descendants: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  hasMore: Schema.Boolean,
})
export type RunPage = typeof RunPage.Type

/** The tabs of a run's page. */
export const RUN_TABS = ["steps", "timeline", "journal"] as const
export type RunTab = (typeof RUN_TABS)[number]

/** An act a person pressed, until its flow answers. */
export const Acting = Schema.NullOr(Schema.Literals(["stop", "retry", "resume"]))

/** This tab's run view (`runPage`): the run it shows, the step selected, the tab, an act in flight and a refusal. */
export const RunView = Schema.Struct({
  id: Schema.Literal("view"),
  runId: Schema.NullOr(Schema.String),
  listOpen: Schema.Boolean,
  selected: Schema.NullOr(Schema.String),
  now: Schema.optionalKey(Schema.Number),
  at: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  inspectorOpen: Schema.optionalKey(Schema.Boolean),
  tab: Schema.Literals(["steps", "timeline", "journal"]),
  acting: Acting,
  refusal: Schema.NullOr(Schema.String),
})
export type RunView = typeof RunView.Type

/** The one row of `RunView`. */
export const VIEW = "view"
