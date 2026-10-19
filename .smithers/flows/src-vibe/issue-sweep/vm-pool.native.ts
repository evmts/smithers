// E-7: the Node platform calls vm-pool.vibe makes (EK4402). One call each.
import type { Sandbox } from "@smthrs/sandbox"
import { Effect, Scope } from "effect"
import { randomUUID as nodeRandomUUID } from "node:crypto"
import { posix } from "node:path"

export const randomUUID = (): string => nodeRandomUUID()
export const resolvePosix = (...paths: Array<string>): string => posix.resolve(...paths)

// S3-1: `restore` must wrap the acquisition program itself. VibeLang passes a call argument
// by name through a generator frame, which keeps the fiber interruptible for one more op
// after the VM booted, so an interrupt there would publish a failure for a booted VM to the
// neighbors waiting on it. This is the TypeScript expression, unchanged.
export const restoredAcquire = (
  restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
  acquire: Sandbox.Provider["acquire"],
  id: string,
  scope: Scope.Closeable
) => restore(Effect.provideService(acquire(id), Scope.Scope, scope))
