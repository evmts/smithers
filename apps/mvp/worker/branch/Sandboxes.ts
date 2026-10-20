import { Context, type Effect, Schema } from "effect"
import type { HttpServerRequest, HttpServerResponse } from "effect/http"

// A branch's machine as the flows and routes reach it (decision 0013 §2-§3, decision 0005 §2): one sandbox per branch,
// which the host provides. On Cloudflare it is the branch's `SandboxObject` Durable Object and its container
// (worker/BranchSandboxes.ts); a test provides its own. Nothing here names a host.

/** The branch a sandbox serves: its id, its repository on GitHub, and the branch name its checkout follows. */
export const SandboxBranch = Schema.Struct({
  branchId: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  branch: Schema.String,
})
export type SandboxBranch = typeof SandboxBranch.Type

/** The machine couldn't start or answer: no capacity, or the platform failed. A step tries again. */
export class SandboxUnavailable extends Schema.TaggedError<SandboxUnavailable>()(
  "@smthrs/mvp/branch/SandboxUnavailable",
  { reason: Schema.Literals(["start", "exec"]) },
) {}

/** The branch couldn't be checked out in the machine: its forge refused the clone. Not retried. */
export class CheckoutFailed extends Schema.TaggedError<CheckoutFailed>()("@smthrs/mvp/branch/CheckoutFailed", {}) {}

/**
 * Who a socket attaches as: the terminal's owner types (`write`); anyone else who may watch only watches (`read`). Every
 * shell runs as its owner's own user in the machine, so `ownerId` says whose tmux server the terminal is on.
 */
export interface Attachment {
  readonly terminalId: string
  readonly ownerId: string
  readonly access: "write" | "read"
}

/** The sandboxes of every branch, by branch id. */
export class Sandboxes extends Context.Service<
  Sandboxes,
  {
    /**
     * Wakes the branch's machine: starts it unless it runs, routes its forge requests to the read-only proxy, and
     * checks the branch out in /workspace unless it is there. Answers the machine's generation, which a restart
     * advances. Doing it again on a running machine changes nothing.
     */
    readonly wake: (branch: SandboxBranch) => Effect.Effect<{ readonly generation: number }, SandboxUnavailable | CheckoutFailed>
    /**
     * Starts terminal `terminalId`'s shell session in the branch's machine unless it is there, as its owner's own user,
     * made on first use, so one person's shell can't reach another's.
     */
    readonly session: (branchId: string, terminalId: string, ownerId: string) => Effect.Effect<void, SandboxUnavailable>
  }
>()("@smthrs/mvp/branch/Sandboxes") {}

/** A browser's terminal socket as the routes reach a branch's machine. */
export class TerminalSockets extends Context.Service<
  TerminalSockets,
  {
    /** Attaches the request's socket to the terminal's session: the host's answer to the upgrade. */
    readonly attach: (
      branchId: string,
      attachment: Attachment,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest>
    /**
     * Whether the terminal's session is alive in the branch's machine: the machine runs and the session is there. A
     * machine that slept or was lost has no sessions. Never wakes a machine.
     */
    readonly alive: (branchId: string, terminalId: string, ownerId: string) => Effect.Effect<boolean>
  }
>()("@smthrs/mvp/branch/TerminalSockets") {}
