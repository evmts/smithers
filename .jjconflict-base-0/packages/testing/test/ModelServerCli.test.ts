/**
 * The model server's command line, run in process: record against an upstream
 * (itself a model server over a scripted model, so nothing leaves loopback),
 * then replay the file with no upstream at all.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Model from "@smthrs/model/Model"
import type * as ModelEvent from "@smthrs/model/ModelEvent"
import type { ModelRequest } from "@smthrs/model/ModelRequest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import * as ModelServer from "../src/ModelServer.ts"
import * as ModelServerCli from "../src/ModelServerCli.ts"

const key = "test-upstream-credential-value"

const answer: ReadonlyArray<ModelEvent.ModelEvent> = [
  { type: "text-start", id: "text-0" },
  { type: "text-delta", id: "text-0", text: "recorded answer" },
  { type: "text-end", id: "text-0" },
  { type: "settle", stopReason: "stop" },
  { type: "usage", inputTokens: 5, outputTokens: 2 }
]

/** An upstream that answers `answer` and keeps every request it was sent. */
const upstream = (seen: Array<ModelRequest>) =>
  ModelServer.make({
    model: Model.make({ stream: (request) => Stream.suspend(() => (seen.push(request), Stream.fromIterable(answer))) }),
    evaluator: {
      evaluate: () => Effect.succeed({ answers: { done: { type: "boolean", probability: 0.75 } }, latencyMs: 1 })
    }
  })

const chatBody = (text: string) => ({
  model: "openai/requested",
  messages: [{ role: "system", content: "Teach." }, { role: "user", content: text }],
  stream: true,
  stream_options: { include_usage: true }
})

const post = (url: string, path: string, body: unknown) =>
  Effect.promise(async () => {
    const response = await fetch(new URL(path, url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
    return { status: response.status, body: await response.text() }
  })

const evaluationBody = { state: { todo: "x" }, questions: { done: { type: "boolean", instructions: "Done?" } } }

const withDirectory = <A, E, R>(use: (directory: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "model-server-cli-"))),
    use,
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
  )

/** Runs the command until `stop`, returning the line it printed and the run's fiber. */
const start = (argv: ReadonlyArray<string>, env: Record<string, string | undefined> = {}) =>
  Effect.gen(function*() {
    const printed = yield* Deferred.make<string>()
    const stop = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(Effect.promise(() =>
      ModelServerCli.run(argv, env, {
        print: (line) => Effect.runSync(Deferred.succeed(printed, line)),
        stopped: Effect.runPromise(Deferred.await(stop))
      })
    ))
    const line = yield* Deferred.await(printed)
    return {
      url: (JSON.parse(line) as { readonly url: string }).url,
      stop: Deferred.succeed(stop, undefined).pipe(Effect.andThen(Fiber.join(fiber)))
    }
  })

describe("ModelServerCli.parse", () => {
  it("reads every flag", () => {
    expect(ModelServerCli.parse([
      "--fixture",
      "f.json",
      "--record",
      "--upstream",
      "https://gateway.example",
      "--upstream-model",
      "openai/gpt-5-mini",
      "--key-env",
      "KEY",
      "--hold",
      "\\[HOLD (\\w+)\\]",
      "--host",
      "localhost",
      "--port",
      "4123"
    ], { KEY: key })).toMatchObject({
      fixture: "f.json",
      record: { upstream: "https://gateway.example", model: "openai/gpt-5-mini" },
      hold: [/\[HOLD (\w+)\]/],
      hostname: "localhost",
      port: 4123
    })
  })

  it.each([
    [[], "--fixture is required"],
    [["--fixture"], "--fixture needs a value"],
    [["--fixture", "f", "--wat"], "Unknown argument --wat"],
    [["--fixture", "f", "--record"], "--record needs --upstream"],
    [["--fixture", "f", "--record", "--upstream", "https://x"], "--record needs --key-env"],
    [["--fixture", "f", "--record", "--upstream", "https://x", "--key-env", "KEY"], "KEY is empty"],
    [["--fixture", "f", "--upstream", "https://x"], "--upstream needs --record"],
    [["--fixture", "f", "--hold", "("], "--hold is not a regular expression"],
    [["--fixture", "f", "--hold", "HOLD"], "--hold needs one capture group"],
    [["--fixture", "f", "--port", "x"], "--port must be an integer"]
  ])("refuses %j", (argv, message) => {
    expect(() => ModelServerCli.parse(argv, {})).toThrow(message)
  })
})

