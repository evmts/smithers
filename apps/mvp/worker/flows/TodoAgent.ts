import { Agent, AgentAction, Budget, QuotaPolicy, Seat, SeatResolver } from "@smthrs/agent"
import { Uuid, WebCrypto } from "@smthrs/crypto"
import { FlowRuntime } from "@smthrs/flow"
import { FlowBinding, Notifications, type Sandbox } from "@smthrs/harness"
import { Evaluator } from "@smthrs/model"
import { NotificationQueue } from "@smthrs/notifications"
import { Registry } from "@smthrs/registry"
import { SandboxTools } from "@smthrs/sandbox"
import { Effect, Layer, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { CHECKS_DIRECTORY } from "../../src/features/pulls/contract.ts"
import { Machines } from "../branch/Machines.ts"
import type { Seat as EndpointSeat } from "../ModelEndpoint.ts"
import * as Machine from "./TodoMachine.ts"

// The `todo` run's implement step (decision 0016, the factory simplified): the agent (`AgentAction` from
// `@smthrs/agent`, the library catalog's "Run an agent loop with tools") writes the TODO's change on its branch's machine.
// Its tools are the sandbox tools (`@smthrs/sandbox`'s `SandboxTools`), bound in process to the attempt's machine
// (`Machines`), so each call runs on the branch's checkout as the person who committed the TODO, and a command runs once
// per call even when the run resumes (the call's id is its replay-stable identity). The model is the `coding` role
// (the `agent` role's model until an admin sets it, decision 0033), admitted and metered in process as the model
// endpoint's calls are (`ModelEndpoint.local`).

/** The seat the step declares, which the host answers with the model endpoint's `coding` role (worker/Executions.ts). */
export const AGENT_SEAT = "agent"

/** The context window the agent compacts against, as the browser agent's (src/features/agent/host.ts). */
export const CONTEXT_WINDOW_TOKENS = 32_768

/** The most tool calls one cell may make. */
export const MAX_CALLS_PER_CELL = 8

/** The most frames (model turns) one attempt's agent takes before it must answer. */
export const MAX_FRAMES = 40

/** The longest the agent works on one attempt. */
export const IMPLEMENT_TIMEOUT = "40 minutes"

/** The namespace a tool call's id is a version 5 UUID of its replay-stable identity in. */
export const TOOL_CALL_NAMESPACE = "8d2f6c41-9a3e-4b57-b1c0-7e5a2d9f3c68"

/** What the step is given: the attempt and what `todo/Begin` read and made. */
export const ImplementPayload = {
  attemptId: Schema.String,
  todoId: Schema.String,
  repoId: Schema.String,
  number: Schema.Int,
  title: Schema.String,
  prompt: Schema.String,
  acceptance: Schema.Array(Schema.String),
  branch: Schema.String,
}

/** What the agent answers: one paragraph on what it changed and how it tested it. */
export const Implemented = Schema.Struct({ summary: Schema.String })

/** The agent's instructions: what it works on, how it may act, and when it is done. */
export const SYSTEM = [
  "You implement one TODO in a git repository checked out on a machine. Every capability is a ctx.call to a sandbox " +
  "tool on that checkout: sandbox/list, sandbox/read, sandbox/write, sandbox/run, sandbox/status and sandbox/diff. " +
  "Paths are relative to the checkout.",
  "Read before you write. Make the smallest change that does the TODO, and keep the repository's style. Never commit, " +
  "push or create branches: Smithers commits what you leave in the working copy and opens the pull request.",
  `Run the repository's checks before you finish: each executable file in ${CHECKS_DIRECTORY}/ (run it with sh), and ` +
  "the tests its README or package files name. Fix what they find.",
  "Finish with a one-paragraph summary of what you changed and how you tested it.",
]

/** The step's task, from the TODO. */
export const promptOf = (payload: Schema.Struct.Type<typeof ImplementPayload>): string =>
  [
    `TODO T${payload.number}: ${payload.title}`,
    "",
    payload.prompt,
    ...(payload.acceptance.length === 0 ? [] : ["", "Done when:", ...payload.acceptance.map((line) => `- ${line}`)]),
  ].join("\n")

/** `todo/Implement`: the agent writes the TODO's change on its branch's machine. */
export const Implement = AgentAction.make("todo/Implement", {
  payload: ImplementPayload,
  output: Implemented,
  seat: AGENT_SEAT,
  system: SYSTEM,
  prompt: promptOf,
  maxFrames: MAX_FRAMES,
  timeout: IMPLEMENT_TIMEOUT,
})

/** A tool the machine refused or couldn't run: the agent sees its kind only. */
export class ToolFailed extends Schema.TaggedError<ToolFailed>()("@smthrs/mvp/todo/ToolFailed", {
  reason: Schema.String,
}) {}

const empty = Schema.Struct({})

/** The tools the agent calls, as flow declarations: each one sandbox tool's input and result. */
const TOOLS = [
  {
    tool: "run",
    input: Schema.Struct({
      command: SandboxTools.Run.fields.command,
      cwd: SandboxTools.Run.fields.cwd,
      timeoutSeconds: SandboxTools.Run.fields.timeoutSeconds,
    }),
    output: SandboxTools.RunResult,
    description: "Run a shell command in the checkout. Answers { exitCode, timedOut, stdout, stderr, stdoutBytes, " +
      "stderrBytes, truncated }: the first 64 KiB of each stream. It stops after timeoutSeconds (60 unless set, 600 " +
      "at most).",
  },
  {
    tool: "read",
    input: Schema.Struct({ path: SandboxTools.Read.fields.path }),
    output: SandboxTools.ReadResult,
    description: "Read a file of the checkout. Answers { path, content, bytes, truncated }: the first 1 MiB as text.",
  },
  {
    tool: "write",
    input: Schema.Struct({ path: SandboxTools.Write.fields.path, content: SandboxTools.Write.fields.content }),
    output: SandboxTools.WriteResult,
    description: "Write a whole file in the checkout, making its folders; it replaces what was there. Answers " +
      "{ path, bytes }.",
  },
  {
    tool: "list",
    input: Schema.Struct({ path: SandboxTools.List.fields.path }),
    output: SandboxTools.ListResult,
    description: "List a folder of the checkout, the checkout itself unless path is set. Answers { path, entries: " +
      "[{ name, kind, bytes }], truncated }.",
  },
  {
    tool: "status",
    input: empty,
    output: SandboxTools.StatusResult,
    description: "Show the checkout's git status. Answers { branch, entries: [{ path, index, worktree, from? }] }.",
  },
  {
    tool: "diff",
    input: Schema.Struct({ paths: SandboxTools.Diff.fields.paths }),
    output: SandboxTools.DiffResult,
    description: "Show the checkout's changes since its last commit as a unified diff, new files included. Answers " +
      "{ diff, bytes, truncated }: the first 256 KiB.",
  },
] as const

/** The call id of a tool call: the version 5 UUID of its replay-stable identity, so a resumed run runs it once. */
export const callIdOf = (identity: { readonly session: string; readonly frame: number; readonly cell: string; readonly ordinal: number }) =>
  Uuid.v5(TOOL_CALL_NAMESPACE, `${identity.session}:${identity.frame}:${identity.cell}:${identity.ordinal}`).pipe(
    Effect.provide(WebCrypto.layer),
  )

/**
 * The sandbox tools, bound to the machine of the attempt whose run calls them: the current execution's attempt
 * (`todo:<attemptId>`), whose branch and committer `TodoMachine.ofExecution` reads.
 */
export const machineBindings = <E, R>(
  machines: Machines["Service"],
  resolve: (executionId: string) => Effect.Effect<Option.Option<Machine.TodoMachine>, E, R>,
) =>
  TOOLS.map((entry) =>
    FlowBinding.make({
      flow: {
        name: `sandbox/${entry.tool}`,
        description: entry.description,
        input: entry.input,
        output: entry.output,
        capabilities: [],
        effects: undefined,
      },
      handler: (input: object, call) =>
        Effect.gen(function* () {
          const instance = yield* Effect.serviceOption(FlowRuntime.FlowInstance)
          if (Option.isNone(instance)) return yield* new ToolFailed({ reason: "no_run" })
          const machine = yield* resolve(instance.value.executionId).pipe(
            Effect.mapError(() => new ToolFailed({ reason: "unavailable" })),
          )
          if (Option.isNone(machine)) return yield* new ToolFailed({ reason: "no_machine" })
          // SHA-1 over a few bytes failing is the platform's defect, not the call's.
          const callId = yield* Effect.orDie(callIdOf(call.identity))
          const ran = yield* machines.tool(machine.value.branch, machine.value.ownerId, callId, {
            ...input,
            tool: entry.tool,
          } as SandboxTools.Call).pipe(
            Effect.mapError((error) => new ToolFailed({ reason: "reason" in error ? String(error.reason) : error._tag })),
          )
          return ran.result as never
        }),
      // The agent sees why a tool failed as its kind only.
      publicError: (error) => error.reason,
    })
  )

/** The TODO agent resolves its attempt through Postgres; other agents reuse the same public tools. */
export const bindings = <E>(machines: Machines["Service"], database: Layer.Layer<SqlClient.SqlClient, E>) =>
  machineBindings(machines, (executionId) => Machine.ofExecution(executionId).pipe(Effect.provide(database)))

/**
 * The step's host: no registry and no other flows, the sandbox tools on the attempt's machine, and the cell limits.
 * Needs the host's `Machines`, and what `database` needs.
 */
export const host = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Layer.effect(
    AgentAction.Host,
    Effect.gen(function* () {
      const machines = yield* Machines
      // The database's own requirements, captured here, so a tool call needs nothing of the agent's context.
      const context = yield* Effect.context<R>()
      return AgentAction.makeHost({
        registry: Registry.makeNoop(),
        flows: [FlowBinding.source("machine", bindings(machines, Layer.provide(database, Layer.succeedContext(context))))],
        limits: { calls: MAX_CALLS_PER_CELL },
        capabilityEnvelope: [],
        maxFrames: MAX_FRAMES,
      })
    }),
  )

/** One seat, `agent`, answered by `seat` (the model endpoint's role in process); any other seat is unresolved. */
export const seats = (seat: EndpointSeat) =>
  SeatResolver.layer({
    resolve: (id) =>
      id === AGENT_SEAT
        ? Effect.succeed(Seat.make({
          id: AGENT_SEAT,
          modelId: AGENT_SEAT,
          model: seat.model,
          route: seat.route,
          contextWindowTokens: CONTEXT_WINDOW_TOKENS,
        }))
        : Effect.fail(new Seat.SeatUnresolved({ seat: id, message: "The todo run has one seat, agent." })),
  })

/**
 * How a person steers the agent (ruling TODO-3, docs/features/runs.md#steering): the run's own durable notification
 * queue, over the engine's journal, read at each of the agent's turn boundaries for the execution it works in
 * (`Notifications.layerForExecution`). A Member's message admitted to `todo:<attempt id>` (worker/RemoteRuns.ts) reaches
 * that attempt's agent at its next turn, once, and a replay delivers what the first drain delivered.
 */
export const steering = Notifications.layerForExecution().pipe(Layer.provide(NotificationQueue.layer))

/**
 * `todo/Implement`'s implementation over `seat`, `database` and the host's `Machines`, with `sandbox`, the agent's cell
 * sandbox (`Agent.layerSandbox` in Node; the QuickJS build a Worker bundles, `Agent.layerSandboxWithVariant`, on
 * Cloudflare), and `steering` over the engine's `Journal`. Quota refusals park the step; the endpoint holds the budget.
 */
export const registration = <E, R, SE, SR>(
  seat: EndpointSeat,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  sandbox: Layer.Layer<Sandbox.Sandbox, SE, SR>,
) =>
  Implement.layer.pipe(
    // Steering first: the first layer that provides the agent's `Steering.Source` is the one it drains.
    Layer.provide(Layer.mergeAll(host(database), seats(seat), Agent.layer, steering)),
    Layer.provide(Layer.mergeAll(QuotaPolicy.layerDefault(), Budget.layerUnbounded())),
    Layer.provide(Layer.mergeAll(sandbox, Evaluator.layerUnavailable())),
  )
