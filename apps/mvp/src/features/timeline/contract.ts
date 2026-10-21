// Timeline diagnostics contain only outcomes, the model role and whether a durable summary was replayed.
export const TIMELINE_TELEMETRY = {
  records: [
    "timeline.summary",
    "timeline.summary.unavailable",
    "timeline.summary.unconfigured",
    "timeline.summary.defect",
    "timeline.summary.deleted",
    "timeline.summary.delete",
    "smithers_timeline_summary_calls",
    "smithers_timeline_summary_removals",
  ],
  fields: ["outcome", "role", "replayed"],
} as const