describe("ModelServerCli.run", () => {
  it.live("records chat turns and judgments to the fixture, then replays them with no upstream", () =>
    withDirectory((directory) =>
      Effect.gen(function*() {
        const fixture = join(directory, "model.json")
        const seen: Array<ModelRequest> = []
        const origin = yield* upstream(seen)
        const recording = yield* start([
          "--fixture",
          fixture,
          "--record",
          "--upstream",
          origin.url,
          "--upstream-model",
          "openai/upstream",
          "--key-env",
          "UPSTREAM_KEY"
        ], { UPSTREAM_KEY: key })
        const chat = yield* post(recording.url, ModelServer.paths.chat, chatBody("Hello"))
        expect(chat.body).toContain("recorded answer")
        expect(seen.map((request) => request.modelId)).toEqual(["openai/upstream"])
        const judged = yield* post(recording.url, ModelServer.paths.evaluation, evaluationBody)
        expect(JSON.parse(judged.body)).toEqual({ answers: { done: { type: "boolean", probability: 0.75 } } })
        yield* recording.stop
        const written = readFileSync(fixture, "utf8")
        expect(written).not.toContain(key)
        // The fixture keys the request as the install sent it.
        expect(written).toContain("openai/requested")
        expect(written).not.toContain("openai/upstream")

        const replay = yield* start(["--fixture", fixture])
        expect((yield* post(replay.url, ModelServer.paths.chat, chatBody("Hello"))).body).toContain("recorded answer")
        expect(JSON.parse((yield* post(replay.url, ModelServer.paths.evaluation, evaluationBody)).body))
          .toEqual({ answers: { done: { type: "boolean", probability: 0.75 } } })
        expect((yield* post(replay.url, ModelServer.paths.chat, chatBody("Unrecorded"))).status).toBe(501)
        yield* replay.stop
        expect(seen).toHaveLength(1)
        // Replay never writes: no journal, lock or rewrite is left behind.
        expect(readFileSync(fixture, "utf8")).toBe(written)
        expect(existsSync(`${fixture}.lock`)).toBe(false)
      })
    ))

  it.live("holds a matching turn until it is released over HTTP", () =>
    withDirectory((directory) =>
      Effect.gen(function*() {
        const fixture = join(directory, "model.json")
        const origin = yield* upstream([])
        const server = yield* start([
          "--fixture",
          fixture,
          "--record",
          "--upstream",
          origin.url,
          "--key-env",
          "UPSTREAM_KEY",
          "--hold",
          "\\[HOLD ([a-z0-9]+)\\]"
        ], { UPSTREAM_KEY: key })
        const held = yield* Effect.forkChild(post(server.url, ModelServer.paths.chat, chatBody("edit [HOLD t2]")))
        yield* Effect.promise(() => fetch(`${server.url}${ModelServer.paths.held}`).then((r) => r.text())).pipe(
          Effect.repeat({ until: (body) => body === "[\"t2\"]" })
        )
        yield* post(server.url, `${ModelServer.paths.release}t2`, {})
        expect((yield* Fiber.join(held)).body).toContain("recorded answer")
        expect((yield* post(server.url, ModelServer.paths.chat, chatBody("plain"))).body).toContain("recorded answer")
        // A key in a tool's arguments or result holds the turn too.
        yield* post(server.url, `${ModelServer.paths.release}t3`, {})
        const tooled = yield* post(server.url, ModelServer.paths.chat, {
          ...chatBody("go"),
          messages: [
            { role: "user", content: "go" },
            {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }]
            },
            { role: "tool", tool_call_id: "c1", content: "[HOLD t3]" }
          ]
        })
        expect(tooled.body).toContain("recorded answer")
        yield* server.stop
      })
    ))

  it.live("refuses to replay a fixture that does not exist", () =>
    withDirectory((directory) =>
      Effect.gen(function*() {
        const fixture = join(directory, "absent.json")
        const exit = yield* Effect.tryPromise(() =>
          ModelServerCli.run(["--fixture", fixture], {}, { print: () => undefined, stopped: new Promise(() => {}) })
        ).pipe(Effect.exit)
        expect(String(exit)).toContain("absent.json does not exist")
        writeFileSync(fixture, "{\"calls\":7}")
        const broken = yield* Effect.tryPromise(() =>
          ModelServerCli.run(["--fixture", fixture], {}, { print: () => undefined, stopped: new Promise(() => {}) })
        ).pipe(Effect.exit)
        expect(broken._tag).toBe("Failure")
      })
    ))
})

describe("smthrs-model-server", () => {
  const bin = fileURLToPath(new URL("../bin/smthrs-model-server.mjs", import.meta.url))

  it.live("serves a fixture as a process, prints its URL, and exits cleanly on SIGTERM", () =>
    withDirectory((directory) =>
      Effect.gen(function*() {
        const fixture = join(directory, "model.json")
        writeFileSync(fixture, JSON.stringify({ calls: [] }))
        const child = spawn(process.execPath, [bin, "--fixture", fixture], { stdio: ["ignore", "pipe", "pipe"] })
        const line = yield* Effect.promise(() =>
          new Promise<string>((resolve) => child.stdout.once("data", (data: Buffer) => resolve(data.toString())))
        )
        const { url } = JSON.parse(line) as { readonly url: string }
        expect(yield* Effect.promise(() => fetch(`${url}/health`).then((response) => response.text()))).toBe("ok")
        const exited = new Promise<number | null>((resolve) => child.once("exit", resolve))
        child.kill("SIGTERM")
        expect(yield* Effect.promise(() => exited)).toBe(0)
      })
    ))

  it.live("exits 1 and names the problem when the command line is wrong", () =>
    Effect.gen(function*() {
      const child = spawn(process.execPath, [bin, "--wat"], { stdio: ["ignore", "pipe", "pipe"] })
      let stderr = ""
      child.stderr.on("data", (data: Buffer) => (stderr += data.toString()))
      const code = yield* Effect.promise(() => new Promise<number | null>((resolve) => child.once("exit", resolve)))
      expect(code).toBe(1)
      expect(stderr).toContain("Unknown argument --wat")
    }))
})
