import { SandboxTools } from "@smthrs/sandbox"
import { Context, type Effect, Schema } from "effect"
import type { CheckoutFailed, SandboxBranch, SandboxStartTimedOut, SandboxUnavailable } from "./Sandboxes.ts"

// What a branch's machine does for the sandbox tools and its own lifecycle (decision 0005 §2-§3,
// docs/features/sandbox-tools.md): run one tool call as the person who asked, and go to sleep when nothing happens in
// it. The machine is only a tool provider: it knows nothing about agents (0005 Q2). On Cloudflare it is the branch's
// `SandboxObject` and its container (worker/BranchSandboxes.ts); a test provides its own.

/** How a tool call ended on the machine, as it crosses a Durable Object's RPC: plain data, no class. */
export const ToolOutcome = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Done"), result: SandboxTools.Result, generation: Schema.Number }),
  Schema.Struct({ _tag: Schema.Literal("Refused"), reason: SandboxTools.ToolRefused.fields.reason }),
  Schema.Struct({ _tag: Schema.Literal("Lost") }),
  Schema.Struct({ _tag: Schema.Literal("CheckoutFailed") }),
  // `start_timeout` when the machine didn't finish starting within SANDBOX_START_TIMEOUT_SECONDS.
  Schema.Struct({ _tag: Schema.Literal("Unavailable"), reason: Schema.optional(Schema.Literal("start_timeout")) }),
])
export type ToolOutcome = typeof ToolOutcome.Type

/** What a machine answers to `sleepIfIdle`: it `slept`, it is `busy`, or that generation is `gone` already. */
export const SLEEP_OUTCOMES = ["slept", "busy", "gone"] as const
export type SleepOutcome = (typeof SLEEP_OUTCOMES)[number]

/** A tool call's success on the machine: the tool's result, and the machine generation it ran on. */
export interface Ran {
  readonly result: SandboxTools.Result
  readonly generation: number
}

/** The branches' machines as the sandbox flows reach them, by branch id. */
export class Machines extends Context.Service<
  Machines,
  {
    /**
     * Runs `call` in the branch's machine as person `ownerId`'s own user, waking the machine first. A command runs at
     * most once per `callId`. A call that changes the working copy saves it (`SandboxTools.checkpoint`), so a machine
     * that stops loses none of it.
     */
    readonly tool: (
      branch: SandboxBranch,
      ownerId: string,
      callId: string,
      call: SandboxTools.Call,
    ) => Effect.Effect<
      Ran,
      SandboxTools.ToolRefused | SandboxTools.ToolLost | SandboxUnavailable | SandboxStartTimedOut | CheckoutFailed
    >
    /**
     * Puts generation `generation` of the branch's machine to sleep when nothing happened in it for `idleMs`: no call,
     * no terminal input, and no process but the shells. It saves the working copy first, and stays awake when it can't.
     * Never wakes a machine.
     */
    readonly sleepIfIdle: (
      branchId: string,
      generation: number,
      idleMs: number,
    ) => Effect.Effect<SleepOutcome, SandboxUnavailable>
  }
>()("@smthrs/mvp/branch/Machines") {}
