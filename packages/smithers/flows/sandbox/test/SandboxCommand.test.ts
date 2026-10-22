import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { describe, expect, it } from "@effect/vitest"
import { FlowEngine } from "@smthrs/engine"
import { Action, ExternalJob, Fault, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Cause, type Duration, Effect, Exit, Fiber, FileSystem, Layer, Schema, Stream, Tracer } from "effect"
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"
import * as DirectorySandbox from "../src/DirectorySandbox/index.ts"
import { ProviderError } from "../src/RemoteChildProcessSpawner/ProviderError.ts"
import type * as Sandbox from "../src/Sandbox/index.ts"
import * as SandboxCommand from "../src/SandboxCommand/index.ts"
import * as SandboxTools from "../src/SandboxTools/index.ts"
import { platform } from "./helpers/containedPlatform.ts"

// A command started detached in a real scratch directory (DirectorySandbox), as it starts in a container: its runner is
// a real process in a session of its own, and each step asks a fresh exec session, as a host that came back would.

const root = realpathSync(mkdtempSync(join(tmpdir(), "smthrs-sandbox-command-")))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const provider = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner
  return DirectorySandbox.make({ fs, spawner, root: join(root, "machines"), persistence: "sticky" })
}).pipe(Effect.provide(platform))

let machines = 0
/** A fresh machine: each `inSession` call opens its own exec session on it and closes it when `body` ends. */
const machine = () => {
  const id = `machine-${++machines}`
  const calls = join(root, `calls-${id}`)
  const inSession = <A, E>(body: (session: Sandbox.Session) => Effect.Effect<A, E>) =>
    Effect.scoped(Effect.flatMap(Effect.flatMap(provider, (made) => made.acquire(id)), body))
  return { calls, inSession }
}

let keys = 0
const keyOf = () => `job-${++keys}#g1`

/** Whether process `pid` lives: `kill -0` reaches it, and where there is a `/proc`, it isn't waiting to be reaped. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const stat = `/proc/${pid}/stat`
  return !existsSync(stat) || readFileSync(stat, "utf8").replace(/^.*\) /s, "")[0] !== "Z"
}

/** What the scripts record as process `pid`'s identity: its start time from `/proc` where there is one, else `-`. */
const ident = (pid: number) => {
  const stat = `/proc/${pid}/stat`
  return existsSync(stat) ? readFileSync(stat, "utf8").replace(/^.*\) /s, "").split(" ")[19]! : "-"
}

/** Waits until `read` answers something other than `undefined`, polling every 25 ms for at most `seconds`. */
const until = <A>(read: () => A | undefined, seconds = 20) =>
  Effect.gen(function*() {
    for (let tries = 0; tries < seconds * 40; tries++) {
      const value = read()
      if (value !== undefined) return value
      yield* Effect.sleep("25 millis")
    }
    return yield* Effect.die(`condition not reached in ${seconds} s`)
  })

/** Observes `key` in a fresh exec session until it finished. */
const finished = (box: ReturnType<typeof machine>, key: string) =>
  Effect.gen(function*() {
    for (let tries = 0; tries < 400; tries++) {
      const observed = yield* box.inSession((session) =>
        SandboxTools.observe(session, { key, callsDirectory: box.calls })
      )
      if (observed.state !== "running") return observed
      yield* Effect.sleep("50 millis")
    }
    return yield* Effect.die("the command never finished")
  })

const slow = { timeout: 60_000 }

