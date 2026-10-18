import { Metric } from "effect"

// Usage metrics for the repository view, exported over OTLP with the rest of the browser's telemetry
// (docs/observability.md#browser). Labels carry kinds and outcomes, never a repository's files or contents.

/** Presses of Clone (`kind` `clone`) and Try again (`kind` `retry`). */
export const cloneClicks = Metric.counter("smithers_web_repo_clone_clicks", {
  description: "Times a person pressed Clone or Try again, by kind",
  incremental: true,
})

/**
 * Clone requests that ended, by `outcome`: `accepted` (RepoApi took it and Electric delivered the row), `sign_in`
 * (401), `limit` (429), `refused` (another refusal), `unreachable` (no answer) or `unconfirmed` (Electric didn't
 * deliver the row in time).
 */
export const clones = Metric.counter("smithers_web_repo_clones", {
  description: "Clone requests from this tab that ended, by outcome",
  incremental: true,
})

/** Repository views opened, by `kind`: `tree` or `blob`. */
export const opens = Metric.counter("smithers_web_repo_opens", {
  description: "Repository views opened, by kind",
  incremental: true,
})

const loadBoundaries = Metric.exponentialBoundaries({ start: 25, factor: 2, count: 10 })

/** Milliseconds a file list took to load, by `outcome`: `ready` or `failed`. */
export const treeLoadMs = Metric.histogram("smithers_web_repo_tree_load_ms", {
  description: "Milliseconds a repository's file list took to load, by outcome",
  boundaries: loadBoundaries,
})

/** Milliseconds a file took to load, by `outcome`: `text`, `binary`, `too-large` or `failed`. */
export const blobLoadMs = Metric.histogram("smithers_web_repo_blob_load_ms", {
  description: "Milliseconds a file took to load, by outcome",
  boundaries: loadBoundaries,
})

/** Copy permalink presses, by `outcome`: `copied` or `failed`. */
export const permalinkCopies = Metric.counter("smithers_web_repo_permalink_copies", {
  description: "Copy permalink presses, by outcome",
  incremental: true,
})
