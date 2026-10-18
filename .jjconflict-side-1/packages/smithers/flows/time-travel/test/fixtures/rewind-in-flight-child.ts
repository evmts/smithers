import * as Effect from "effect/Effect"
import { parkSealedFlow, runRealEngine } from "../RealTimeTravelHarness.ts"

const [databaseFile, runId, hostId, mode] = process.argv.slice(2)
if (databaseFile === undefined || runId === undefined || hostId === undefined) {
  throw new Error("usage: rewind-in-flight-child.ts <database-file> <run-id> <host-id>")
}

const inFlight = Effect.sync(() => {
  process.stdout.write(`${JSON.stringify({ status: "in-flight" })}\n`)
}).pipe(Effect.andThen(Effect.never))

// A process entrypoint: running the Effect here is the intended boundary.
await Effect.runPromise(runRealEngine(
  databaseFile,
  hostId,
  parkSealedFlow(runId, mode === "recover" ? Effect.succeed("adopted") : inFlight)
))

// The parent always SIGKILLs this process after observing a durable heartbeat.
if (mode === "recover") process.stdout.write(`${JSON.stringify({ status: "recovered" })}\n`)
process.exitCode = mode === "recover" ? 0 : 2
