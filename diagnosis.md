# Confirmed completion projection deadlock

Confirmed against base ae86664e7124 on 2026-10-19 at 04:51Z, before changing production code.

Reproduction: TestCodingDispatchCompletesDespiteArchiveRefusal uses the real jobs worker, product Postgres, composed archive and AgentService projectors, and a deterministic completed host observation containing three assistant messages. With the admitted agent-session target lacking WorkspaceID, the dispatch never reaches StateCompleted (red: Condition never satisfied). Receipt: logs/red-dispatch-20261018-02.log; VM tree 826c461fa248e4aed639f23f7233d2d8817eda85, patch SHA prefix 3edb71799bae, snapshot 6273953693cf. This is a backend reproduction of the supplied production trace, not a new production probe.

Root cause in the unmodified base:
- packages/backend/internal/services/agent_dispatch_coding.go:216 admits an agent-session target without WorkspaceID because admission precedes workspace provisioning.
- packages/backend/internal/services/agent_flow_runtime.go:37 resolves the actual authorized workspace, but returns it separately in Authority.WorkspaceID (:42); the admitted target remains blank. flowhost resolves a client without exposing that binding workspace to flowdispatch.
- packages/backend/flowdispatch/handler.go:54 creates the checkpoint from the admitted target; :113 saves runtime identity but does not fill the workspace. operation.started and later checkpoints therefore retain a blank workspace.
- packages/backend/internal/compose/flow_composition.go:286 prepends the archive; :503 joins projector errors even though all projectors run.
- packages/backend/internal/compose/run_archive.go:101 treats the host Run.Status as terminal even when the dispatch projection is StateWaiting; :175 refuses the blank workspace. The terminal error returns at :87 without the warning at :94.
- packages/backend/flowdispatch/handler.go:657 projects the observed terminal host page as StateWaiting; :662 returns product_projection_unavailable on the archive error, before settle at :669.
- packages/backend/internal/services/agent_dispatch_coding.go:323 returns on StateWaiting. Only terminal dispatch projection reaches completeCodingTurn at :357, so assistant parts and terminal product status never commit.

Nuance: archive-first ordering does not prevent the agent projector from running on the waiting page. The joined archive error prevents the later terminal settlement call. Cancellation encounters the same projection gate.

Required repair: expose the authorized host binding workspace to checkpoints, including reconnects; make every archive projection failure log with run and reason and return success to dispatch, retaining capture refusal checks. Do not change completeCodingTurn or coding_result writing.
