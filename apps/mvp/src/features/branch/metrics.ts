import { Metric } from "effect"

// What the branch workspace counts in the browser (docs/observability.md#browser). No attribute carries an id or a
// branch's name.

/** `branch/track` requests, by `outcome`: `tracked`, the refusal's reason, or `unavailable`. */
export const tracks = Metric.counter("smithers_web_branch_tracks", {
  description: "Branch track requests from this browser, by outcome",
  incremental: true,
})

/**
 * Branch pages opened offline, once the browser is back online, by `outcome`: `reopened` (the route loads again), or
 * `abandoned` (its navigation was aborted: a newer one took over, or the page closed).
 */
export const reopens = Metric.counter("smithers_web_branch_reopens", {
  description: "Branch pages opened offline, once the browser is back online, by outcome",
  incremental: true,
})

/** Branch pages opened, by `outcome`: `ready`, `missing`, `sign_in`, `forbidden`, `failed` or `offline`. */
export const opens = Metric.counter("smithers_web_branch_opens", {
  description: "Branch pages opened in this browser, by outcome",
  incremental: true,
})
