// Flows' contract between the tab, its engine worker and ChatApi's telemetry relay (docs/features/flows.md): the one
// home of the values they share. Nothing here imports a library, so every side can.

/** The engine's name in every tab and its worker: its Web Lock, its channel and its OPFS directory. */
export const ENGINE_NAME = "smithers"

/**
 * What starts a dispatch: a button, a slash command, a view, the composer, the agent's cell, or sync, when a row another
 * device wrote asks this device to act on a run it holds (an answer to deliver, decision 0015).
 */
export const DOORS = ["button", "slash", "view", "composer", "agent", "sync"] as const

/**
 * What flows record in the browser (docs/observability.md#browser), by name, and the attributes they carry: dispatch in
 * the tab; the tab's side of the engine and the leader in the engine worker (`@smthrs/platform-browser`); and the
 * durable engine every client flow runs on (`@smthrs/flows`). The engine's storage spans (its statements, runs,
 * attempts and journal) are left out: hundreds per run, they would overflow the relay's limits, and the engine
 * worker's exporter sends only spans named here. ChatApi's relay keeps exactly what src/telemetry.ts merges from every
 * feature; none of these fields carries a flow's input.
 */
export const FLOWS_TELEMETRY = {
  records: [
    "flow.dispatch",
    "smithers_flow_dispatches",
    // The tab's side of the engine (@smthrs/platform-browser BrowserEngine, StoragePersistence).
    "browser.engine.storage",
    "browser.engine.unavailable",
    "browser.storage.persist",
    "smithers_browser_engine_requests",
    "smithers_browser_engine_storage",
    "smithers_browser_engine_unavailable",
    // The leader, in the engine worker (@smthrs/platform-browser BrowserRuntime).
    "browser.runtime.elect",
    "browser.runtime.leader",
    "browser.runtime.wake",
    "browser.runtime.request",
    "browser.runtime.statement",
    "browser.runtime.lost",
    "browser.runtime.stopped",
    "smithers_browser_runtime_leaderships",
    "smithers_browser_runtime_wakes",
    "smithers_browser_runtime_requests",
    "smithers_browser_runtime_statements",
    // The durable engine (@smthrs/flows): each flow run and each step, and its warnings and counts.
    "FlowEngine.execute",
    "Action.execute",
    "action attempt interrupted: the engine store is unavailable",
    "run lease lapsed; interrupting owned work",
    "run heartbeat write failed",
    "flows_engine_dispatches",
    "flows_engine_dispatch_duration",
    "flows_engine_claims",
    "flows_engine_storage_unavailable",
    "flows_engine_boundary_settlements",
    "flows_engine_step_cache_decisions",
    "flows_engine_scheduler_admissions",
    "flows_engine_scheduler_dispatch_duration",
    "flows_engine_scheduler_nodes",
    "flows_run_claims",
    "flows_run_transitions",
    "flows_run_heartbeats",
    "flows_run_throughput",
    "flows_journal_writes",
    "flows_journal_lost",
    "flows_db_writer_lock_wait",
    "flows_db_write_retries",
    "flows_step_cache_lookups",
    "flows_step_cache_puts",
  ],
  fields: [
    "flow",
    "door",
    "executionId",
    "outcome",
    "refusal",
    "durationMs",
    "smithers.flow.name",
    "smithers.flow.door",
    "smithers.flow.outcome",
    "request",
    "error.type",
    "flows",
    "smithers.execution.id",
    "smithers.flow",
    "smithers.request",
    "smithers.request.outcome",
    "smithers.wake",
    "runId",
    "action",
    "stepKey",
    "attempt",
    "tier",
    "error",
    "code",
    "unconfirmedMs",
    "op",
    "to",
    "channel",
    "receipt",
    "operation",
    "time_unit",
    "effect.fiber.interrupted",
  ],
} as const
