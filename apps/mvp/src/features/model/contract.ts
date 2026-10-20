import { Config, Schema } from "effect"

// The model endpoint's contract between the browser's agent and ChatApi (docs/features/model-endpoint.md): the one
// home of the values both sides share, and of the settings that belong to a role. It imports only `effect`, which
// every side has.

/** The metered model endpoint: `POST <route>/<role>` with a JSON `ModelRequest`, answered as NDJSON model events. */
export const MODEL_ROUTE = "/api/model"

/**
 * What a model call is for. Each role is answered by the model an admin set for it (`admin/SetModel`), or by the
 * deployment's default model when no admin has.
 */
export const MODEL_ROLES = ["agent", "renderer", "judge"] as const

/** One of {@link MODEL_ROLES}. */
export type ModelRole = (typeof MODEL_ROLES)[number]

/**
 * How long a live run of the `agent` role may go without writing to its answer, in seconds, when
 * `ANSWER_TURN_LIVE_SECONDS` is unset: an earlier `streaming` answer holds up later turns for this long after its last
 * write (docs/features/agent.md#turn-by-turn).
 *
 * The bound has to outlast a live run's longest silence, and the model isn't what's slowest. ChatApi's dev logs of
 * 2026-10-20 (`.alchemy/log/dev_williamcory/ChatApi`, 09:57 to 10:30 UTC, e2e and manual runs against
 * `qwen-3.8-27b` on Cerebras) show:
 * - 47 `model.proxy.serve` calls for the role: first event p50 655 ms, p95 2,060 ms, max 2,841 ms; whole call max
 *   3,031 ms;
 * - 46 answers that settled: the run's first `GET /api/answers/<id>` came p50 520 ms, p95 4.5 s, max 16.4 s after
 *   the `202` or `200` that told its device the question was taken. The engine starts the run in the background, and
 *   nothing writes the answer until it does.
 *
 * A start plus one model call is about 19.4 s at the observed worst; 30 s is that with half again as margin. A live run
 * silent for longer only lets a later answer start beside it; an answer whose device is gone holds up later answers no
 * longer than this, and `chat/Expire` settles it later (docs/features/remote-flows.md).
 */
export const AGENT_LIVE_SECONDS = 30

/** `ANSWER_TURN_LIVE_SECONDS`: a positive integer of seconds, {@link AGENT_LIVE_SECONDS} when unset. */
export const agentLiveSeconds = Config.schema(Schema.Int.check(Schema.isGreaterThan(0)), "ANSWER_TURN_LIVE_SECONDS")
  .pipe(Config.withDefault(AGENT_LIVE_SECONDS))
