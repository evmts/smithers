import { Metric } from "effect"

// The feed's usage metrics (docs/observability.md#notifications): the engine's watches and acts, and what the tab showed.

/** `watch/set` requests, by `outcome`: `sent`, `refused`, `unsent`. */
export const watches = Metric.counter("smithers_notification_watches", {
  description: "Follows of a conversation's branch and repository, by outcome",
  incremental: true,
})

/** `notification/ack` requests, by `act` (`read`, `dismiss`, `hide`) and `outcome`. */
export const acks = Metric.counter("smithers_notification_acks", {
  description: "Acts on notifications, by act and outcome",
  incremental: true,
})

/** Notifications that came to show as a toast in a tab, once per version, by `state`. */
export const shown = Metric.counter("smithers_notifications_shown", {
  description: "Notifications shown as a toast, once per version per tab, by state",
  incremental: true,
})
