import { WebCrypto } from "@smthrs/crypto"
import { Action, FlowRuntime } from "@smthrs/flow"
import { SandboxCommand, type SandboxTools } from "@smthrs/sandbox"
import { Effect, Layer, Option, Schema } from "effect"
import type * as Crypto from "effect/Crypto"
import { MachineFailure, Machines } from "../branch/Machines.ts"
import { SandboxBranch } from "../branch/Sandboxes.ts"

// `sandbox/Command { target: { branch, ownerId }, call }` (docs/features/sandbox-tools.md#long-commands): one sandbox
// `run` command on a branch's machine, as `@smthrs/sandbox`'s `SandboxCommand` job, the library catalog's "Run commands
// on a ... sandbox" over `@smthrs/flow`'s `ExternalJob`.
//
//   start (wake the machine, start the command detached as the person's user, once per key)
//     ─▶ probe ─▶ park ─▶ probe ... (the run holds no step and no host while the command runs)
//     ─▶ collect (its RunResult; the working copy is saved)        └ lost or past the deadline: cancel, then fail
//
// A command that runs for ten minutes no longer holds one step of the run that asked for it, so neither Cloudflare's
// 15-minute alarm limit nor a host that stops mid-command loses it: the next drive probes the same command and collects
// its result once. The TODO agent's `sandbox/run` tool (worker/flows/TodoAgent.ts) and a person's or the branch agent's
// `run` call (`sandbox/Call`, worker/flows/SandboxCall.ts) run their commands here. Each job runs where it was started
// from, and a host that resolves an execution's flow by its tag lists `Command.flows` (worker/ExecutionHost.ts).

/**
 * Whose command it is: the branch whose machine runs it, the person whose user runs it, and the tool call it is for,
 * whose command an attempt from before commands ran as jobs may have run as a tool call (`Machines.commands`).
 */
export const Target = Schema.Struct({ branch: SandboxBranch, ownerId: Schema.String, callId: Schema.String })
export type Target = typeof Target.Type

/**
 * `sandbox/Command`: a command on a branch's machine, started once, probed from a second after it starts doubling to
 * every 20 seconds, and collected. A lost command is cancelled and fails `ExternalJobLost`, never started again
 * (`restarts` 0), so a command still runs at most once per call.
 */
export const Command = SandboxCommand.make("sandbox/Command", { target: Target, error: MachineFailure })

/** The job's steps over the host's `Machines`: every operation reaches the branch's machine as the person's user. */
export const registration = Command.toLayer(
  SandboxCommand.operations((target: Target) =>
    Effect.map(Machines, (machines) => machines.commands(target.branch, target.ownerId, target.callId))
  ),
).pipe(Layer.provideMerge(Action.layerImplementations))

/** The execution id of call `callId`'s command: from the call's own id, so the call asked again joins the same job. */
export const commandExecutionId = (callId: string): string => `sandbox-command:${callId}`

/** The run a command was asked for outside of: a tool called with no flow runtime in scope. */
export class NoRun extends Schema.TaggedError<NoRun>()("@smthrs/mvp/sandbox/NoRun", {}) {}

/**
 * Runs `call` on `target`'s machine as call `callId`'s `sandbox/Command`, a child of the run that asks: the run parks
 * while the command runs, and asked again (a resumed run replaying the call) it joins the same job, so the command runs
 * once and its result is collected once. Needs the asking run's `FlowRuntime`, else fails `NoRun`.
 */
export const run = (target: Omit<Target, "callId">, callId: string, call: typeof SandboxTools.Run.Type) =>
  Effect.gen(function* () {
    const runtime = yield* Effect.serviceOption(FlowRuntime.FlowRuntime)
    if (Option.isNone(runtime)) return yield* new NoRun()
    // The job's implementations are registered with the runtime (`registration`), which `execute` reaches through it.
    const executed = Command.execute({ target: { ...target, callId }, call }, {
      executionId: commandExecutionId(callId),
    }) as Effect.Effect<
      typeof SandboxTools.RunResult.Type,
      Effect.Error<ReturnType<typeof Command.execute>>,
      FlowRuntime.FlowRuntime | Crypto.Crypto
    >
    return yield* executed.pipe(Effect.provideService(FlowRuntime.FlowRuntime, runtime.value), Effect.provide(WebCrypto.layer))
  })
