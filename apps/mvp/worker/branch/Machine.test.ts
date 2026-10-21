// What a branch's machine does for its tools and lifecycle (worker/branch/Machine.ts,
// docs/features/sandbox-tools.md#the-machine), over a `Box` whose sessions are real local processes in a scratch git
// clone and whose storage is in memory: the stand-in for the Cloudflare container and its Durable Object storage
// (worker/BranchSandboxes.ts), whose real container the e2e suite drives. `@smthrs/sandbox`'s `SandboxTools` run their
// real scripts and real git here. The box maps the container's `/home` onto a scratch directory, and it answers its
// root commands, provisioning a person's user and the idle probe, from the test, because they need root, tmux and
// Linux's /proc; this host has none of them.
import { Logger as StructuredLogger } from "@smthrs/observability"
import { RemoteChildProcessSpawner, type Sandbox } from "@smthrs/sandbox"
import { Effect, Exit, Logger, Metric, Stream } from "effect"
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Readable } from "node:stream"
import { afterAll, describe, expect, test } from "vitest"
import { SANDBOX_USER } from "../../src/features/terminal/contract.ts"
import * as Machine from "./Machine.ts"
import { provisionArgv, userOf } from "./Users.ts"

const root = realpathSync(mkdtempSync(join(tmpdir(), "smthrs-machine-")))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const { ProviderError } = RemoteChildProcessSpawner

const git = (cwd: string, ...args: Array<string>) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim()

/** The branch's repository: one commit of README.md, `base`. */
const origin = join(root, "origin")
mkdirSync(origin)
git(origin, "init", "-q", "-b", "main")
writeFileSync(join(origin, "README.md"), "hello\n")
git(origin, "add", ".")
git(origin, "commit", "-q", "-m", "base")
const base = git(origin, "rev-parse", "HEAD")

let machines = 0
/** A fresh machine's checkout: a clone of the branch, as a wake makes one. Empty with `clone: false`. */
const checkout = (clone = true) => {
  const workdir = join(root, `machine-${++machines}`)
  if (clone) execFileSync("git", ["clone", "-q", origin, workdir])
  else mkdirSync(workdir)
  return workdir
}

const fromReadable = (readable: Readable) =>
  Stream.fromAsyncIterable(
    readable as AsyncIterable<Uint8Array>,
    (cause) => new ProviderError({ code: "unknown", message: String(cause) }),
  ).pipe(Stream.map((chunk) => new Uint8Array(chunk)))

/** A session on the machine: `sh -c` in its checkout, with the container's `/home` at `homes`. */
const sessionAt = (workdir: string, homes: string): Sandbox.Session => ({
  id: "machine",
  remoteId: "machine",
  workdir,
  spawn: (command, options) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        spawn("sh", ["-c", command.replaceAll("'/home/", `'${homes}/`)], {
          cwd: options.cwd ?? workdir,
          stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        })
      ),
      (child) => Effect.sync(() => child.exitCode === null && child.kill("SIGKILL")),
    ).pipe(Effect.map((child) => {
      const exited = new Promise<number>((resolve) => child.once("close", (code) => resolve(code ?? 137)))
      if (options.stdin !== undefined) child.stdin!.end(options.stdin)
      return {
        stdout: fromReadable(child.stdout!),
        stderr: fromReadable(child.stderr!),
        exitCode: Effect.promise(() => exited),
      }
    })),
  readFile: () => Effect.die("the tools read through commands"),
  writeFile: () => Effect.die("the tools write through commands"),
})

/** A session whose machine can't run anything. */
const down = (workdir: string): Sandbox.Session => ({
  ...sessionAt(workdir, root),
  spawn: () => Effect.fail(new ProviderError({ code: "unavailable", message: "down" })),
})

/** The object's storage, in memory. */
const memory = (entries: Record<string, unknown> = {}) => {
  const map = new Map<string, unknown>(Object.entries(entries))
  const store: Machine.Store<never> = {
    get: <A>(key: string) => Effect.sync(() => map.get(key) as A | undefined),
    put: (key, value) => Effect.sync(() => void map.set(key, value)),
    delete: (key) => Effect.sync(() => map.delete(key)),
    list: <A>(prefix: string) =>
      Effect.sync(() => new Map([...map].filter(([key]) => key.startsWith(prefix))) as ReadonlyMap<string, A>),
  }
  return { map, store }
}