describe("SandboxTools.start, observe, collect and cancel", () => {
  it.live(
    "start answers at once; the command outlives its exec session, runs once and collects as often as asked",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const key = keyOf()
        const call = {
          tool: "run",
          command: "echo ran >> runs.log; touch started; sleep 1; echo done-$((2+3)); echo warn >&2; exit 3"
        } as const
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, call, { key, callsDirectory: box.calls })
        )
        expect(started.pid).toBeGreaterThan(1)
        expect(started.startedAt).toBeGreaterThan(0)
        // The exec session that started it is closed; the command still runs.
        const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
        yield* until(() => existsSync(join(workdir, "started")) ? true : undefined)
        const running = yield* box.inSession((session) =>
          SandboxTools.observe(session, { key, callsDirectory: box.calls })
        )
        expect(running).toEqual({ state: "running", pid: started.pid })
        // The same key again answers the same handle and starts nothing.
        const again = yield* box.inSession((session) =>
          SandboxTools.start(session, call, { key, callsDirectory: box.calls })
        )
        expect(again).toEqual(started)
        expect(yield* finished(box, key)).toEqual({ state: "finished", exitCode: 3, timedOut: false })
        const collected = yield* box.inSession((session) =>
          SandboxTools.collect(session, { key, callsDirectory: box.calls })
        )
        expect(collected).toEqual({
          tool: "run",
          exitCode: 3,
          timedOut: false,
          stdout: "done-5\n",
          stderr: "warn\n",
          stdoutBytes: 7,
          stderrBytes: 5,
          truncated: false
        })
        expect(yield* box.inSession((session) => SandboxTools.collect(session, { key, callsDirectory: box.calls })))
          .toEqual(collected)
        expect(yield* box.inSession((session) => SandboxTools.start(session, call, { key, callsDirectory: box.calls })))
          .toEqual(started)
        expect(readFileSync(join(workdir, "runs.log"), "utf8")).toBe("ran\n")
      }),
    slow
  )

  it.live(
    "runs in a cwd under the workdir; a cwd that isn't a directory collects as not_a_directory",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
        mkdirSync(join(workdir, "sub"))
        const inSub = keyOf()
        yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "pwd", cwd: "sub" }, {
            key: inSub,
            callsDirectory: box.calls
          })
        )
        yield* finished(box, inSub)
        expect(
          yield* box.inSession((session) => SandboxTools.collect(session, { key: inSub, callsDirectory: box.calls }))
        )
          .toMatchObject({ exitCode: 0, stdout: `${workdir}/sub\n` })
        const missing = keyOf()
        yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "true", cwd: "nope" }, {
            key: missing,
            callsDirectory: box.calls
          })
        )
        expect(yield* finished(box, missing)).toEqual({ state: "finished", exitCode: 20, timedOut: false })
        const refused = yield* Effect.flip(
          box.inSession((session) => SandboxTools.collect(session, { key: missing, callsDirectory: box.calls }))
        )
        expect(refused).toEqual(new SandboxTools.ToolRefused({ reason: "not_a_directory" }))
      }),
    slow
  )

  it.live("a command past its timeout is stopped and says so", () =>
    Effect.gen(function*() {
      const box = machine()
      const key = keyOf()
      yield* box.inSession((session) =>
        SandboxTools.start(session, { tool: "run", command: "sleep 30", timeoutSeconds: 1 }, {
          key,
          callsDirectory: box.calls
        })
      )
      const ended = yield* finished(box, key)
      expect(ended).toMatchObject({ state: "finished", timedOut: true })
      expect(ended.state === "finished" && ended.exitCode).toBeGreaterThan(123)
    }), slow)

  it.live(
    "cancel stops the runner and the command's process groups, and again changes nothing",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const key = keyOf()
        const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "sleep 30 & echo $! > nested.pid; wait" }, {
            key,
            callsDirectory: box.calls
          })
        )
        const nested = Number(
          yield* until(() =>
            existsSync(join(workdir, "nested.pid")) ? readFileSync(join(workdir, "nested.pid"), "utf8") : undefined
          )
        )
        expect(alive(started.pid)).toBe(true)
        expect(alive(nested)).toBe(true)
        yield* box.inSession((session) => SandboxTools.cancel(session, { key, callsDirectory: box.calls }))
        yield* until(() => !alive(started.pid) && !alive(nested) ? true : undefined)
        expect(yield* box.inSession((session) => SandboxTools.observe(session, { key, callsDirectory: box.calls })))
          .not.toMatchObject({ state: "running" })
        yield* box.inSession((session) => SandboxTools.cancel(session, { key, callsDirectory: box.calls }))
      }),
    slow
  )

  it.live(
    "a TERM to the runner stops the command's group too, as a cancel that came before `child` was written does",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const key = keyOf()
        const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "echo $$ > command.pid; sleep 30" }, {
            key,
            callsDirectory: box.calls
          })
        )
        const command = Number(
          yield* until(() =>
            existsSync(join(workdir, "command.pid")) ? readFileSync(join(workdir, "command.pid"), "utf8") : undefined
          )
        )
        process.kill(started.pid, "SIGTERM")
        yield* until(() => !alive(started.pid) && !alive(command) ? true : undefined)
        expect(yield* box.inSession((session) => SandboxTools.observe(session, { key, callsDirectory: box.calls })))
          .toEqual({ state: "lost" })
      }),
    slow
  )

  it.live(
    "cancel leaves a finished command, and a pid that now names another process, alone",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const done = keyOf()
        yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "true" }, { key: done, callsDirectory: box.calls })
        )
        yield* finished(box, done)
        yield* box.inSession((session) => SandboxTools.cancel(session, { key: done, callsDirectory: box.calls }))
        expect(
          yield* box.inSession((session) => SandboxTools.collect(session, { key: done, callsDirectory: box.calls }))
        )
          .toMatchObject({ exitCode: 0 })
        // A fence whose recorded runner was another process: same box, a pid that now names something else.
        const other = spawn("sleep", ["30"], { stdio: "ignore" })
        const reused = "reused"
        mkdirSync(join(box.calls, `command-${reused}`), { recursive: true })
        writeFileSync(join(box.calls, `command-${reused}`, "pid"), `${other.pid} 1 ${ident(1)} 12345\n`)
        yield* box.inSession((session) => SandboxTools.cancel(session, { key: reused, callsDirectory: box.calls }))
        expect(alive(other.pid!)).toBe(true)
        other.kill("SIGKILL")
      }),
    slow
  )

  it.live("two keys a lossy name would merge get fences of their own", () =>
    Effect.gen(function*() {
      const box = machine()
      for (const key of ["a/b#g1", "a_b#g1"]) {
        yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: `echo ${key.length}` }, {
            key,
            callsDirectory: box.calls
          })
        )
      }
      expect(readdirSync(box.calls).sort()).toEqual(["command-a_2fb_23g1", "command-a_5fb_23g1"])
    }), slow)

  it.live(
    "a key cancelled before it started never starts: start answers no process and it observes lost",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const key = keyOf()
        const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
        yield* box.inSession((session) => SandboxTools.cancel(session, { key, callsDirectory: box.calls }))
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "touch ran" }, { key, callsDirectory: box.calls })
        )
        expect(started).toEqual({ pid: 0, startedAt: 0 })
        expect(yield* box.inSession((session) => SandboxTools.observe(session, { key, callsDirectory: box.calls })))
          .toEqual({ state: "lost" })
        expect(existsSync(join(workdir, "ran"))).toBe(false)
      }),
    slow
  )

  it.live(
    "a runner killed before it recorded how the command ended is lost, and collects as ToolLost",
    () =>
      Effect.gen(function*() {
        const box = machine()
        const key = keyOf()
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "sleep 30" }, { key, callsDirectory: box.calls })
        )
        process.kill(-started.pid, "SIGKILL")
        yield* until(() => !alive(started.pid) ? true : undefined)
        expect(yield* box.inSession((session) => SandboxTools.observe(session, { key, callsDirectory: box.calls })))
          .toEqual({ state: "lost" })
        const lost = yield* Effect.flip(
          box.inSession((session) => SandboxTools.collect(session, { key, callsDirectory: box.calls }))
        )
        expect(lost).toEqual(new SandboxTools.ToolLost())
        yield* box.inSession((session) => SandboxTools.cancel(session, { key, callsDirectory: box.calls }))
      }),
    slow
  )

  it.live(
    "a key no start reached observes lost; one whose start died before its runner did answers no process",
    () =>
      Effect.gen(function*() {
        const box = machine()
        expect(
          yield* box.inSession((session) => SandboxTools.observe(session, { key: keyOf(), callsDirectory: box.calls }))
        )
          .toEqual({ state: "lost" })
        const key = "half-started"
        mkdirSync(join(box.calls, `command-${key}`), { recursive: true })
        const started = yield* box.inSession((session) =>
          SandboxTools.start(session, { tool: "run", command: "true" }, { key, callsDirectory: box.calls })
        )
        expect(started).toEqual({ pid: 0, startedAt: 0 })
      }),
    slow
  )

  it.live("refuses a cwd outside the workdir and a calls directory that isn't absolute, before anything runs", () =>
    Effect.gen(function*() {
      const box = machine()
      const path = new SandboxTools.ToolRefused({ reason: "path" })
      const run = { tool: "run", command: "touch ran" } as const
      expect(
        yield* Effect.flip(
          box.inSession((session) =>
            SandboxTools.start(session, { ...run, cwd: "../.." }, { key: "k", callsDirectory: box.calls })
          )
        )
      ).toEqual(path)
      const relative = { key: "k", callsDirectory: "../calls" }
      expect(yield* Effect.flip(box.inSession((session) => SandboxTools.start(session, run, relative)))).toEqual(path)
      expect(yield* Effect.flip(box.inSession((session) => SandboxTools.observe(session, relative)))).toEqual(path)
      expect(yield* Effect.flip(box.inSession((session) => SandboxTools.collect(session, relative)))).toEqual(path)
      expect(yield* Effect.flip(box.inSession((session) => SandboxTools.cancel(session, relative)))).toEqual(path)
    }))

  it.live("a session that can't run anything fails each operation ToolUnavailable; a failing script names its exit", () =>
    Effect.gen(function*() {
      const down: Sandbox.Session = {
        id: "down",
        remoteId: "down",
        workdir: "/workspace",
        spawn: () => Effect.fail(new ProviderError({ code: "unavailable", message: "down" })),
        readFile: () => Effect.die("unused"),
        writeFile: () => Effect.die("unused")
      }
      const options = { key: "k", callsDirectory: "/calls" }
      const unavailable = new SandboxTools.ToolUnavailable({ code: "unavailable" })
      expect(yield* Effect.flip(SandboxTools.start(down, { tool: "run", command: "true" }, options))).toEqual(
        unavailable
      )
      expect(yield* Effect.flip(SandboxTools.observe(down, options))).toEqual(unavailable)
      expect(yield* Effect.flip(SandboxTools.collect(down, options))).toEqual(unavailable)
      expect(yield* Effect.flip(SandboxTools.cancel(down, options))).toEqual(unavailable)
      // A calls directory the user can't write: every script that writes stops at once, naming its step.
      const box = machine()
      const unwritable = { key: "k", callsDirectory: "/proc/smthrs-calls" }
      const failed = new SandboxTools.ToolUnavailable({ code: "unknown", exitCode: 125 })
      expect(
        yield* Effect.flip(
          box.inSession((session) => SandboxTools.start(session, { tool: "run", command: "true" }, unwritable))
        )
      ).toEqual(failed)
      expect(yield* Effect.flip(box.inSession((session) => SandboxTools.cancel(session, unwritable)))).toEqual(failed)
      // A shell that dies under any script names its exit, never a state it didn't read.
      const dying: Sandbox.Session = {
        ...down,
        spawn: () => Effect.succeed({ stdout: Stream.empty, stderr: Stream.empty, exitCode: Effect.succeed(126) })
      }
      const died = new SandboxTools.ToolUnavailable({ code: "unknown", exitCode: 126 })
      expect(yield* Effect.flip(SandboxTools.start(dying, { tool: "run", command: "true" }, options))).toEqual(died)
      expect(yield* Effect.flip(SandboxTools.observe(dying, options))).toEqual(died)
      expect(yield* Effect.flip(SandboxTools.cancel(dying, options))).toEqual(died)
    }))

  it.live("records a span per operation with its outcome, never the command", () =>
    Effect.gen(function*() {
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        }
      })
      const box = machine()
      const key = keyOf()
      const secret = "sentinel-0c55"
      yield* box.inSession((session) =>
        Effect.gen(function*() {
          yield* SandboxTools.start(session, { tool: "run", command: `echo ${secret}` }, {
            key,
            callsDirectory: box.calls
          })
          yield* Effect.flip(SandboxTools.collect(session, { key: "none", callsDirectory: box.calls }))
          yield* SandboxTools.cancel(session, { key: "other", callsDirectory: box.calls })
        })
      ).pipe(Effect.withTracer(tracer))
      yield* finished(box, key).pipe(Effect.withTracer(tracer))
      const commands = spans.filter((span) => span.name === "sandbox.command")
      const attributes = commands.map((span) => Object.fromEntries(span.attributes))
      expect(attributes.slice(0, 3)).toEqual([
        { "smithers.sandbox.command.op": "start", "smithers.sandbox.command.outcome": "done" },
        { "smithers.sandbox.command.op": "collect", "smithers.sandbox.command.outcome": "ToolLost" },
        { "smithers.sandbox.command.op": "cancel", "smithers.sandbox.command.outcome": "done" }
      ])
      expect(attributes.at(-1)).toEqual({
        "smithers.sandbox.command.op": "observe",
        "smithers.sandbox.command.outcome": "finished"
      })
      expect(JSON.stringify(attributes)).not.toContain(secret)
    }), slow)
})

