import { startOfflineExecutor } from "@tanstack/offline-transactions"
import { Context, Effect, Exit, Layer, Metric, Option, Queue, Scope, Stream, Tracer } from "effect"
import { describe, expect, test, vi } from "vitest"
import { Collection, Outbox } from "../src/index.ts"
import { id, memoryStorage, Note, note, withLogs } from "./fixtures.ts"

// The outbox over TanStack DB's real offline executor, in Node: its storage is the library's `StorageAdapter` in
// memory, shared by every executor a test starts on it, as IndexedDB is shared by a tab's reloads. The only scripted
// piece is the mutation, a test's stand-in for a server: each send takes the next outcome the test queued.

type Outcome = "ok" | Outbox.Refused | Outbox.Retry | "defect"

// One program alone: it always leads, so tests never wait on an election. Tests of the election pass `leader: undefined`.
const single: Outbox.Leader = {
  requestLeadership: () => Promise.resolve(true),
  releaseLeadership: () => undefined,
  isLeader: () => true,
  onLeadershipChange: () => () => undefined
}

const until = (assertion: () => void | Promise<void>) => vi.waitFor(assertion, { timeout: 4_000, interval: 5 })

const ownMetrics = () => Layer.succeed(Metric.MetricRegistry, new Map())

/** One program's outbox over `storage`: a `notes` collection, and the `save` mutation, scripted by `outcomes`. */
const start = (options: {
  readonly storage: ReturnType<typeof memoryStorage>
  readonly outcomes: Queue.Queue<Outcome>
  readonly sent: Array<{ readonly rows: ReadonlyArray<unknown>; readonly idempotencyKey: string }>
  readonly leader?: Outbox.Leader | undefined
  readonly notes?: string
}) =>
  Effect.gen(function*() {
    const notes = yield* Collection.local({ id: options.notes ?? id("notes"), schema: Note, getKey: (row) => row.id })
    const online = Outbox.Online.always()
    const context = yield* Layer.build(
      Outbox.layer({
        start: startOfflineExecutor,
        collections: { notes },
        storage: options.storage,
        ...("leader" in options ? (options.leader ? { leader: options.leader } : {}) : { leader: single }),
        online,
        mutations: {
          save: (params) =>
            Effect.gen(function*() {
              options.sent.push(params)
              const outcome = yield* Queue.take(options.outcomes)
              if (outcome === "defect") return yield* Effect.die(new Error("boom"))
              if (outcome !== "ok") return yield* outcome
            })
        }
      })
    )
    return { notes, outbox: Context.get(context, Outbox.Outbox), online }
  })

const setup = async (outcomes: ReadonlyArray<Outcome>) => {
  const queue = Effect.runSync(Queue.unbounded<Outcome>())
  for (const outcome of outcomes) Effect.runSync(Queue.offer(queue, outcome))
  return {
    storage: memoryStorage(),
    outcomes: queue,
    sent: [] as Array<{ rows: ReadonlyArray<unknown>; idempotencyKey: string }>
  }
}

const scoped = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(ownMetrics())))

const save = (outbox: Outbox.Service, notes: Collection.Collection<Note, string>, row: Note) =>
  outbox.transact("save", { idempotencyKey: row.id }, Effect.asVoid(notes.insert(row)))

const texts = (rows: ReadonlyArray<Note>) => rows.map(({ id }) => id)

