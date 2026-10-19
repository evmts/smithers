// D-2: plain host factories call sibling TypeScript catalog, plugin, timeout and event helpers.
import * as SmithersPlugin from "@smthrs/agent/SmithersPlugin"
import * as StandardFlows from "@smthrs/agent/StandardFlows"
import * as AgentEvent from "@smthrs/harness/AgentEvent"
import * as FlowBinding from "@smthrs/harness/FlowBinding"
import * as Sandbox from "@smthrs/harness/Sandbox"
import * as ModelRequest from "@smthrs/model/ModelRequest"
import { Effect, Schema } from "effect"
import * as Agents from "./agents.ts"
import * as Extension from "./extension.vibe"
import type { DelegateModel } from "./models.ts"
import type * as Monitors from "./monitors.ts"
import * as Panels from "./panels.vibe"
import type { Vendor } from "./wrapped.ts"
import { waiting, publicError, requestFlows, failureReason } from "./runtime.vibe"
import type { Ports } from "./runtime.vibe"
export const boundedBindingImpl = (binding: FlowBinding.Binding, callMs: number): FlowBinding.Binding =>
  waiting.includes(binding.descriptor.name) ? binding : {
    ...binding,
    run: (call) => {
      const limit = Sandbox.callLimit(callMs, call)
      return binding.run(call).pipe(Effect.timeoutOrElse({
        duration: limit,
        orElse: () => Effect.succeed(Sandbox.callTimedOut(call.flowName, limit))
      }))
    }
  }
export const pluginsImpl = (ports?: Ports, callMs?: number) => [
  SmithersPlugin.make(ports?.flows),
  ...(callMs === undefined ? [] : [{
    name: "tui-call-ceiling",
    apply: "harness" as const,
    hooks: {
      cellFlows: (bindings: ReadonlyArray<FlowBinding.Binding>) =>
        Effect.succeed(bindings.map((binding) => boundedBindingImpl(binding, callMs)))
    }
  }])
]
const short = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))
const bind = <I extends Schema.Top & Schema.ConstraintDecoder<unknown, never>>(
  name: string,
  description: string,
  input: I,
  handle: (input: I["Type"], signal?: AbortSignal) => unknown,
  /** Consequential capabilities the approval gate asks for; see `Approvals.requests`. */
  capabilities: ReadonlyArray<string> = [],
  interruptible = false
): FlowBinding.Binding => {
  return FlowBinding.make({
    flow: {
      name,
      description,
      input,
      output: Schema.Unknown,
      capabilities,
      effects: { reads: [], writes: [], tier: "irreversible", mode: "expected", onConflict: "serialize" }
    },
    handler: (input) => {
      // A typed refusal keeps its code: `unknown_agent: No agent named x`.
      const caught = (cause: unknown) =>
        cause instanceof Agents.AgentError
          ? new Error(`${cause.code}: ${cause.message}`)
          : cause instanceof Error
          ? cause
          : new Error("Runtime request failed")
      // Optional fields arrive as `undefined`, which a cell result cannot carry.
      const clean = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as unknown
      if (interruptible) {
        return Effect.tryPromise({ try: async (signal) => clean(await handle(input, signal)), catch: caught })
      }
      return Effect.flatMap(Effect.try({ try: () => handle(input), catch: caught }), (value) =>
        value instanceof Promise
          ? Effect.tryPromise({ try: async () => clean(await value), catch: caught })
          : Effect.try({ try: () => clean(value), catch: caught }))
    },
    publicError
  })
}
const publishInput = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("panel"),
    placement: Schema.optional(Schema.Literals(["tab", "card"])),
    panel: Panels.Panel
  }),
  Schema.Struct({ kind: Schema.Literal("status"), status: Extension.Status }),
  Schema.Struct({ kind: Schema.Literal("key"), key: Extension.Key }),
  Panels.Panel
])
export const sourceImpl = (ports: Ports): FlowBinding.Source =>
  FlowBinding.source("tui/runtime", [
    bind(
      "ui.publish",
      "Create or update custom terminal UI; returns immediately. A bare panel is a tab; {kind:\"panel\",placement:\"card\",panel} is a live chat card; {kind:\"status\",status} is a footer item; {kind:\"key\",key} is a key. Same id replaces it without stealing focus. Use one sentence and concise rows with expandable code, tables, text or diffs.",
      publishInput,
      (input) => {
        const contribution = Extension.decode(input)
        ports.publish(contribution)
        const id = contribution.kind === "panel"
          ? contribution.panel.id
          : contribution.kind === "status"
          ? contribution.status.id
          : contribution.key.id
        return { id, status: "published" }
      }
    ),
    ...(ports.monitors === undefined ? [] : [
      bind(
        "monitor.create",
        "Watch a source and tell the user only when something notable happens; returns immediately. Jev judges each change against watch; Luna writes the one-line update. source is {kind:\"tab\",id} (a worker tab), {kind:\"run\",id} (a smithers.run id) or {kind:\"shell\",command}. trigger is {kind:\"events\"} (default for tab and run) or {kind:\"interval\",seconds} (10 to 86400; required for shell, default 60). Reuse id to deduplicate or restart a stopped or failed monitor.",
        Schema.Struct({
          id: short,
          title: short,
          watch: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
          source: Schema.Union([
            Schema.Struct({ kind: Schema.Literal("tab"), id: short }),
            Schema.Struct({ kind: Schema.Literal("run"), id: short }),
            Schema.Struct({
              kind: Schema.Literal("shell"),
              command: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000))
            })
          ]),
          trigger: Schema.optional(Schema.Union([
            Schema.Struct({ kind: Schema.Literal("events") }),
            Schema.Struct({ kind: Schema.Literal("interval"), seconds: Schema.Number })
          ]))
        }),
        (input) => ports.monitors!.create(input),
        // A shell source runs its command every tick: the gate asks, per call.
        ["proc:spawn:*"]
      ),
      bind(
        "monitor.list",
        "List monitors: id, title, status, update count and any failure.",
        Schema.Struct({}),
        () => ports.monitors!.list()
      ),
      bind(
        "monitor.stop",
        "Stop a monitor.",
        Schema.Struct({ id: short }),
        (input) => ports.monitors!.stop(input.id)
      )
    ]),
    ...(ports.delegate === undefined ? [] : [
      bind(
        "agent.delegate",
        "Request background work in a separate agent tab and return immediately. Six run at once by default; more queue FIFO. Reuse id to deduplicate. agent names one of the Agents in your context to run with its own prompt, model and flows. harness runs it on Claude Code or Codex with their own tools, only when the person names one. Workers may wait with agent.wait; the coordinator must not wait. When the person names a model, pass model and pinned: true so it runs there even with no credit. Otherwise omit pinned.",
        Schema.Struct({
          id: short,
          title: short,
          prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32_000)),
          model: Schema.optional(short),
          pinned: Schema.optional(Schema.Boolean),
          agent: Schema.optional(short),
          harness: Schema.optional(Schema.Literals(["claude", "codex"]))
        }),
        (input) => ports.delegate!(input)
      ),
      bind(
        "tab.read",
        "Read a background agent's status, summary and recent cells. Does not wait. Do not poll in a loop; return to the user while it runs.",
        Schema.Struct({ id: short }),
        (input) => ports.read!(input.id)
      ),
      ...(ports.retry === undefined ? [] : [
        bind(
          "tab.retry",
          "Run a failed or stopped background tab or flow run again, with its original task and model, when the user asks for it. Returns its new status at once; requested or queued is not started.",
          Schema.Struct({ id: short }),
          (input) => ports.retry!(input.id)
        )
      ]),
      bind(
        "tab.list",
        "List the background agent tabs and their actual status. Does not wait. Do not poll; the UI shows progress.",
        Schema.Struct({}),
        () => ports.list!()
      ),
      ...(ports.answer === undefined ? [] : [bind(
        "agent.answer",
        "Answer a child's ask, delivered to you as a message or in agent.wait's result, by its id.",
        Schema.Struct({ id: short, answer: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_000)) }),
        (input) => ports.answer!(input.id, input.answer)
      )]),
      ...(ports.wait === undefined ? [] : [bind(
        "agent.wait",
        "Wait for child tabs to settle. Pass child request ids; returns each id, status, answer or message. A child's ask returns it early with ask {id, question, options}: answer it with agent.answer, then wait again. Waiting releases this worker's pool slot.",
        Schema.Struct({ ids: Schema.Array(short).check(Schema.isMinLength(1)) }),
        (input, signal) => ports.wait!(input.ids, signal),
        [],
        true
      )])
    ])
  ])