// The job: `SandboxCommand.make` over the box operations above, run by the in-memory flow engine, so each round's
// start, probes, collect and cancel are real `ExternalJob` steps on a real detached process.

const Target = Schema.Struct({ machine: Schema.String })

const boxes = new Map<string, ReturnType<typeof machine>>()
const reach = (target: typeof Target.Type) =>
  Effect.sync(() => {
    const box = boxes.get(target.machine)!
    return {
      start: (call, key) => box.inSession((session) => SandboxCommand.onSession(session, box.calls).start(call, key)),
      observe: (key) => box.inSession((session) => SandboxCommand.onSession(session, box.calls).observe(key)),
      collect: (key) => box.inSession((session) => SandboxCommand.onSession(session, box.calls).collect(key)),
      cancel: (key) => box.inSession((session) => SandboxCommand.onSession(session, box.calls).cancel(key))
    } satisfies SandboxCommand.Commands<ProviderError>
  })

const jobOf = (timeout: string) => {
  const Job = SandboxCommand.make(`test/command-${timeout.replace(" ", "-")}`, {
    target: Target,
    error: ProviderError,
    probe: { every: "100 millis", max: "200 millis" },
    timeout: timeout as Duration.Input
  })
  const Run = Flow.make(`test/run-command-${timeout.replace(" ", "-")}`, {
    payload: Job.payloadSchema,
    success: Job.successSchema,
    error: Job.errorSchema,
    body: Node.capture({ job: Job._tag }, (payload) => Job.call(payload))
  })
  const layer = Layer.mergeAll(Job.toLayer(SandboxCommand.operations(reach)), Interpreter.layer(Run)).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(FlowEngine.layerMemory),
    Layer.provideMerge(NodeCrypto.layer)
  )
  return { Job, Run, layer }
}

