import assert from "node:assert/strict"
import { mkdtemp, open, rm, type FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { Deferred, Effect, Context } from "effect"
import { usingPair, usingResources } from "./resources.ts"
import { concurrentOK } from "./suites.ts"

class Acquisition extends Context.Service<Acquisition, { readonly acquire: Effect.Effect<FileHandle, Error> }>()("bench-test/Acquisition") {}

test("a rejected browser completion fails even when the server delivered a complete answer", () => {
  assert.equal(concurrentOK({ status: "rejected", reason: new Error("browser timeout") }, true), false)
  assert.equal(concurrentOK({ status: "fulfilled", value: [] }, true), true)
  assert.equal(concurrentOK({ status: "fulfilled", value: [] }, false), false)
})

test("partial acquisition failure releases every successful resource", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bench-resource-"))
  const handles: FileHandle[] = []
  try {
    const result = await Effect.runPromise(Effect.gen(function* () {
      const opened = yield* Deferred.make<void>()
      let calls = 0
      const faultyAcquire = Effect.suspend(() => ++calls === 1
        ? Effect.tryPromise({ try: () => open(join(directory, "resource"), "w+"), catch: (cause) => new Error(String(cause)) }).pipe(
            Effect.tap((handle) => Effect.sync(() => { handles.push(handle) })),
            Effect.tap(() => Deferred.succeed(opened, undefined)),
          )
        : Deferred.await(opened).pipe(Effect.andThen(Effect.fail(new Error("context creation failed")))))
      return yield* usingResources(
        Effect.flatMap(Effect.service(Acquisition), (service) => service.acquire),
        (handle) => Effect.promise(() => handle.close()),
        2,
        () => Effect.die("body must not run"),
      ).pipe(Effect.provideService(Acquisition, { acquire: faultyAcquire }), Effect.result)
    }))
    assert.equal(result._tag, "Failure")
    assert.equal(handles.length, 1)
    await assert.rejects(handles[0]!.stat(), /closed|EBADF/)
  } finally {
    await Promise.all(handles.map((handle) => handle.close()))
    await rm(directory, { recursive: true, force: true })
  }
})

test("failure acquiring a nested resource releases the already started outer resource", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bench-outer-"))
  const handle = await open(join(directory, "follower"), "w+")
  try {
    const result = await Effect.runPromise(usingPair(
      Effect.succeed(handle),
      (resource) => Effect.promise(() => resource.close()),
      Effect.flatMap(Effect.service(Acquisition), (service) => service.acquire),
      () => Effect.void,
      () => Effect.void,
    ).pipe(Effect.provideService(Acquisition, { acquire: Effect.fail(new Error("browser launch failed")) }), Effect.result))
    assert.equal(result._tag, "Failure")
    await assert.rejects(handle.stat(), /closed|EBADF/)
  } finally {
    await handle.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("successful group acquisition closes resources after the body and returns its value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bench-success-"))
  const handles: FileHandle[] = []
  try {
    const value = await Effect.runPromise(usingResources(
      Effect.promise(() => open(join(directory, "resource"), "w+")),
      (handle) => Effect.promise(() => handle.close()),
      2,
      (resources) => Effect.promise(async () => {
        handles.push(...resources)
        for (const resource of resources) assert.equal((await resource.stat()).size, 0)
        return 42
      }),
    ))
    assert.equal(value, 42)
    for (const resource of handles) await assert.rejects(resource.stat(), /closed|EBADF/)
  } finally {
    await Promise.all(handles.map((handle) => handle.close()))
    await rm(directory, { recursive: true, force: true })
  }
})

test("cancelling resource use closes all acquired resources before rejecting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bench-cancel-"))
  const handles: FileHandle[] = []
  const abort = new AbortController()
  let ready!: () => void
  const entered = new Promise<void>((resolve) => { ready = resolve })
  const running = Effect.runPromise(usingResources(
    Effect.promise(() => open(join(directory, "resource"), "w+")),
    (handle) => Effect.promise(() => handle.close()),
    2,
    (resources) => Effect.sync(() => { handles.push(...resources); ready() }).pipe(Effect.andThen(Effect.never)),
  ), { signal: abort.signal })
  try {
    await entered
    abort.abort()
    await assert.rejects(running)
    for (const resource of handles) await assert.rejects(resource.stat(), /closed|EBADF/)
  } finally {
    abort.abort()
    await running.catch(() => {})
    await Promise.all(handles.map((handle) => handle.close()))
    await rm(directory, { recursive: true, force: true })
  }
})