describe("a write", () => {
  test("shows its rows at once, is stored before it is sent, is sent once with its key, and settles", async () => {
    const world = await setup([])
    const seen = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      const write = yield* save(outbox, notes, note("a", 1))
      const shown = texts(yield* notes.toArray)
      yield* write.admitted
      const stored = [...world.storage.entries.keys()]
      yield* Queue.offer(world.outcomes, "ok")
      yield* write.settled
      return {
        shown,
        stored,
        sent: world.sent,
        after: texts(yield* notes.toArray),
        left: [...world.storage.entries.keys()],
        sends: (yield* Metric.value(Metric.withAttributes(Outbox.attempts, { name: "save", outcome: "sent" }))).count,
        queued: (yield* Metric.value(Metric.withAttributes(Outbox.queuedMs, { name: "save" }))).count
      }
    }))
    expect(seen.shown).toEqual(["a"])
    expect(seen.stored).toHaveLength(1)
    expect(seen.sent).toEqual([{ rows: [note("a", 1)], idempotencyKey: "a" }])
    // The rows were optimistic: the source never got them, so they go once the write settles.
    expect(seen.after).toEqual([])
    expect(seen.left).toEqual([])
    expect(seen.sends).toBe(1)
    expect(seen.queued).toBe(1)
  })

  test("that doesn't get through is sent again, whatever its status, until it does", async () => {
    const world = await setup([new Outbox.Retry({}), new Outbox.Retry({ status: 400 })])
    const statuses = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      const seen: Array<Outbox.Status> = []
      yield* outbox.status.pipe(Stream.runForEach((status) => Effect.sync(() => seen.push(status))), Effect.forkScoped)
      const write = yield* save(outbox, notes, note("a", 1))
      // The library waits 1 s, then 2 s; retryNow sends at once.
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(1)))
      yield* outbox.retryNow
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(2)))
      yield* Queue.offer(world.outcomes, "ok")
      yield* outbox.retryNow
      yield* write.settled
      return seen
    }))
    expect(world.sent.map(({ idempotencyKey }) => idempotencyKey)).toEqual(["a", "a", "a"])
    expect(statuses.map(({ failing }) => failing)).toEqual(expect.arrayContaining(["network", "server", null]))
    expect(statuses.at(-1)).toEqual({ leader: true, failing: null })
  })

  test("the server refuses is never sent again, rolls back and is counted", async () => {
    const world = await setup([new Outbox.Refused({ status: 409 })])
    const seen = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      const write = yield* save(outbox, notes, note("a", 1))
      const settled = yield* Effect.exit(write.settled)
      return {
        settled: Exit.isFailure(settled),
        rows: texts(yield* notes.toArray),
        refused: (yield* Metric.value(Metric.withAttributes(Outbox.refused, { name: "save", status: "409" }))).count,
        left: [...world.storage.entries.keys()]
      }
    }))
    expect(seen).toEqual({ settled: true, rows: [], refused: 1, left: [] })
    expect(world.sent).toHaveLength(1)
  })

  test("refused without a status is counted as none", async () => {
    const world = await setup([new Outbox.Refused({})])
    const refused = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      yield* Effect.exit((yield* save(outbox, notes, note("a", 1))).settled)
      return (yield* Metric.value(Metric.withAttributes(Outbox.refused, { name: "save", status: "none" }))).count
    }))
    expect(refused).toBe(1)
  })

  test("whose mutation dies is never sent again, rolls back, and is logged without its error", async () => {
    const world = await setup(["defect"])
    const { result, logs } = await withLogs(Effect.scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      const write = yield* save(outbox, notes, note("a", 1))
      return { settled: Exit.isFailure(yield* Effect.exit(write.settled)), rows: texts(yield* notes.toArray) }
    })))
    expect(result).toEqual({ settled: true, rows: [] })
    expect(logs).toContainEqual(expect.objectContaining({
      message: ["outbox write failed"],
      level: "Error",
      annotations: { name: "save", outcome: "defect" }
    }))
  })

  test("queued by one program is restored and sent once by the next", async () => {
    const world = await setup([new Outbox.Retry({})])
    const collection = id("notes")
    await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start({ ...world, notes: collection })
      yield* (yield* save(outbox, notes, note("a", 1))).admitted
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(1)))
    }))
    const restored = await scoped(Effect.gen(function*() {
      const { notes } = yield* start({ ...world, notes: collection })
      // Its rows are back before it is sent again.
      const shown = texts(yield* notes.toArray)
      yield* Queue.offer(world.outcomes, "ok")
      yield* Effect.promise(() => until(() => expect(world.storage.entries.size).toBe(0)))
      return shown
    }))
    expect(restored).toEqual(["a"])
    expect(world.sent.map(({ idempotencyKey }) => idempotencyKey)).toEqual(["a", "a"])
  })

  test("links every send to the span it was made in", async () => {
    const world = await setup(["ok"])
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    await scoped(
      Effect.gen(function*() {
        const { notes, outbox } = yield* start(world)
        const write = yield* save(outbox, notes, note("a", 1)).pipe(Effect.withSpan("ask"))
        yield* write.settled
      }).pipe(Effect.provideService(Tracer.Tracer, tracer))
    )
    const ask = spans.find(({ name }) => name === "ask")!
    const send = spans.find(({ name }) => name === "outbox.send")!
    expect(send.attributes.get("name")).toBe("save")
    expect(send.attributes.get("attempt")).toBe(1)
    expect(send.attributes.get("outcome")).toBe("sent")
    expect(send.links.map(({ span }) => span.spanId)).toEqual([ask.spanId])
  })

  test("whose change TanStack DB refuses fails with MutationRefused, and nothing is stored or sent", async () => {
    const world = await setup([])
    const seen = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start(world)
      yield* notes.insert(note("a", 1))
      const exit = yield* Effect.exit(save(outbox, notes, note("a", 2)))
      return {
        refused: Exit.isFailure(exit) && exit.cause.toString().includes("MutationRefused"),
        rows: texts(yield* notes.toArray)
      }
    }))
    expect(seen).toEqual({ refused: true, rows: ["a"] })
    expect(world.storage.entries.size).toBe(0)
    expect(world.sent).toEqual([])
  })
})

