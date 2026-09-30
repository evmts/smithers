import { Effect, Scope } from "effect"
import { changes } from "./NodeWorkspaceObservation.ts"
const root = process.argv[2]!
const scope = await Effect.runPromise(Scope.make())
let s = performance.now()
const feed = await Effect.runPromise(Scope.provide(changes(root), scope))
console.log("construct ms", Math.round(performance.now() - s))
s = performance.now(); console.log(await Effect.runPromise(feed.settled), Math.round(performance.now() - s))
process.exit(0)
