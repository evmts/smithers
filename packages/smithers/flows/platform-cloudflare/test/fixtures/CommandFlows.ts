/**
 * A run that calls a sandbox command the way the TODO agent's `run` tool
 * does: a step of the run executes the command's `SandboxCommand` job as its
 * own child execution (`execute` with an execution id of its own), so on
 * Cloudflare the job's executions live on their own objects. `warm` steps
 * before the call give the run a journal to replay, as a long agent's has.
 * The box is in memory: a command exits `exitAfterMs` after it starts.
 */
import { WebCrypto } from "@smthrs/crypto"
import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { SandboxCommand, type SandboxTools } from "@smthrs/sandbox"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as SqlClient from "effect/sql/SqlClient"
import { CloudflareRuntime, type ExecutionObject } from "../../src/index.ts"

/** The command's job: `{ target: { box }, call }`, with the sandbox's own probe schedule. */
export const Job = SandboxCommand.make("cloudflare-test/Command", { target: Schema.Struct({ box: Schema.String }) })

/** One warm-up step: the journal a run has before its call. */
export const Warm = Action.make("cloudflare-test/Warm", {
  payload: { index: Schema.Number },
  success: Schema.Number
})

/** The call: runs `command` as the job `command:<callId>` and answers its stdout. */
export const Call = Action.make("cloudflare-test/Call", {
  payload: { callId: Schema.String, command: Schema.String },
  success: Schema.String
})

type CallerFlow = Flow.Flow<
  "cloudflare-test/Caller",
  Schema.Struct<{ callId: typeof Schema.String; command: typeof Schema.String; warm: typeof Schema.Number }>,
  typeof Schema.String,
  typeof Schema.Never,
  Action.Requirement<"cloudflare-test/Warm" | "cloudflare-test/Call">
>

/** `warm` steps one after another, then the call. */
export const Caller: CallerFlow = Flow.make("cloudflare-test/Caller", {
  payload: { callId: Schema.String, command: Schema.String, warm: Schema.Number },
  success: Schema.String,
  body: Node.capture({}, ({ callId, command, warm }: { callId: string; command: string; warm: number }) => {
    let chain: Node.Node<unknown, never, unknown> = Node.succeed(0) as never
    for (let index = 0; index < warm; index++) {
      chain = (chain as never as Node.Node<number>).pipe(Node.andThen(Warm.call({ index }))) as never
    }
    return (chain as never as Node.Node<number>).pipe(Node.andThen(Call.call({ callId, command })))
  })
})

/** Every flow a host of these runs lists. */
export const flows: ReadonlyArray<Flow.Any> = [Caller, ...Job.flows]

/** What a suite reads back: when each call first ran and when it last answered, by call id. */
export interface Timeline {
  readonly called: Map<string, number>
  readonly answered: Map<string, number>
  /** How many times each call's step body ran: once, plus once per replay that reached it. */
  readonly runs: Map<string, number>
}

export const timeline = (): Timeline => ({ called: new Map(), answered: new Map(), runs: new Map() })

/** A box whose commands each exit `exitAfterMs` after they start, printing their command. */
export const box = (exitAfterMs: number): SandboxCommand.Commands => {
  const started = new Map<string, { readonly at: number; readonly command: string }>()
  return {
    start: (call, key) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        if (!started.has(key)) started.set(key, { at: now, command: call.command })
        return { pid: 4242, startedAt: Math.floor(started.get(key)!.at / 1000) }
      }),
    observe: (key, options) =>
      Effect.gen(function*() {
        const command = started.get(key)
        if (command === undefined) return { state: "lost" } as const
        // A read that may wait answers when the command exits, as the box's own does.
        const left = command.at + exitAfterMs - (yield* Clock.currentTimeMillis)
        if (left > 0 && (options?.waitMs ?? 0) > 0) yield* Effect.sleep(Math.min(left, options!.waitMs!))
        return (yield* Clock.currentTimeMillis) - command.at >= exitAfterMs
          ? { state: "finished", exitCode: 0, timedOut: false } as const
          : { state: "running", pid: 4242 } as const
      }),
    collect: (key) =>
      Effect.succeed({
        tool: "run" as const,
        exitCode: 0,
        timedOut: false,
        stdout: started.get(key)?.command ?? "",
        stderr: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        truncated: false
      }),
    cancel: () => Effect.void
  }
}

/** The flows' steps over `timeline` and a box whose commands exit after `exitAfterMs`. */
export const registration = (
  options: {
    readonly timeline: Timeline
    readonly commands: SandboxCommand.Commands
    readonly call?: "run" | "execute" | undefined
  }
) => {
  const { commands } = options
  const { answered, called, runs } = options.timeline
  const implementations = Layer.mergeAll(
    Warm.toLayer(({ index }) => Effect.succeed(index)),
    Call.toLayer(({ callId, command }) =>
      Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        if (!called.has(callId)) called.set(callId, now)
        runs.set(callId, (runs.get(callId) ?? 0) + 1)
        const runtime = yield* Effect.serviceOption(FlowRuntime.FlowRuntime)
        if (Option.isNone(runtime)) return yield* Effect.die("no flow runtime")
        const payload = { target: { box: "box" }, call: { tool: "run" as const, command } }
        const executionId = `command:${callId}`
        // `execute` always makes the job's execution: how a call ran before `run` (`options.call`).
        const job = options.call === "execute"
          ? Job.execute(payload, { executionId })
          : Job.run(payload, {
            executionId,
            operations: SandboxCommand.operations(() => Effect.succeed(commands)),
            // As long as the command may run, as the TODO agent's tool waits: only the drive's budget bounds it.
            wait: "1 hour"
          })
        const result =
          yield* (job as Effect.Effect<typeof SandboxTools.RunResult.Type, unknown, FlowRuntime.FlowRuntime>).pipe(
            Effect.provideService(FlowRuntime.FlowRuntime, runtime.value),
            Effect.provide(WebCrypto.layer),
            Effect.orDie
          )
        answered.set(callId, yield* Clock.currentTimeMillis)
        return result.stdout
      })
    )
  )
  return Layer.mergeAll(
    Interpreter.layerWithImplementations(Caller, implementations),
    Job.toLayer(SandboxCommand.operations(() => Effect.succeed(commands))).pipe(
      Layer.provideMerge(Action.layerImplementations)
    )
  )
}

/** The runtime an alarm builds: one execution, over `database`, every alarm's on the same box. */
export const runtime = (options: {
  readonly timeline: Timeline
  readonly exitAfterMs: number
  readonly database: Layer.Layer<SqlClient.SqlClient>
  readonly call?: "run" | "execute" | undefined
}) => {
  const commands = box(options.exitAfterMs)
  return (intent: ExecutionObject.Intent) =>
    CloudflareRuntime.layer(
      // The intent's flow, so building the runtime recovers that flow's wakes alone, as a deployment's objects do.
      { hostId: `object-${intent.executionId}`, executionId: intent.executionId, flow: intent.flow },
      registration({ timeline: options.timeline, commands, call: options.call })
    ).pipe(Layer.provide(options.database))
}