describe("admission", () => {
  test("a follower admits nothing: no rows, nothing stored", async () => {
    const world = await setup([])
    const follower: Outbox.Leader = {
      ...single,
      requestLeadership: () => Promise.resolve(false),
      isLeader: () => false
    }
    const seen = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start({ ...world, leader: follower })
      const exit = yield* Effect.exit(save(outbox, notes, note("a", 1)))
      return { exit, rows: yield* notes.toArray, status: yield* Stream.runHead(outbox.status) }
    }))
    expect(seen.exit).toEqual(Exit.fail(new Outbox.NotAdmitted({ reason: "follower" })))
    expect(seen.rows).toEqual([])
    expect(seen.status).toEqual(Option.some({ leader: false, failing: null }))
  })

  test.each([false, true])(
    "leadership lost before persistence reports follower (storage fault: %s)",
    async (storageFault) => {
      const world = await setup([])
      let change = (_leader: boolean) => {}
      const leader: Outbox.Leader = {
        ...single,
        onLeadershipChange: (listener) => {
          change = listener
          return () => undefined
        }
      }
      let stores = 0
      const storage = {
        ...world.storage,
        set: async (key: string, value: string) => {
          stores++
          if (storageFault) throw new Error("quota")
          return await world.storage.set(key, value)
        }
      }
      const seen = await scoped(Effect.gen(function*() {
        const { notes, outbox } = yield* start({ ...world, storage, leader })
        const write = yield* outbox.transact(
          "save",
          { idempotencyKey: "a" },
          Effect.gen(function*() {
            yield* notes.insert(note("a", 1))
            change(false)
          })
        )
        const admitted = yield* Effect.exit(write.admitted)
        yield* Effect.exit(write.settled)
        return { admitted, rows: yield* notes.toArray }
      }))
      expect(seen.admitted).toEqual(Exit.fail(new Outbox.NotAdmitted({ reason: "follower" })))
      expect(seen.rows).toEqual([])
      expect(stores).toBe(0)
      expect(world.storage.entries.size).toBe(0)
      expect(world.sent).toEqual([])
    }
  )

  test.each([false, true])("storage failure stays storage when leadership is lost: %s", async (loseLeadership) => {
    const world = await setup([])
    let change = (_leader: boolean) => {}
    const leader: Outbox.Leader = {
      ...single,
      onLeadershipChange: (listener) => {
        change = listener
        return () => undefined
      }
    }
    const storage = {
      ...world.storage,
      set: () => {
        if (loseLeadership) change(false)
        return Promise.reject(new Error("quota"))
      }
    }
    const seen = await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start({ ...world, storage: storage as never, leader })
      const write = yield* save(outbox, notes, note("a", 1))
      const admitted = yield* Effect.exit(write.admitted)
      yield* Effect.exit(write.settled)
      return { admitted, rows: yield* notes.toArray }
    }))
    expect(seen.admitted).toEqual(Exit.fail(new Outbox.NotAdmitted({ reason: "storage" })))
    expect(seen.rows).toEqual([])
    expect(world.sent).toEqual([])
  })

  test("a restored write whose settlement cannot be stored retains its durable record", async () => {
    const world = await setup([new Outbox.Retry({})])
    const collection = id("notes")
    await scoped(Effect.gen(function*() {
      const { notes, outbox } = yield* start({ ...world, notes: collection })
      yield* (yield* save(outbox, notes, note("a", 1))).admitted
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(1)))
    }))
    const storage = { ...world.storage, set: () => Promise.reject(new Error("quota")) }
    await scoped(Effect.gen(function*() {
      yield* Queue.offer(world.outcomes, "ok")
      yield* start({ ...world, notes: collection, storage: storage as never })
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(2)))
    }))
    expect(world.storage.entries.size).toBe(1)
  })

  test("a storage that can't be read at start is logged, and the outbox starts", async () => {
    const world = await setup([])
    const storage = { ...world.storage, keys: () => Promise.reject(new Error("blocked")) }
    const { logs } = await withLogs(Effect.scoped(start({ ...world, storage: storage as never })))
    expect(logs).toContainEqual(
      expect.objectContaining({ message: ["outbox couldn't load its writes"], level: "Warn" })
    )
  })
})

