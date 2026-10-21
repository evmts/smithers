# Flows UI: what we took from other workflow tools

Research for the [flows UI mock](flows-ui.html), 2026-10-20. Will asked for a Flows UI "more inspired by n8n and how they visualize workflows", at the level of other popular workflow tools. Each section names what the product does, what the mock takes, and what it leaves out and why.

**How each claim was checked.** Every link below was fetched on 2026-10-20. A claim marked *(search summary)* comes from a search result's summary of that page, not from a fetch. A claim marked *(community)* comes from a forum answer, not from the vendor's docs. Treat both as leads to confirm, not as facts.

The mock's **Sources** toggle (press `i`) puts a numbered marker on each part that borrows from a product, linked to its section here.

## The three ideas that matter most

| # | Idea | From | Where in the mock |
|---|---|---|---|
| 1 | A run lights up the same canvas you edit, with each node's input, output and logs one click away; pin a node's output and run one node from upstream data, and pins never reach a real run | n8n | Editor: Run step (`.`), Pin (`p`), Try (`⌘↵`); Run view: the lit graph and its inspector |
| 2 | Retry from a step makes a new run that reuses the journal's earlier results, with that step's input editable; the old run is untouched | Inngest | Run view: Retry from here (`⇧R`) |
| 3 | The canvas is a view of the stored definition, and the editor says when it can't draw something instead of dropping it | Windmill | Editor: `flow.ts` beside the canvas; the "Can't draw this line" banner |

## n8n

<a id="n8n"></a>

