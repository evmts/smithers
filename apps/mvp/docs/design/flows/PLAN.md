# Flows UI: build plan

Status: proposed, 2026-10-20. Nothing here is built. The design is the [mock](flows-ui.html); what it borrows, and from where, is in [RESEARCH.md](RESEARCH.md). Screenshots of each state, light and dark, desktop and phone, are in `screenshots/<state>-<theme>-<device>.png`.

**In one sentence:** ship the run view first, because the journal already records each run's graph; then the editor, whose canvas is drawn from `Flow.make` source and whose every edit is a source edit; both as first-party plugins on decision 0017's public interface.

**In one paragraph:** every run already journals its plan as a graph (`flows.engine.plan-recorded`, with each node's `dependsOn`), and `@smthrs/gateway` already folds that journal into node states at any sequence (`RunTrace.monitorFromJournal(run, records, at)`). So slice 1 is a graph renderer in `@smthrs/ui` and an adapter: no new table, no new engine event. The editor comes after it and is harder, because it must read a graph out of TypeScript (`Graph.build` from `@smthrs/core`) and write canvas edits back into that TypeScript without a second graph model. Five `@smthrs/ui` components carry both: a graph canvas, a step inspector, a journal scrubber, an extended waterfall and a runs grid.

## What the recordings show today

From `~/Desktop/smithers-mvp/videos/flows/*.mp4`, frames read 2026-10-20:

| Seen | Where | Fix in this plan |
|---|---|---|
| Every personal flow's run is titled `flow/run`, with steps `flow/run/load` and `flow/run/prompt`, never the flow's own name | `/app/runs/<id>` | Slice 1: the header and steps name the flow ref, `ready-mvhb4s88` |
| A running step shows `51 ms` and stays there; the same step appears twice in the list | Steps tab | Slice 1: the graph and waterfall read the journal's open spans |
| The input is a `38 B` box, and the step input is raw JSON with a `digest` | Run page | Slice 1: Input, Output, Logs and Attempts tabs per step, values through `JsonValue` |
| Each row repeats Run, Edit, Code and Delete as text; no last run, success or trigger | `/app/flows` | Slice 3 |
| The draft card's checks read `parses`, `name`, `calls`, `model`, `size` | Draft card | Slice 6: the canvas shows the draft; checks show only when one fails |
| Three toasts and `+21` cover about a third of every frame | Every screen | Not flows work; it belongs to decision 0009's toast stack |

## Plugins (decision 0017)

The flows editor and the run view ship as two first-party plugins, `flows` and `runs`, exactly as 0017's table lists them. They are compiled into the build (the `component` renderer) but use only what the frame bridge exposes, so slice 3 of 0017 can prove parity with the same views drawn from outside the build.

| Plugin | Views | Commands and keys | Flows it calls (none of its own core) |
|---|---|---|---|
| `flows` | `flows/list` at `/app/flows` and `/<owner>/<repo>/actions`; `flows/editor`; `flows/runs-grid` | `/flow.new`, `/flow <name>`; `a`, `.`, `p`, `e`, `\`, `/`, `⌘↵` while `view == flows/editor` | `flow/new`, `flow/answer`, `flow/try`, `flow/save`, `flow/propose`; reads `flows/source`, `core/runs` |
| `runs` | `runs/run` at `/app/runs/<id>` and the GitHub path `/<owner>/<repo>/actions/runs/<id>` | `[`, `]`, `space`, `l`, `t`, `⇧R`, `⇧S` while `view == runs/run` | `run/cancel`, `run/retry`, `run/resume`, `run/answer` (all core); reads `run/inspect` |

- **Every view lives in the chat shell** (FE-9): full screen, and minimized to a card in the conversation. The mock's `—` button and `⌘K` chat show both states.
- **What 0017's slice 1 host lacks.** Views, slots, commands, keybindings and view events land in 0017's slice 1, so the run view and editor need nothing more. Editing a flow's **triggers** (the schedule and GitHub-event doors on the canvas) writes `contributes.triggers` in `plugin.json`, which 0017 lands in slice 2. Until then the canvas draws triggers read-only. The flow over flows needs 0017 slice 2 too (`run.*` triggers and `run/inspect` for flows).
- **Deletion test.** Deleting `plugins/flows` leaves runs working, and deleting `plugins/runs` leaves the editor working with no run links. Each plugin's e2e suite runs with the other deleted.

## `@smthrs/ui` components to add

| Component | What it is | Built from | Notes |
|---|---|---|---|
| `FlowGraph` (the graph canvas) | Nodes and typed edges; pan, zoom, fit; arrow keys move along edges; `stateOf`, `metaOf`, edge labels; follows the live node when the graph is too small to read | `WorkflowNode` anatomy in `src/canvas/WorkflowCanvas.tsx`; layout in a framework-free module beside it, `graphLayout.ts`, so the TUI draws the same graph | Layout is a pure function of the graph: longest-path ranks, barycenter order, each node at its parents' mean. Direction is whichever shows the graph larger in its pane. The mock's `layoutGraph` and `GraphView` are the prototype |
| `StepInspector` (the node inspector) | Kind icon, name, tag, lock and pin flags, state; tabs; actions | `Tabs`, `JsonValue`, `SpanDetail` (waits), `FlowFormView` (settings) | Editor tabs: Settings, Input, Output. Run tabs: Output, Input, Logs, Attempts. Settings render from each step kind's options schema through `FlowFormView`, so a new step kind needs no new form code |
| `JournalScrubber` | A tick per journal event, a head, Live, Replay; `[`/`]` by event, `⇧[`/`⇧]` by step | The playground's journal bar (FLOW-6) | Read-only: it sets `at`, never forks or rewinds |
| `RunWaterfall` (extend) | Attempt segments, hatched waits, child rows for an agent's cells, a cursor at the scrub time | `src/run-page/RunWaterfall.tsx`, `runPage.ts`'s `waterfallBars` | Additive props; today's callers are unchanged |
| `RunsGrid` | Rows are steps, columns are runs, cells are states; a cell opens that run at that step | new | Airflow's grid view |

Also used as they are: `RunHeader`, `RunJournal`, `RunStatusPill`, `RunList`, `CommandPalette` (the step palette), `Textarea` with `code` (editing `flow.ts`), and `@smthrs/repo-view`'s `CodeFileView` (reading it).

**Library choice** (root `AGENTS.md`: name the catalog entry). The catalog has no entry for graph layout or rendering. The old app used `@xyflow/react` and `dagre` (`apps/app/src/mainview/cards/FlowRunGraph*.tsx`). `FlowGraph` hand-rolls both instead, and the change says why: the graphs are DAGs of tens of nodes and are read far more than dragged; xyflow brings its own node-state store beside TanStack DB; and a new dependency needs the 7-day rule and a maintainer's approval. The layout and renderer are about 170 lines in the mock. Revisit if a graph passes a few hundred nodes.

## How the canvas derives from `Flow.make` source and writes back

**Code is the truth.** The canvas stores nothing: no positions, no node list, no second graph model (root `AGENTS.md`, "Flow layering"). Undo is source undo.

**Reading source into a graph.**
1. `Graph.build(flow, payload)` from `@smthrs/core` (catalog: "Inspect a flow before it runs: build its graph") evaluates the body once with the payload and strict placeholders. It runs no I/O, expands both arms of every `Node.branch`, and gives plan drafts whose `Ref` inputs are the edges.
2. Each node carries its `DeclarationSite` (file and line, `packages/smithers/flows/flow/src/internal/DeclarationSite.ts`), so selecting a node selects its lines and clicking a line selects its node.
3. **Where it runs.** The app's own flows build in the app's realm. A person's or a repository's `flow.ts` builds in the QuickJS realm, where 0017 runs all flow code that isn't compiled in. Building runs the body's plan-time code, so it is code execution and gets the realm's bounds.
4. **The payload.** The Try payload when there is one, else a sample decoded from the payload schema. Topology that depends on the payload, such as a fan-out over items, draws as one node marked `× n`.

**Writing a canvas edit into source.**
1. Each canvas action is a typed source edit, a codemod: add a step (its declaration and one `Node.andThen` link), remove one, insert a `Node.branch` (the rest of the chain moves into `then`), set an option (`retryPolicy`, `model`, `prompt`, `command`, `deadline`), rename, and edit a door in `plugin.json`.
2. Edits splice text by span. They never reprint the file, so hand formatting and comments survive.
3. **Fail closed.** After an edit, build the graph again and compare it with the intended graph through `PlanDiff.diff` from `@smthrs/plan`. If they differ, refuse the edit and leave the file as it was.
4. **What it can't draw stays read-only.** A node whose code no codemod understands, such as a custom combinator or a computed call, draws with "Edit in code". A parse error dims the canvas, keeps the last good graph and names the line, as the mock's banner does.
5. **Capabilities move with steps.** Adding an HTTP or sandbox step widens `capabilities` in the same edit, and the highlighted diff shows it before Propose.

**The parser.** Codemods need a TypeScript AST with spans. Two designs:
- **TypeScript's compiler API.** Exact grammar, already in the tree. Too big to load at boot.
- **`oxc-parser` (WebAssembly).** Smaller and faster. In the lockfile only as a dependency of `knip`, a dev tool; no package uses it.

Measure both against one bar: the editor's chunk under 1 MB gzipped, loaded only when the editor opens, in the engine worker. Pick the one that passes; the compiler API wins a tie. The code lives in `@smthrs/core` as `FlowSource` (`read`, `edit`), platform-neutral, so the agent's own flow edits use the same codemods (FLOW-3).

The mock's regex parser is a prototype for the format the codemods write. It round-trips: parsing the generated `flow.ts` and generating it again gives the same bytes.

**SDK gaps to fix upstream first** (SDK-1). The mock's palette writes four constructors that don't exist yet:

| Palette entry | Exists today | Gap |
|---|---|---|
| Agent | `AgentAction.make` | none |
| Model | `Flow.make(tag, { prompt, model })` | none |
| Child flow | `Other.child(payload)` | none |
| Condition | `Node.branch({ if, then, else })` | none |
| Ask a person | `HumanTask.action` | `HumanTask.as(name, { kind, prompt, deadline })`: a named, typed step that passes its input through on a yes and fails on a no |
| Sandbox command | `@smthrs/std`'s `Bash` is a descriptor (`Bash.flow`), not a declaration | `Std.Bash.as(name, { command, deadline })` |
| HTTP request | `Fetch` and `HttpPost` are descriptors | `Std.Fetch.as(name, { url, success })`, secrets by name through the egress |
| Wait | `DurableClock.sleep` | `DurableClock.as(name, { duration })` |

## Slices, run view first

Each slice lands on `main` with unit tests, an e2e test against the real app, a GIF, observability (counts and spans, never values) and docs.

1. **The run graph, read-only, from existing journals.**
   - An adapter from `RunInspection`'s journal page to the records `RunTrace.monitorFromJournal` folds, or that fold moved to read `RunInspection.Event` directly. One fold, used by the app, the TUI and the CLI.
   - `FlowGraph`, `StepInspector` (run tabs), `JournalScrubber`, and the extended `RunWaterfall`.
   - The run page's default pane becomes the graph above the timeline, with the step's detail on the right. The journal tab stays.
   - Port the tested logic, not the components, from `apps/app`'s `FlowGraphStatus.ts` and `RunForest.ts` (child runs).
   - Fix the `flow/run` title.
   - Proves: a drafted flow's run shows its graph lit live, scrubs to any event, and `smthrs runs devtools` shows the same states.
2. **Acts on the graph.** Stop, Retry and Retry latest from the header (they exist); Resume where it applies; answer a person's wait from its node (`run/answer`); Pin to editor. Retry from here waits for the [open question](#open-question-for-will).
3. **The flows list and runs grid.** Doors per flow, the last runs strip, success rate and last run, from 0009's `runs` rows; `RunsGrid` on the flow's Runs tab. `j`/`k`/`↵`/`r`/`n`.
4. **The editor, read-only.** `FlowSource.read` in the realm, the canvas beside `flow.ts` with node-and-line selection, the inspector's Input and Output from the last run.
5. **Editing.** Codemods, the step palette (`a` and the edge **+**), Settings through `FlowFormView`, undo, the "Can't draw" banner. Try on the person's engine, Run step and pins. Pins live in the person's draft state, never in source or a repository, and a real run never reads them. Try never runs a system step. Needs the four SDK constructors above.
6. **Drafting on the canvas.** `flow/new` rounds produce a source diff, drawn as ghost steps with highlighted lines and Keep or Discard; the agent's assumed answers show as chips (FLOW-4).
7. **Flows over flows.** The `needs-you/curate` view, watched runs as a group in the graph, "Watched by" on each run. Needs 0017 slice 2.

## Open question for Will

**May a run be retried from a step?** Inngest's "rerun from step" is the most useful debugging act in the research: a new run that reuses the journal's results before the step, with that step's input editable, leaving the old run untouched. Mechanically it is a fork (`@smthrs/time-travel`'s `fork`), and user-facing fork controls are removed (root `AGENTS.md`, "Libraries we keep"). The mock shows it as **Retry from here**, a new linked run (`T13·2`) whose reused steps are marked. Recommendation: allow it, because it never rewinds or edits history and it reads as a retry. Until Will rules, slice 2 ships whole-run Retry only.

## Decisions taken here

- The graph is above the timeline on the run view, and the timeline is always visible: the canvas Will asked for, with the playground's time-first inspector (FLOW-6) kept below it.
- Layout direction is automatic, never a setting.
- When the whole graph won't fit at a readable size, the camera follows the live node, as the old app's run graph did.
- Try is a test run on the person's device. It uses pins, stops before system steps, and is kept apart from the flow's real runs.
- Minimal text: no explanatory copy on any screen; state is a pill, a glyph, a bar or a count.