const record = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const ledgerImpl = (maxFrames: number): (event: AgentEvent.AgentEvent) => AgentEvent.AgentEvent => {
  const started = new Map<string, { readonly verdict: string; readonly id: string; readonly title: string }>()
  const failed = new Map<string, string>()
  const requested = new Map<string, string>()
  let completed = false
  const key = (identity: { readonly frame: number; readonly cell: string; readonly ordinal: number }) =>
    `${identity.frame}:${identity.cell}:${identity.ordinal}`
  return (event) => {
    switch (event._tag) {
      case "cell-call-started": {
        const verdict = requestFlows[event.call.flowName]
        if (verdict === undefined) return event
        const input = record(event.call.input)
        const id = String(input.id ?? "")
        const title = String(input.title ?? input.flow ?? id)
        started.set(key(event.call.identity), { verdict, id, title })
        return event
      }
      case "cell-call-settled": {
        const request = started.get(key(event.identity))
        if (request === undefined) return event
        const label = `${request.verdict}::${request.id}`
        if (event.result.outcome === "success") {
          failed.delete(label)
          requested.set(request.id, request.title)
        } else {
          failed.set(label, `${request.verdict}: ${request.title} (${failureReason(event.result.message)})`)
        }
        return event
      }
      case "transition-applied":
        completed = event.transition._tag === "complete"
        return event
      case "resolved": {
        if (completed && failed.size === 0) return event
        const lines = [
          ...(completed ? [] : [`Stopped after ${maxFrames} frames.`]),
          ...failed.values(),
          ...[...requested.values()].map((title) => `Requested: ${title}`)
        ]
        return new AgentEvent.Resolved({
          eventType: event.eventType,
          message: ModelRequest.Message.assistant(lines.join("\n"), { stopReason: "stop" })
        })
      }
      default:
        return event
    }
  }
}