interface BoxOptions {
  readonly workdir?: string
  readonly store?: ReturnType<typeof memory>
  /** What a root command answers: `provision` and `probe` by their argv. 0 unless set. */
  readonly root?: (argv: ReadonlyArray<string>) => Effect.Effect<number, unknown>
  /** The users whose sessions can't run anything. */
  readonly downFor?: ReadonlyArray<string>
}

/** A machine's box over its checkout, recording every root command, session and stop. */
const boxOf = (options: BoxOptions = {}) => {
  const workdir = options.workdir ?? checkout()
  const homes = join(root, `homes-${machines}`)
  const { map, store } = options.store ?? memory()
  const runs: Array<{ readonly argv: ReadonlyArray<string>; readonly user: string }> = []
  const sessions: Array<string> = []
  const state = { running: true, destroyed: 0 }
  const box: Machine.Box<never> = {
    sessionAs: (user) =>
      Effect.sync(() => {
        sessions.push(user)
        return options.downFor?.includes(user) === true ? down(workdir) : sessionAt(workdir, homes)
      }),
    run: (argv, user) =>
      Effect.suspend(() => {
        runs.push({ argv, user })
        return options.root?.(argv) ?? Effect.succeed(0)
      }),
    running: Effect.sync(() => state.running),
    destroy: Effect.sync(() => {
      state.destroyed++
      state.running = false
    }),
    storage: store,
  }
  return { box, workdir, homes, map, store: { map, store }, runs, sessions, state }
}