**What it does.**
- **Data pinning.** "Saving the output data of a node and using the saved data instead of fetching fresh data." Pin from the node's output view; edit pinned JSON; unpin from a banner. "Data pinning isn't available for production workflow executions", and production runs "ignore all pinned data." Only nodes with one main output and no binary data can be pinned. ([data pinning](https://docs.n8n.io/data/data-pinning/))
- **Partial executions.** Execute step "executes the specific node and any preceding nodes required to fill in its input data." ([manual, partial and production executions](https://docs.n8n.io/workflows/executions/manual-partial-and-production-executions/))
- **Debug in editor.** A failed execution's data can be loaded into the editor: n8n "copies the execution data into your current workflow, and pins the data in the first node." ([debug](https://docs.n8n.io/workflows/executions/debug/))
- **Node controls and settings.** Hovering a node shows execute step, deactivate, delete and a menu with Pin. Settings include Retry On Fail, Always Output Data and On Error (stop, continue, or continue through an error output). Add a node from a connector or the nodes panel, which has search. ([nodes](https://docs.n8n.io/workflows/components/nodes/))
- **Executions list.** Per workflow, filterable by Failed, Running, Success and Waiting. A failed run can be retried "using the currently saved workflow" or "the original workflow." ([executions](https://docs.n8n.io/workflows/executions/single-workflow-executions/))
- **Sub-workflows.** From the parent, "View sub-execution"; the sub-execution links back to its parent. ([sub-workflows](https://docs.n8n.io/flow-logic/subworkflows/))
- **Mapping.** Drag a field from the INPUT pane onto a parameter and n8n writes the expression. ([data mapping](https://docs.n8n.io/data/data-mapping/data-mapping-ui/))

**Taken.**
- The canvas is the main view of a flow, and the run view is the same canvas lit by state.
- **Pin** (`p`) and **Run step** (`.`), with n8n's rule kept: a pin is used by Try only, never by a real run. Run step runs the steps before it that have no output or pin yet.
- **Pin to editor** from a run's step, our form of "Copy to editor".
- **Retry** and **Retry latest** on a settled run: the pinned version or the current one. This is n8n's two Refresh options, and today's app already has both buttons.
- A **+** on every edge, and **Add after** (`a`) on a selected step.
- **Watched by needs-you/curate** on a run, and opening a watched run from the flow over it, both ways, as n8n links sub-executions.
- Retry On Fail becomes the step's `retryPolicy`, edited in the inspector and written to `flow.ts`.

**Left out.**
- **Stored node positions.** n8n keeps coordinates in the workflow JSON. Our source is `Flow.make` and "Never add a second node or graph model" (root `AGENTS.md`), so the layout is a pure function of the graph and nothing about the canvas is stored.
- **Drag-to-map expressions.** A step's input is a typed value in code (`Node.andThen((notes) => …)`). The inspector shows the input's schema and its data instead.
- **Continue on fail as a setting.** Recovery is `Node.catch` in code, so it shows as a `catch` edge (see `triage/Run`), not a hidden toggle.

## Zapier

<a id="zapier"></a>

**What it does** *(search summary)*. In the Zap editor, the Zap runs panel lists runs; choosing one switches the editor to a run view where each step shows its status, and a step's Run details show the data it received and sent, with the run's status, time, version and id at the top. A test run uses a trigger record, and testing an action step performs it for real. ([View specific Zap run details](https://help.zapier.com/hc/en-us/articles/20512774106125), [Zap history](https://help.zapier.com/hc/en-us/articles/8496291148685))

**Taken.** Run history lives in the flow, not on a separate page: the **Runs** tab beside **Editor**, and the run strip (T15, T14, T13, T12) in the run view's header.

**Left out.** Live effects in tests for system steps. Try in the mock stops before a system step such as `release/draft`, because GitHub writes are system flows that people trigger on purpose (`AGENTS.md`, trust boundaries).

## Make

<a id="make"></a>

**What it does** *(community, search summary)*. After a run, each module shows a bubble; clicking it shows the bundles the module received and sent, exportable as JSON. History's Details shows a run's bundles and logs, and full-text search finds a value across runs. ([scenario history](https://help.make.com/scenario-history), [community answer](https://community.make.com/t/is-it-possible-to-have-data-history-of-execution-and-the-possibility-to-replay-it/83570))

**Taken.** A count or size on the edge after a run: `1.9 KB` out of Plan, `+56 −8` out of Implement, `12 PRs` out of Merged PRs, `#4131` out of Propose.

**Left out.** Per-bundle iteration. A Smithers step settles once per call; a fan-out is `Node.all` and draws as parallel nodes.

## Windmill

<a id="windmill"></a>

**What it does.**
- "Workflows are graphs (DAG)." Each step is code. A flow "is a JSON serializable value in the OpenFlow format", the canvas draws that definition, and `wmill lint` flags hand-written groups or notes the editor can't draw. Subflows can expand inline. ([flow editor](https://www.windmill.dev/docs/flows/flow_editor))
- **Test this step** with arguments "pre-filled from the step inputs"; **Test up to step**; restart from any top-level step; step mocking (pin a result). ([testing flows](https://www.windmill.dev/docs/flows/test_flows))

**Taken.**
- The canvas is derived from `flow.ts`, and every canvas edit is an edit to `flow.ts`, shown as highlighted lines beside it. Edit the code (`e`) and the canvas follows.
- When the code holds something the canvas can't draw, the canvas dims, keeps its last good graph and names the line ("Can't draw this line · line 58"). It never silently drops a step.
- Run step pre-fills a step's input from the step before it.

**Left out.** A second serialized format. OpenFlow is Windmill's source; ours is TypeScript, and the plan's graph comes from `Graph.build` over it.

## Pipedream

<a id="pipedream"></a>

**What it does.** An event inspector beside the workflow lists its events; a button "replays the event against the newest version of your workflow." Output from code steps attaches to the step that wrote it. ([inspect events](https://pipedream.com/docs/workflows/building-workflows/inspect))

**Taken.** **Retry latest** replays the same input on the latest version; **Retry** keeps the pinned one. Logs attach to the step that wrote them (the Logs tab).

## Temporal UI

<a id="temporal"></a>

**What it does.** A run's History has Timeline, All, Compact ("a logical grouping of Activities, Signals and Timers") and JSON views; clicking an event shows its details. Pending Activities summarizes what is running. **Relationships** "displays the full hierarchy of a Workflow Execution with all parent and child nodes displayed in a tree." Cancel, Signal, Update, Reset and Terminate run from the UI. ([web UI](https://docs.temporal.io/web-ui))

**Taken.**
- **Timeline** and **Journal** tabs under the graph: the waterfall, and every journal event with its sequence, time, type and step.
- Relationships, as the flow over flows: `needs-you/curate` draws the runs it watches as a group feeding its graph, each with its own row of step states.

**Left out.** Reset. It rewinds a run's history, and user-facing fork and rewind controls are removed (root `AGENTS.md`, "Libraries we keep"). The scrubber reads the journal at a point and changes nothing.

## Inngest

<a id="inngest"></a>

**What it does.**
- The trace view has run info and a waterfall timeline on the left and the selected step or run's details on the right. Run and step bars are status-colored; sleeps are gray; traces show timing, queue delays, retry attempts and input and output. *(search summary)* ([traces](https://www.inngest.com/docs/platform/monitor/traces))
- **Rerun from step:** "Inngest creates a new run and reconstructs the results of all earlier steps as memoized state." "If you provide replacement input, the selected step uses that new input", shown beside the original. "The new run has its own run ID and trace." The original is unchanged. ([rerun](https://www.inngest.com/docs/platform/manage/rerun-function-runs))
- The dev server lists functions, invokes one with a JSON payload, sends test events, and shows each run's steps, output, errors and trace. ([dev server](https://www.inngest.com/docs/dev-server))

**Taken.**
- The run view's layout: graph and waterfall on the left, the step's detail on the right.
- **Retry from here:** a dialog that lists what it reuses and what runs again, with the step's input editable. It starts a new linked run (`T13·2`), whose reused steps draw dashed with ↺.

**Open.** Retry from here needs a ruling; see the [plan](PLAN.md#open-question-for-will).

## Retool Workflows

<a id="retool"></a>

**What it does** *(search summary)*. A run history panel logs every run; each block shows its status, so you can see where a run failed. Logs filter by time, block and status and export as JSON. Running one block on its own is not logged as a workflow run *(community)*. ([run logs](https://docs.retool.com/workflows/concepts/logs))

**Taken.** Status per step in history (the runs grid). Try runs are test runs: they use pins, and they are kept apart from the flow's real runs.

## Node-RED

<a id="node-red"></a>

**What it does.** A palette lists nodes to drag onto the workspace; a sidebar holds info and debug panels; the header holds Deploy. The quick-add dialog "is opened by holding the Ctrl or Command key when clicking on the workspace", and clicking a wire while it is open splices the new node into that wire. ([editor](https://nodered.org/docs/user-guide/editor/), [nodes](https://nodered.org/docs/user-guide/editor/workspace/nodes))

**Taken.** Add by keyboard where you are: `a` opens the step palette after the selected step, and a **+** on an edge inserts into it. The palette searches steps and the repository's flows together.

**Left out.** A permanent palette rail. It costs width on every screen; the palette opens on demand.

## LangGraph Studio

<a id="langgraph-studio"></a>

**What it does.** "A specialized agent IDE that enables visualization, interaction, and debugging of agentic systems." Graph mode "exposes the full feature-set"; chat mode is a simpler view for chat agents. It visualizes the graph and debugs "agent state via time travel." ([LangSmith Studio](https://docs.langchain.com/langgraph-platform/langgraph-studio))

**Taken.** The graph beside the conversation: every flows view lives in the chat shell, full screen or minimized to a card (`⌘K` opens chat; ruling FE-9). The agent drafts a change on the canvas from a sentence ("Change it…", `/`), shown as a ghost step with its code lines before you keep it.

**Left out.** Forking from a past state, for the same reason as Temporal's Reset.

## Trigger.dev

<a id="trigger-dev"></a>

**What it does.**
- Test from a task: a JSON payload editor, run options, and **Recent runs**, which "pre-populate the form from a previous run"; saved templates. ([run tests](https://trigger.dev/docs/run-tests))
- Run statuses split into initial, executing and final; Waiting runs "do not count against your concurrency limits." `runs.replay(runId)` makes a new run with the same payload, and "the new run will use the latest version of the task." Cancel also cancels children still running. ([runs](https://trigger.dev/docs/runs))

**Taken.** The retry dialog pre-fills the input from the run being retried. Retry latest is replay on the latest version.

## Airflow

<a id="airflow"></a>

**What it does.** "The Grid View is the primary interface for inspecting Dag runs and task states." "Each row represents a task, and each column represents a Dag run." The Graph View shows dependencies, with a run selector to see states change across runs. Clicking a task cell opens logs and lets you mark it successful, failed or cleared. ([UI overview](https://airflow.apache.org/docs/apache-airflow/stable/ui.html))

**Taken.**
- The flow's **Runs** tab is a grid: rows are steps, columns are the last 12 runs, cells are states. It shows at a glance that Lint links failed once and that two Mondays had nothing to note. A cell opens that run at that step.
- The flows list's "Last runs" strip, one bar per run.

**Left out.** Marking a step's state by hand. A journal records what happened; a person retries, never edits history.

## Our own prior art

- **The old app's run graph** drew the graph the engine recorded, with each node's state, and pointed "the camera on whichever node is running" (`apps/app/src/mainview/cards/FlowRunGraph.tsx`, `FlowGraphStatus.ts`, `RunForest.ts`, with `@xyflow/react` and `dagre`). The mock keeps that camera: when the graph is too small to read, it follows the live node.
- **The playground's run inspector** is "a time-first run inspector" (Will, ruling FLOW-6; `apps/playground/design/04-flows-inspector-waiting-light.png`): steps on a time axis, a journal bar with frame ticks, and the step's detail on the right. The run view keeps its journal bar and keys, and puts the graph above it, as Will asked for n8n's canvas.
- **The journal already carries the graph.** `flows.engine.plan-recorded` records each node's id, kind, action and `dependsOn` (`packages/smithers/flows/engine-store/src/PlanScheduler.ts:558-571`), and `@smthrs/gateway`'s `RunTrace.monitorFromJournal(run, records, at)` folds it into states at any sequence (`packages/smithers/gateway/src/RunTrace.ts`). This is why the run view can ship first.
