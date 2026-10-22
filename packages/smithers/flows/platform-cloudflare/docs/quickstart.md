---
title: "Quickstart"
description: "Declare a flow, host it in a plain Durable Object class, and start an execution from a Worker."
---

This page hosts one flow in a plain Durable Object class, without a framework,
so every line the host needs is visible. [Host a flow in a Durable Object](./guides/host-a-flow-in-a-durable-object.md) does the same with Alchemy.

## 1. Declare the flow

A flow hosted on Cloudflare is an ordinary flow. Register it through
`Interpreter.layerWithImplementations`: each alarm can run in a new isolate, and
only the stable callback identity that composition enforces lets the new
isolate rebuild the plan the old one recorded.

```ts
// Greet.ts
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const Compose = Action.make("greet/Compose", {
  payload: { name: Schema.String },
  success: Schema.String
})

export const Greet = Flow.make("greet/Greet", {
  payload: { name: Schema.String },
  success: Schema.String,
  body: Node.capture({}, ({ name }) => Compose.call({ name }))
})

export const GreetLive = Interpreter.layerWithImplementations(
  Greet,
  Compose.toLayer(({ name }) => Effect.succeed(`Hello, ${name}`))
).pipe(Layer.provideMerge(Action.layerImplementations))
```

## 2. Host it in a Durable Object

The object adapts its storage to `ExecutionObject.Storage`, then delegates.
`fetch` records the execution with `start` or wakes it with `wake`; `alarm`
drives it, and its router reaches other objects of the same class, so a child
flow or the next round of a handoff runs on an object of its own. Effects run
here, at the program boundary.

```ts
// worker.ts
import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import { CloudflareRuntime, ExecutionObject } from "@smthrs/platform-cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Greet, GreetLive } from "./Greet.ts"

interface Env {
  readonly HYPERDRIVE: { readonly connectionString: string }
  readonly GREETINGS: DurableObjectNamespace
}

const storageOf = (raw: DurableObjectStorage): ExecutionObject.Storage => ({
  get: <A>(key: string) => Effect.promise(() => raw.get<A>(key)),
  put: (key, value) => Effect.promise(() => raw.put(key, value)),
  delete: (key) => Effect.promise(() => raw.delete(key)),
  setAlarm: (scheduledTime) => Effect.promise(() => raw.setAlarm(scheduledTime)),
  deleteAlarm: () => Effect.promise(() => raw.deleteAlarm())
})

export class Greeting {
  readonly state: DurableObjectState
  readonly env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const storage = storageOf(this.state.storage)
    if (new URL(request.url).pathname === "/wake") {
      await Effect.runPromise(ExecutionObject.wake(storage))
      return new Response(null, { status: 202 })
    }
    const intent = (await request.json()) as ExecutionObject.Intent
    await Effect.runPromise(ExecutionObject.start(storage, intent, Effect.void))
    return new Response(null, { status: 202 })
  }

  async alarm(): Promise<void> {
    const database = PostgresDatabase.layer({
      url: this.env.HYPERDRIVE.connectionString,
      driver: Pg,
      schema: "smithers_flows"
    })
    await Effect.runPromise(ExecutionObject.alarm(storageOf(this.state.storage), {
      flows: [Greet],
      runtime: (intent) =>
        CloudflareRuntime.layer({ hostId: this.state.id.toString(), executionId: intent.executionId }, GreetLive)
          .pipe(Layer.provide(database)),
      router: routerOf(this.env.GREETINGS)
    }))
  }
}

/** Reaches the object of any execution, by execution id. A non-2xx answer fails the call. */
const routerOf = (namespace: DurableObjectNamespace): ExecutionObject.Router<unknown> => {
  const call = (executionId: string, path: string, body?: string) =>
    Effect.tryPromise(async () => {
      const object = namespace.get(namespace.idFromName(executionId))
      const response = await object.fetch(`https://greeting${path}`, { method: "POST", body: body ?? null })
      if (!response.ok) throw new Error(`${path} answered ${response.status}`)
    })
  return {
    start: (intent) => call(intent.executionId, "/start", JSON.stringify(intent)),
    wake: (executionId) => call(executionId, "/wake")
  }
}
```

The runtime is built inside `alarm`, so its database connection opens and closes
with the alarm, as workerd requires. `Greet` starts no child and hands off to
no round, so its router is never called; a flow that does reaches the objects
of those executions through it.

## 3. Start an execution from the Worker

Name the object by the execution id, so the same id always reaches the same
object, and hand it the intent:

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { name } = (await request.json()) as { readonly name: string }
    const executionId = `greet/${name}`
    const intent = await Effect.runPromise(ExecutionObject.intent(Greet, { executionId, payload: { name } }))
    const object = env.GREETINGS.get(env.GREETINGS.idFromName(executionId))
    return object.fetch("https://greeting/start", { method: "POST", body: JSON.stringify(intent) })
  }
}
```

The response is `202` as soon as the object has stored the intent and armed its
alarm. The alarm then fires, builds the runtime, runs `greet/Compose` and
settles the execution; its result is in the engine's store under its execution
id for whoever reads it.

## 4. Watch it

Each `start` logs a `cloudflare.execution.start` line, each `wake` a
`cloudflare.execution.wake` line and each alarm a `cloudflare.execution.alarm`
line, inside spans of the same names, with the outcome as an annotation; start
and alarm lines also name the execution and flow. The
`smithers_cloudflare_execution_starts`, `smithers_cloudflare_execution_wakes`
and `smithers_cloudflare_execution_alarms` counters count them by outcome. None of
them carries the payload. See [the execution lifecycle](./concepts/execution-lifecycle.md) for what each outcome means.