/** Runs `effect` with a logger and metric registry of its own: its result, log lines and the checkpoints it counted. */
const observed = async <A, E>(effect: Effect.Effect<A, E>) => {
  const lines: Array<ReturnType<typeof StructuredLogger.formatStructured.log>> = []
  const logger = Logger.make((options) => void lines.push(StructuredLogger.formatStructured.log(options)))
  const registry: Metric.MetricRegistry = new Map()
  const value = await Effect.runPromise(
    effect.pipe(
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  )
  const counted = (op: string, outcome: string) =>
    Effect.runSync(
      Metric.value(Metric.withAttributes(Machine.checkpoints, { op, outcome })).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ).count
  return { value, lines, counted }
}

const PERSON = "person-a"
const USER = userOf(PERSON)
let calls = 0
const tool = (box: Machine.Box<never>, call: Parameters<typeof Machine.tool>[1]["call"], generation = 1, callId = `c-${++calls}`) =>
  Machine.tool(box, { ownerId: PERSON, callId, call, generation })

/** The checkpoint record the object's storage holds. */
const saved = (map: Map<string, unknown>) =>
  map.get("checkpoint") as { generation: number; head: string; seq: number; pieces: number; bytes: number; bundleBytes?: number }

describe("tool", () => {
  test("runs a call as the person's own user, made first, and saves the working copy after a write or a run only", async () => {
    const machine = boxOf()
    await Effect.runPromise(Machine.restore(machine.box, 1))

    const wrote = await observed(tool(machine.box, { tool: "write", path: "hello.txt", content: "hi\n" }))
    expect(wrote.value).toEqual({ _tag: "Done", result: { tool: "write", path: "hello.txt", bytes: 3 }, generation: 1 })
    expect(machine.runs).toEqual([{ argv: provisionArgv(USER), user: "root" }])
    expect(machine.sessions).toEqual([USER, SANDBOX_USER])
    expect(wrote.counted("save", "saved")).toBe(1)
    expect(saved(machine.map)).toMatchObject({ generation: 1, head: git(machine.workdir, "rev-parse", "HEAD"), pieces: 1 })
    expect(machine.map.get("activeAt")).toEqual(expect.any(Number))

    const read = await observed(tool(machine.box, { tool: "read", path: "hello.txt" }))
    expect(read.value).toMatchObject({ _tag: "Done", result: { tool: "read", content: "hi\n" } })
    expect(read.counted("save", "saved")).toBe(0)

    const ran = await observed(tool(machine.box, { tool: "run", command: "echo ran >> runs.log; cat runs.log" }, 1, "run-1"))
    expect(ran.value).toMatchObject({ _tag: "Done", result: { tool: "run", exitCode: 0, stdout: "ran\n" } })
    expect(ran.counted("save", "saved")).toBe(1)
    // The command's fence and result are in the person's own home, outside the checkout.
    expect(existsSync(join(machine.homes, USER, ".smithers", "calls", "run-1", "exit"))).toBe(true)
    expect(Machine.callsDirectory(USER)).toBe(`/home/${USER}/.smithers/calls`)
  })

  test("a refusal, a lost command, a failed provision and a failing session are their outcomes; a broken host is logged", async () => {
    const machine = boxOf()
    expect(await Effect.runPromise(tool(machine.box, { tool: "read", path: "../outside" }))).toEqual({
      _tag: "Refused",
      reason: "path",
    })
    // An earlier attempt started this command and never recorded how it ended.
    mkdirSync(join(machine.homes, USER, ".smithers", "calls", "started"), { recursive: true })
    expect(await Effect.runPromise(tool(machine.box, { tool: "run", command: "touch ran" }, 1, "started"))).toEqual({
      _tag: "Lost",
    })
    expect(existsSync(join(machine.workdir, "ran"))).toBe(false)

    const unprovisioned = boxOf({ root: () => Effect.succeed(1) })
    expect(await Effect.runPromise(tool(unprovisioned.box, { tool: "status" }))).toEqual({ _tag: "Unavailable" })
    expect(unprovisioned.sessions).toEqual([])

    const failing = boxOf({ downFor: [USER] })
    expect(await Effect.runPromise(tool(failing.box, { tool: "status" }))).toEqual({ _tag: "Unavailable" })

    const broken = boxOf({ root: () => Effect.fail(new Error("container gone")) })
    const logged = await observed(tool(broken.box, { tool: "status" }))
    expect(logged.value).toEqual({ _tag: "Unavailable" })
    expect(logged.lines).toMatchObject([{ message: "sandbox.object.tool", level: "WARN" }])
    expect(logged.lines[0]!.annotations).toHaveProperty("errorCode")
  })
})

describe("tool across machines", () => {
  test("a command a restarted machine's earlier generation started is lost, never run again; the same generation reads its result", async () => {
    const store = memory()
    const first = boxOf({ store })
    const call = { tool: "run", command: "echo ran >> runs.log; cat runs.log" } as const
    const ran = await Effect.runPromise(tool(first.box, call, 1, "across"))
    expect(ran).toMatchObject({ _tag: "Done", result: { stdout: "ran\n" }, generation: 1 })
    expect(store.map.get("run:across")).toEqual({ generation: 1, at: expect.any(Number) })
    // The same generation again answers what the box recorded.
    expect(await Effect.runPromise(tool(first.box, call, 1, "across"))).toEqual(ran)
    // A new machine (a fresh disk with no fence) under the same object: the command is lost, and nothing runs.
    const second = boxOf({ store })
    expect(await Effect.runPromise(tool(second.box, call, 2, "across"))).toEqual({ _tag: "Lost" })
    expect(existsSync(join(second.workdir, "runs.log"))).toBe(false)
    // Reads and writes carry no generation fence: they repeat safely.
    expect(await Effect.runPromise(tool(second.box, { tool: "read", path: "README.md" }, 2, "across-read"))).toMatchObject({
      _tag: "Done",
    })
    expect(store.map.has("run:across-read")).toBe(false)
  })
})

describe("command records", () => {
  test("a new command drops the records older than a day, and keeps the ones a retry may still ask for", async () => {
    const now = Date.now()
    const recent = { generation: 1, at: now - 60_000 }
    const store = memory({
      // A day and a minute old, a bare generation from before records were dated, and a minute old.
      "run:expired": { generation: 1, at: now - Machine.RUN_RECORD_MS - 60_000 },
      "run:undated": 1,
      "run:recent": recent,
      checkpoint: { generation: 1, head: base, seq: 1, pieces: 0, bytes: 0 },
    })
    const machine = boxOf({ store })
    await Effect.runPromise(tool(machine.box, { tool: "run", command: "true" }, 2, "fresh"))
    expect([...store.map.keys()].filter((key) => key.startsWith("run:")).sort()).toEqual(["run:fresh", "run:recent"])
    expect(store.map.get("run:fresh")).toEqual({ generation: 2, at: expect.any(Number) })
    // Other state stays.
    expect(store.map.has("checkpoint")).toBe(true)
    // The kept record still makes its command lost on a later generation, and a read records nothing.
    expect(await Effect.runPromise(tool(machine.box, { tool: "run", command: "true" }, 2, "recent"))).toEqual({ _tag: "Lost" })
    expect(store.map.get("run:recent")).toEqual(recent)
  })

  test("a bare generation from before records were dated still settles its command lost on another generation", async () => {
    const machine = boxOf({ store: memory({ "run:legacy": 1 }) })
    expect(await Effect.runPromise(tool(machine.box, { tool: "run", command: "touch ran" }, 2, "legacy"))).toEqual({
      _tag: "Lost",
    })
    expect(existsSync(join(machine.workdir, "ran"))).toBe(false)
  })
})

describe("save", () => {
  test("skipped until the generation's restore ran, or without a checkout; failed when the machine can't answer", async () => {
    const unrestored = boxOf()
    writeFileSync(join(unrestored.workdir, "new.txt"), "new\n")
    expect(await Effect.runPromise(Machine.save(unrestored.box, 2))).toBe("skipped")
    expect(unrestored.map.has("checkpoint")).toBe(false)

    const empty = boxOf({ workdir: checkout(false), store: memory({ restored: 1 }) })
    const skipped = await observed(Machine.save(empty.box, 1))
    expect(skipped.value).toBe("skipped")
    expect(skipped.counted("save", "skipped")).toBe(1)
    expect(skipped.lines).toMatchObject([{ message: "sandbox.checkpoint.save", level: "WARN", annotations: { outcome: "skipped" } }])

    const failing = boxOf({ store: memory({ restored: 1 }), downFor: [SANDBOX_USER] })
    const failed = await observed(Machine.save(failing.box, 1))
    expect(failed.value).toBe("failed")
    expect(failed.counted("save", "failed")).toBe(1)
    expect(failing.map.has("checkpoint")).toBe(false)
  })

  test("a working copy over the checkpoint limit isn't saved, and the last checkpoint stays", async () => {
    const machine = boxOf({ store: memory({ restored: 1 }) })
    writeFileSync(join(machine.workdir, "small.txt"), "small\n")
    expect(await Effect.runPromise(Machine.save(machine.box, 1))).toBe("saved")
    const before = saved(machine.map)
    writeFileSync(join(machine.workdir, "huge.bin"), new Uint8Array(8 * 1024 * 1024 + 1).fill(7))
    const large = await observed(Machine.save(machine.box, 1))
    expect(large.value).toBe("too_large")
    expect(large.counted("save", "too_large")).toBe(1)
    expect(saved(machine.map)).toEqual(before)
  }, 60_000)

  test("splits a large patch into pieces, and drops the pieces a smaller one no longer needs", async () => {
    const machine = boxOf({ store: memory({ restored: 1 }) })
    writeFileSync(join(machine.workdir, "big.txt"), "line of text\n".repeat(Math.ceil((2.5 * Machine.CHUNK_BYTES) / 13)))
    expect(await Effect.runPromise(Machine.save(machine.box, 1))).toBe("saved")
    expect(saved(machine.map)).toMatchObject({ seq: 1, pieces: 3 })
    expect([0, 1, 2].map((index) => (machine.map.get(`checkpoint:1:${index}`) as Uint8Array).byteLength)).toEqual([
      Machine.CHUNK_BYTES,
      Machine.CHUNK_BYTES,
      saved(machine.map).bytes - 2 * Machine.CHUNK_BYTES,
    ])

    rmSync(join(machine.workdir, "big.txt"))
    writeFileSync(join(machine.workdir, "small.txt"), "small\n")
    expect(await Effect.runPromise(Machine.save(machine.box, 1))).toBe("saved")
    expect(saved(machine.map)).toMatchObject({ seq: 2, pieces: 1 })
    expect([...machine.map.keys()].filter((key) => key.startsWith("checkpoint:"))).toEqual(["checkpoint:2:0"])
  })

  test("a save that stops part way leaves the last checkpoint whole, and the next generation restores that one", async () => {
    const first = boxOf({ store: memory({ restored: 1 }) })
    writeFileSync(join(first.workdir, "kept.txt"), "saved before\n")
    expect(await Effect.runPromise(Machine.save(first.box, 1))).toBe("saved")
    const kept = saved(first.map)

    // The object restarts while it writes the next checkpoint's third piece.
    writeFileSync(join(first.workdir, "big.txt"), "line of text\n".repeat(Math.ceil((2.5 * Machine.CHUNK_BYTES) / 13)))
    const stopping: Machine.Box<never> = {
      ...first.box,
      storage: {
        ...first.box.storage,
        put: (key, value) =>
          key === "checkpoint:2:2" ? Effect.die(new Error("object restarted")) : first.box.storage.put(key, value),
      },
    }
    expect(Exit.isFailure(await Effect.runPromiseExit(Machine.save(stopping, 1)))).toBe(true)
    expect(saved(first.map)).toEqual(kept)
    expect(first.map.has("checkpoint:1:0")).toBe(true)

    // A smaller retry must also reclaim the surplus pieces of the interrupted save.
    rmSync(join(first.workdir, "big.txt"))
    expect(await Effect.runPromise(Machine.save(first.box, 1))).toBe("saved")
    expect([...first.map.keys()].filter((key) => key.startsWith("checkpoint:"))).toEqual(["checkpoint:3:0"])
    const second = boxOf({ store: first.store })
    expect(await Effect.runPromise(Machine.restore(second.box, 2))).toBe("restored")
    expect(readFileSync(join(second.workdir, "kept.txt"), "utf8")).toBe("saved before\n")
    expect(existsSync(join(second.workdir, "big.txt"))).toBe(false)
  })
})

describe("restore", () => {
  test("puts an earlier generation's checkpoint back on the next generation's fresh clone, once", async () => {
    const first = boxOf()
    expect(await Effect.runPromise(Machine.restore(first.box, 1))).toBe("none")
    await Effect.runPromise(tool(first.box, { tool: "write", path: "notes/todo.txt", content: "kept\n" }))
    await Effect.runPromise(tool(first.box, { tool: "run", command: "printf 'changed\\n' > README.md" }))

    // The branch moved on since; the machine restarts from a fresh clone of it, its storage kept.
    writeFileSync(join(origin, "later.txt"), "later\n")
    git(origin, "add", ".")
    git(origin, "commit", "-q", "-m", "later")
    const second = boxOf({ store: first.store })
    const restored = await observed(Machine.restore(second.box, 2))

    expect(restored.value).toBe("restored")
    expect(restored.counted("restore", "restored")).toBe(1)
    expect(restored.lines).toMatchObject([{ message: "sandbox.checkpoint.restore", level: "INFO", annotations: { outcome: "restored" } }])
    expect(git(second.workdir, "rev-parse", "HEAD")).toBe(base)
    expect(readFileSync(join(second.workdir, "notes/todo.txt"), "utf8")).toBe("kept\n")
    expect(readFileSync(join(second.workdir, "README.md"), "utf8")).toBe("changed\n")
    expect(second.sessions).toEqual([SANDBOX_USER])

    // Once per generation: the next wake of the same generation changes nothing.
    writeFileSync(join(second.workdir, "README.md"), "edited since\n")
    expect(await Effect.runPromise(Machine.restore(second.box, 2))).toBe("done")
    expect(readFileSync(join(second.workdir, "README.md"), "utf8")).toBe("edited since\n")
  })

  test("its own generation's checkpoint is nothing to restore; one that can't go back is kept aside, never lost", async () => {
    const same = boxOf({ store: memory({ checkpoint: { generation: 3, head: base, seq: 1, pieces: 0, bytes: 0 } }) })
    expect(await Effect.runPromise(Machine.restore(same.box, 3))).toBe("none")
    expect(same.map.get("restored")).toBe(3)
    expect(same.sessions).toEqual([])

    const gone = { generation: 1, head: "0".repeat(40), seq: 4, pieces: 1, bytes: 3 }
    const missing = boxOf({ store: memory({ checkpoint: gone, "checkpoint:4:0": new Uint8Array([1, 2, 3]) }) })
    const notFound = await observed(Machine.restore(missing.box, 2))
    expect(notFound.value).toBe("not_found")
    expect(notFound.counted("restore", "not_found")).toBe(1)
    expect(notFound.lines).toMatchObject([{ level: "WARN", annotations: { outcome: "not_found" } }])
    expect(missing.map.get("restored")).toBe(2)
    // Kept aside, pieces and all: the next save takes a sequence after it, so it can't overwrite or delete them.
    expect(missing.map.get("stranded:4")).toEqual(gone)
    expect(missing.map.has("checkpoint")).toBe(false)
    writeFileSync(join(missing.workdir, "since.txt"), "since\n")
    expect(await Effect.runPromise(Machine.save(missing.box, 2))).toBe("saved")
    expect(saved(missing.map)).toMatchObject({ generation: 2, seq: 5 })
    expect(missing.map.get("checkpoint:4:0")).toEqual(new Uint8Array([1, 2, 3]))
    expect(missing.map.get("stranded:4")).toEqual(gone)

    // A record whose piece was lost: the patch is all zeros, and git refuses it.
    const lost = { generation: 1, head: base, seq: 1, pieces: 1, bytes: 64 }
    const broken = boxOf({ store: memory({ checkpoint: lost }) })
    expect(await Effect.runPromise(Machine.restore(broken.box, 2))).toBe("failed")
    expect(broken.map.get("restored")).toBe(2)
    expect(broken.map.get("stranded:1")).toEqual(lost)
    expect(git(broken.workdir, "status", "--porcelain")).toBe("")
  })

  test("a machine that doesn't answer fails the restore and records nothing, so a save can't replace the checkpoint", async () => {
    const first = boxOf({ store: memory({ restored: 1 }) })
    writeFileSync(join(first.workdir, "kept.txt"), "kept\n")
    expect(await Effect.runPromise(Machine.save(first.box, 1))).toBe("saved")
    const kept = saved(first.map)

    const down = boxOf({ store: first.store, downFor: [SANDBOX_USER] })
    const failed = await observed(Effect.flip(Machine.restore(down.box, 2)))
    expect(failed.value).toMatchObject({ _tag: "@smthrs/sandbox/SandboxTools/ToolUnavailable", code: "unavailable" })
    expect(failed.counted("restore", "unavailable")).toBe(1)
    expect(down.map.get("restored")).toBe(1)
    // Not restored yet: the save is skipped, and the checkpoint stays for the next wake.
    expect(await Effect.runPromise(Machine.save(down.box, 2))).toBe("skipped")
    expect(saved(down.map)).toEqual(kept)

    const second = boxOf({ store: first.store })
    expect(await Effect.runPromise(Machine.restore(second.box, 2))).toBe("restored")
    expect(readFileSync(join(second.workdir, "kept.txt"), "utf8")).toBe("kept\n")
  })

  test("a commit made in the machine, which the branch doesn't have, comes back on the next generation", async () => {
    const first = boxOf({ store: memory({ restored: 1 }) })
    writeFileSync(join(first.workdir, "local.txt"), "committed here\n")
    git(first.workdir, "add", "local.txt")
    git(first.workdir, "commit", "-q", "-m", "local")
    writeFileSync(join(first.workdir, "after.txt"), "after\n")
    expect(await Effect.runPromise(Machine.save(first.box, 1))).toBe("saved")
    expect(saved(first.map).bundleBytes).toBeGreaterThan(0)

    const second = boxOf({ store: first.store })
    expect(await Effect.runPromise(Machine.restore(second.box, 2))).toBe("restored")
    expect(git(second.workdir, "log", "-1", "--format=%s")).toBe("local")
    expect(readFileSync(join(second.workdir, "local.txt"), "utf8")).toBe("committed here\n")
    expect(readFileSync(join(second.workdir, "after.txt"), "utf8")).toBe("after\n")
  })
})

describe("sleepIfIdle", () => {
  const PROBE_SECONDS = "90"
  const isProbe = (argv: ReadonlyArray<string>) => argv[3] === "probe"

  test("a generation that isn't running any more is gone, and nothing is asked of it", async () => {
    const other = boxOf({ store: memory({ generation: 4 }) })
    expect(await Effect.runPromise(Machine.sleepIfIdle(other.box, 3, 1_000))).toBe("gone")
    const stopped = boxOf({ store: memory({ generation: 3 }) })
    stopped.state.running = false
    expect(await Effect.runPromise(Machine.sleepIfIdle(stopped.box, 3, 1_000))).toBe("gone")
    expect([...other.runs, ...stopped.runs]).toEqual([])
  })

  test("busy while used within the idle time, while the probe finds work, or when its checkpoint can't be saved", async () => {
    const recent = boxOf({ store: memory({ generation: 3 }) })
    await Effect.runPromise(Machine.touch(recent.box))
    expect(await Effect.runPromise(Machine.sleepIfIdle(recent.box, 3, 60_000))).toBe("busy")
    expect(recent.runs).toEqual([])

    const working = boxOf({ store: memory({ generation: 3 }), root: (argv) => Effect.succeed(isProbe(argv) ? 3 : 0) })
    expect(await Effect.runPromise(Machine.sleepIfIdle(working.box, 3, 89_001))).toBe("busy")
    expect(working.runs).toHaveLength(1)
    expect(working.runs[0]!.user).toBe("root")
    expect(working.runs[0]!.argv.slice(0, 2)).toEqual(["sh", "-c"])
    expect(working.runs[0]!.argv.slice(3)).toEqual(["probe", PROBE_SECONDS])
    expect(working.state.destroyed).toBe(0)

    const unsaved = boxOf({ store: memory({ generation: 3, restored: 3 }), downFor: [SANDBOX_USER] })
    expect(await Effect.runPromise(Machine.sleepIfIdle(unsaved.box, 3, 1_000))).toBe("busy")
    expect(unsaved.state.destroyed).toBe(0)
  })

  test("idle, it saves the working copy and stops the machine; a generation not restored yet stops without saving", async () => {
    const idle = boxOf({ store: memory({ generation: 3, restored: 3 }) })
    writeFileSync(join(idle.workdir, "unsaved.txt"), "typed in a terminal\n")
    expect(await Effect.runPromise(Machine.sleepIfIdle(idle.box, 3, 1_000))).toBe("slept")
    expect(idle.state).toEqual({ running: false, destroyed: 1 })
    expect(saved(idle.map)).toMatchObject({ generation: 3, head: git(idle.workdir, "rev-parse", "HEAD"), pieces: 1 })

    const fresh = boxOf({ store: memory({ generation: 3 }) })
    expect(await Effect.runPromise(Machine.sleepIfIdle(fresh.box, 3, 1_000))).toBe("slept")
    expect(fresh.state.destroyed).toBe(1)
    expect(fresh.map.has("checkpoint")).toBe(false)
  })

  test("a save a closed terminal left due runs at the next ask, busy or not, and only once", async () => {
    const machine = boxOf({ store: memory({ generation: 3, restored: 3 }) })
    writeFileSync(join(machine.workdir, "typed.txt"), "typed in a terminal\n")
    await Effect.runPromise(Machine.saveLater(machine.box))
    expect(machine.map.get("saveDue")).toBe(true)
    expect(machine.map.has("checkpoint")).toBe(false)
    // Used just now, so the machine stays awake; the save runs anyway, in the ask.
    expect(await Effect.runPromise(Machine.sleepIfIdle(machine.box, 3, 60_000))).toBe("busy")
    expect(saved(machine.map)).toMatchObject({ generation: 3, seq: 1 })
    expect(machine.map.has("saveDue")).toBe(false)
    // Nothing due: the next ask saves nothing.
    expect(await Effect.runPromise(Machine.sleepIfIdle(machine.box, 3, 60_000))).toBe("busy")
    expect(saved(machine.map)).toMatchObject({ seq: 1 })
    expect(machine.state).toEqual({ running: true, destroyed: 0 })
  })

  test("a call that comes while it saves keeps the machine awake", async () => {
    const machine = boxOf({ store: memory({ generation: 3, restored: 3, activeAt: 1 }) })
    // The call is admitted (and touches the machine) while the checkpoint is being written.
    const racing: Machine.Box<never> = {
      ...machine.box,
      storage: {
        ...machine.box.storage,
        put: (key, value) =>
          key === "checkpoint"
            ? Effect.andThen(machine.box.storage.put(key, value), Machine.touch(machine.box))
            : machine.box.storage.put(key, value),
      },
    }
    writeFileSync(join(machine.workdir, "typed.txt"), "typed\n")
    expect(await Effect.runPromise(Machine.sleepIfIdle(racing, 3, 1_000))).toBe("busy")
    expect(machine.state).toEqual({ running: true, destroyed: 0 })
    expect(saved(machine.map)).toMatchObject({ generation: 3 })
  })

  test("terminal input that comes while it saves keeps the machine awake: it probes again before it stops", async () => {
    let probes = 0
    // The first probe finds nothing; by the second, a person typed into their terminal.
    const typing = boxOf({
      store: memory({ generation: 3, restored: 3 }),
      root: (argv) => Effect.sync(() => (isProbe(argv) && ++probes === 2 ? 3 : 0)),
    })
    expect(await Effect.runPromise(Machine.sleepIfIdle(typing.box, 3, 1_000))).toBe("busy")
    expect(probes).toBe(2)
    expect(typing.state).toEqual({ running: true, destroyed: 0 })
  })
})