describe("SandboxCommand.make", () => {
  const job = jobOf("30 seconds")

  it.live("runs the command once to its result, parking between probes", () =>
    Effect.gen(function*() {
      const box = machine()
      boxes.set("a", box)
      const workdir = yield* box.inSession((session) => Effect.succeed(session.workdir))
      const result = yield* job.Run.execute({
        target: { machine: "a" },
        call: { tool: "run", command: "echo ran >> runs.log; sleep 1; echo done-$((2+3))" }
      })
      expect(result).toMatchObject({ exitCode: 0, stdout: "done-5\n", timedOut: false })
      expect(readFileSync(join(workdir, "runs.log"), "utf8")).toBe("ran\n")
      expect(readdirSync(box.calls)).toHaveLength(1)
    }).pipe(Effect.provide(job.layer)), slow)

  it.live(
    "a command whose runner dies is lost: the job cancels it and fails ExternalJobLost",
    () =>
      Effect.gen(function*() {
        const box = machine()
        boxes.set("b", box)
        const running = yield* Effect.forkChild(Effect.exit(job.Run.execute({
          target: { machine: "b" },
          call: { tool: "run", command: "sleep 30" }
        })))
        const pid = Number(
          yield* until(() => {
            const [fence] = existsSync(box.calls) ? readdirSync(box.calls) : []
            const file = fence === undefined ? undefined : join(box.calls, fence, "pid")
            return file !== undefined && existsSync(file) ? readFileSync(file, "utf8").split(" ")[0] : undefined
          })
        )
        process.kill(-pid, "SIGKILL")
        const exit = yield* Fiber.join(running)
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(ExternalJob.ExternalJobLost)
        const [fence] = readdirSync(box.calls)
        expect(existsSync(join(box.calls, fence!, "cancelled"))).toBe(true)
      }).pipe(Effect.provide(job.layer)),
    slow
  )

  it.live("a job past its deadline cancels the command and fails ExternalJobTimedOut", () => {
    const short = jobOf("2 seconds")
    return Effect.gen(function*() {
      const box = machine()
      boxes.set("c", box)
      const exit = yield* Effect.exit(short.Run.execute({
        target: { machine: "c" },
        call: { tool: "run", command: "sleep 30" }
      }))
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(ExternalJob.ExternalJobTimedOut)
      const [fence] = readdirSync(box.calls)
      const pid = Number(readFileSync(join(box.calls, fence!, "pid"), "utf8").split(" ")[0])
      yield* until(() => !alive(pid) ? true : undefined)
    }).pipe(Effect.provide(short.layer))
  }, slow)

  it.live(
    "a start that never answers is abandoned at the deadline: the key is cancelled, and the job times out",
    () =>
      Effect.gen(function*() {
        const cancelled: Array<string> = []
        const Hanging = SandboxCommand.make("test/hanging", {
          target: Target,
          probe: { every: "100 millis", max: "100 millis" },
          timeout: "1 second",
          restarts: 1
        })
        const Run = Flow.make("test/run-hanging", {
          payload: Hanging.payloadSchema,
          success: Hanging.successSchema,
          error: Hanging.errorSchema,
          body: Node.capture({ job: Hanging._tag }, (payload) => Hanging.call(payload))
        })
        const box: SandboxCommand.Commands = {
          start: () => Effect.never,
          observe: () => Effect.die("never started"),
          collect: () => Effect.die("never started"),
          cancel: (key) => Effect.sync(() => void cancelled.push(key))
        }
        const exit = yield* Effect.exit(
          Run.execute({ target: { machine: "hanging" }, call: { tool: "run", command: "true" } })
        )
          .pipe(
            Effect.provide(
              Layer.mergeAll(
                Hanging.toLayer(SandboxCommand.operations(() => Effect.succeed(box))),
                Interpreter.layer(Run)
              )
                .pipe(
                  Layer.provideMerge(Action.layerImplementations),
                  Layer.provideMerge(FlowEngine.layerMemory),
                  Layer.provideMerge(NodeCrypto.layer)
                )
            )
          )
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(ExternalJob.ExternalJobTimedOut)
        expect(cancelled).toEqual([expect.stringMatching(/#g1$/)])
      }),
    slow
  )

  it("declares its defaults, and the tools' failures beside how reaching the box fails", () => {
    expect(SandboxCommand.defaults).toEqual({
      probe: { every: "1 second", max: "20 seconds" },
      timeout: `${SandboxTools.limits.maxTimeoutSeconds + 300} seconds`
    })
    class Unreachable extends Schema.TaggedError<Unreachable>()("test/Unreachable", {}) {}
    const Declared = SandboxCommand.make("test/declared", { target: Target, error: Unreachable })
    expect(Declared.flows.map((flow) => flow._tag)).toEqual([
      "test/declared",
      "test/declared/launch",
      "test/declared/observe"
    ])
    const is = Schema.is(Declared.errorSchema)
    expect(is(new Unreachable())).toBe(true)
    expect(is(new SandboxTools.ToolLost())).toBe(true)
    expect(is(new ExternalJob.ExternalJobLost({ key: "k", message: "m" }))).toBe(true)
    // With no `error`, reaching the box can fail only as a tool does.
    const Plain = SandboxCommand.make("test/plain", { target: Target })
    expect(Schema.is(Plain.errorSchema)(new Unreachable())).toBe(false)
    expect(Schema.is(Plain.errorSchema)(new SandboxTools.ToolUnavailable({ code: "unavailable" }))).toBe(true)
  })

  it("classes the tools' failures for the engine: only a session that couldn't answer is retried", () => {
    expect(Fault.of(new SandboxTools.ToolRefused({ reason: "path" })).class).toBe("user")
    expect(Fault.of(new SandboxTools.ToolLost()).class).toBe("dependency")
    expect(Fault.of(new SandboxTools.ToolUnavailable({ code: "unavailable" })).class).toBe("infra")
    expect(Fault.of(new SandboxTools.ToolUnavailable({ code: "timeout" })).class).toBe("infra")
    expect(Fault.of(new SandboxTools.ToolUnavailable({ code: "unknown", exitCode: 125 })).class).toBe("bug")
  })
})