describe("Online.always and leadership", () => {
  test("always is always online and notifies its listeners until disposed", async () => {
    const online = Outbox.Online.always()
    let notified = 0
    const unsubscribe = online.subscribe(() => notified++)
    online.notifyOnline()
    unsubscribe()
    online.notifyOnline()
    online.subscribe(() => notified++)
    online.dispose()
    online.notifyOnline()
    expect([online.isOnline(), notified]).toEqual([true, 1])
  })

  test("without a leader, the library's Web Lock elects the first program, and the second follows", async () => {
    const world = await setup(["ok"])
    const seen = await scoped(Effect.gen(function*() {
      const first = yield* start({ ...world, leader: undefined })
      const second = yield* start({ ...world, leader: undefined })
      const following = yield* Effect.exit(save(second.outbox, second.notes, note("a", 1)))
      yield* (yield* save(first.outbox, first.notes, note("b", 2))).settled
      return {
        following,
        counted: (yield* Metric.value(Metric.withAttributes(Outbox.leaderChanges, { leader: "true" }))).count
      }
    }))
    expect(seen.following).toEqual(Exit.fail(new Outbox.NotAdmitted({ reason: "follower" })))
    expect(seen.counted).toBe(1)
    expect(world.sent.map(({ idempotencyKey }) => idempotencyKey)).toEqual(["b"])
  })
})

describe("lockLeader", () => {
  // A lock service over Node's own Web Locks, shaped as @smthrs/platform-browser's WebLock: `hold` waits for the lock
  // and holds it until the scope closes.
  const lock: Outbox.Lock = {
    hold: (name) =>
      Effect.acquireRelease(
        Effect.callback<() => void>((resume, signal) => {
          navigator.locks.request(
            name,
            { signal },
            () => new Promise<void>((release) => resume(Effect.succeed(release)))
          )
            .catch(() => undefined)
        }),
        (release) => Effect.sync(release)
      ).pipe(Effect.asVoid)
  }

  test("the first program leads; the next waits, and when the first closes it leads and sends what was stored", async () => {
    const world = await setup([new Outbox.Retry({}), "ok"])
    const name = id("outbox")
    const seen = await scoped(Effect.gen(function*() {
      const firstScope = yield* Scope.make()
      const first = yield* Scope.provide(
        Effect.flatMap(Outbox.lockLeader({ lock, name }), (leader) => start({ ...world, leader })),
        firstScope
      )
      const write = yield* save(first.outbox, first.notes, note("a", 1))
      yield* write.admitted
      yield* Effect.promise(() => until(() => expect(world.sent).toHaveLength(1)))
      const leader = yield* Outbox.lockLeader({ lock, name, grantWithin: "20 millis" })
      const second = yield* start({ ...world, leader })
      const waited = (yield* Stream.runHead(second.outbox.status)).pipe(Option.map(({ leader }) => leader))
      yield* Scope.close(firstScope, Exit.void)
      yield* Effect.promise(() => until(() => expect(leader.isLeader()).toBe(true)))
      yield* Effect.promise(() => until(() => expect(world.storage.entries.size).toBe(0)))
      leader.dispose()
      return { waited, after: leader.isLeader() }
    }))
    expect(seen).toEqual({ waited: Option.some(false), after: false })
    expect(world.sent.map(({ idempotencyKey }) => idempotencyKey)).toEqual(["a", "a"])
  })

  test("a released leader lets the lock go, and releasing again changes nothing", async () => {
    const name = id("outbox")
    const changes: Array<boolean> = []
    await scoped(Effect.gen(function*() {
      const leader = yield* Outbox.lockLeader({ lock, name })
      const unsubscribe = leader.onLeadershipChange((now) => changes.push(now))
      expect(yield* Effect.promise(() => leader.requestLeadership())).toBe(true)
      leader.releaseLeadership()
      yield* Effect.promise(() => until(() => expect(changes).toEqual([true, false])))
      leader.releaseLeadership()
      unsubscribe()
    }))
    expect(changes).toEqual([true, false])
  })
})
