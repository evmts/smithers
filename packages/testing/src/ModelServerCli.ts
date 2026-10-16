/**
 * The command line behind `smthrs-model-server`: a `ModelServer` over a
 * fixture file, for a test that drives an install out of process.
 *
 * ```sh
 * # Record: misses go to the upstream and are written to the fixture.
 * UPSTREAM_KEY=... smthrs-model-server --fixture test/fixtures/journey.json \
 *   --record --upstream https://ai-gateway.vercel.sh --key-env UPSTREAM_KEY
 * # Replay: no upstream, no key, no network; a miss is a 501.
 * smthrs-model-server --fixture test/fixtures/journey.json
 * ```
 *
 * It prints one JSON line, `{"url":"http://127.0.0.1:<port>"}`, once it
 * listens, and runs until SIGINT or SIGTERM. A recording run publishes the
 * fixture when it stops. The key is read from the environment variable
 * `--key-env` names, never from the command line, and never reaches the
 * fixture.
 *
 * | Flag                    | Meaning                                                                 |
 * | ----------------------- | ----------------------------------------------------------------------- |
 * | `--fixture <path>`      | The fixture file. Required. Replay refuses one that does not exist.     |
 * | `--record`              | Record misses. Needs `--upstream` and `--key-env`.                      |
 * | `--upstream <origin>`   | The OpenAI-compatible origin a miss is sent to, and its gateway judge.  |
 * | `--upstream-model <id>` | The model the upstream is asked for; the fixture keeps the request's.   |
 * | `--key-env <NAME>`      | The environment variable holding the upstream's bearer key.             |
 * | `--hold <regex>`        | Hold a turn whose text matches until its key (group 1) is released.     |
 * | `--normalize <regex>`   | Replace every match in a request with `<normalized>` before keying it.  |
 * | `--host`, `--port`      | Where to listen: `127.0.0.1` and any free port by default.              |
 *
 * @since 1.0.0
 */

import * as Evaluator from "@smthrs/model/Evaluator"
import * as Model from "@smthrs/model/Model"
import { ModelRequest } from "@smthrs/model/ModelRequest"
import * as RequestExecutor from "@smthrs/model/RequestExecutor"
import * as Route from "@smthrs/model/Route"
import { Effect, Exit, Layer, Redacted, Result, Scope } from "effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { existsSync, readFileSync } from "node:fs"
import * as CachedEvaluator from "./CachedEvaluator.ts"
import * as CachedModel from "./CachedModel.ts"
import { decode } from "./Fixture.ts"
import * as FixtureStore from "./FixtureStore.ts"
import type { RecordedRequestLike } from "./ModelLike.ts"
import * as ModelServer from "./ModelServer.ts"
import * as TurnGate from "./TurnGate.ts"

/**
 * A parsed command line.
 *
 * @category models
 * @since 1.0.0
 */
export interface Config {
  readonly fixture: string
  readonly record?: {
    readonly upstream: string
    readonly model?: string | undefined
    readonly apiKey: Redacted.Redacted<string>
  } | undefined
  readonly hold: ReadonlyArray<RegExp>
  /** Run-varying text to replace with `<normalized>` before a request is keyed and recorded. */
  readonly normalize: ReadonlyArray<RegExp>
  readonly hostname?: string | undefined
  readonly port?: number | undefined
}

const usage = "Usage: smthrs-model-server --fixture <path> [--record --upstream <origin> --key-env <NAME> " +
  "[--upstream-model <id>]] [--hold <regex>] [--normalize <regex>] [--host <host>] [--port <port>]"

const refuse = (message: string): never => {
  throw new Error(`${message}\n${usage}`)
}

const compile = (flag: string, source: string, flags?: string): RegExp => {
  try {
    return new RegExp(source, flags)
  } catch {
    return refuse(`${flag} is not a regular expression: ${source}`)
  }
}

const pattern = (source: string): RegExp => {
  const compiled = compile("--hold", source)
  return new RegExp(`${source}|`).exec("")!.length === 2 ? compiled : refuse("--hold needs one capture group")
}

/**
 * Reads the command line. Throws an `Error` naming the first problem.
 *
 * @category constructors
 * @since 1.0.0
 */
export const parse = (argv: ReadonlyArray<string>, env: Readonly<Record<string, string | undefined>>): Config => {
  const values = new Map<string, string>()
  const hold: Array<RegExp> = []
  const normalize: Array<RegExp> = []
  let record = false
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!
    if (flag === "--record") {
      record = true
      continue
    }
    const flags = [
      "--fixture",
      "--upstream",
      "--upstream-model",
      "--key-env",
      "--hold",
      "--normalize",
      "--host",
      "--port"
    ]
    if (!flags.includes(flag)) {
      refuse(`Unknown argument ${flag}`)
    }
    const value = argv[++index] ?? refuse(`${flag} needs a value`)
    if (flag === "--hold") hold.push(pattern(value))
    else if (flag === "--normalize") normalize.push(compile(flag, value, "g"))
    else values.set(flag, value)
  }
  const fixture = values.get("--fixture") ?? refuse("--fixture is required")
  const upstream = values.get("--upstream")
  if (!record && upstream !== undefined) refuse("--upstream needs --record")
  const port = values.get("--port")
  if (port !== undefined && !/^\d+$/.test(port)) refuse("--port must be an integer")
  const recording = () => {
    const origin = upstream ?? refuse("--record needs --upstream")
    const name = values.get("--key-env") ?? refuse("--record needs --key-env")
    const key = env[name] ?? ""
    return {
      upstream: origin,
      model: values.get("--upstream-model"),
      apiKey: Redacted.make(key === "" ? refuse(`${name} is empty`) : key)
    }
  }
  return {
    fixture,
    record: record ? recording() : undefined,
    hold,
    normalize,
    hostname: values.get("--host"),
    port: port === undefined ? undefined : Number(port)
  }
}

/** Every text a request carries, so a hold pattern can match any of it. */
const textOf = (request: ModelRequest): string =>
  [
    ...request.system.map((part) => part.text),
    ...request.messages.flatMap((message) =>
      message.content.map((part) =>
        part.type === "tool-call" ? part.arguments : part.type === "tool-result" ? part.content : part.text
      )
    )
  ].join("\n")

const live = (record: NonNullable<Config["record"]>) =>
  Effect.gen(function*() {
    const route = Route.openaiChatCompatible({
      id: "upstream",
      providerName: "upstream",
      baseUrl: record.upstream,
      apiKey: record.apiKey
    })
    const model = yield* Route.toModel(Result.getOrThrow(route))
    const evaluator = yield* Effect.provide(
      Effect.gen(function*() {
        return yield* Evaluator.Evaluator
      }),
      Evaluator.layerVercelGateway({
        apiKey: record.apiKey,
        baseUrl: `${record.upstream}${ModelServer.paths.evaluation}`,
        timeoutMs: 60_000
      })
    )
    const renamed = record.model === undefined ? model : Model.make({
      stream: (request) => model.stream(ModelRequest.make({ ...request, modelId: record.model! }))
    })
    return { model: renamed, evaluator }
  }).pipe(
    Effect.provide(Layer.provideMerge(RequestExecutor.layer, FetchHttpClient.layer))
  )

/** Replaces every match of `patterns` in every string a request carries, except its model id. */
const normalizer = (patterns: ReadonlyArray<RegExp>): CachedModel.Options["normalize"] =>
  patterns.length === 0 ? undefined : (request) =>
    JSON.parse(
      JSON.stringify(request),
      (key, value: unknown) =>
        typeof value === "string" && key !== "modelId"
          ? patterns.reduce((text, pattern) => text.replace(pattern, "<normalized>"), value)
          : value
    ) as RecordedRequestLike

/** A replay reads the file once and never writes it, so any number of runs can share it. */
const replayStore = (path: string) =>
  Effect.gen(function*() {
    if (!existsSync(path)) return yield* Effect.die(new Error(`${path} does not exist. Record it with --record.`))
    return yield* FixtureStore.makeMemory(yield* Effect.orDie(decode(JSON.parse(readFileSync(path, "utf8")))))
  })

/**
 * Serves `config` for the lifetime of the scope. A recording publishes the
 * fixture when the scope closes.
 *
 * @category constructors
 * @since 1.0.0
 */
export const serve = (config: Config): Effect.Effect<ModelServer.ModelServer, never, Scope.Scope> =>
  Effect.gen(function*() {
    const record = config.record
    const fixture = record === undefined
      ? yield* replayStore(config.fixture)
      : yield* Effect.acquireRelease(FixtureStore.makeFile(config.fixture), (store) => store.flush())
    const upstream = record === undefined ? undefined : yield* live(record)
    const gate = yield* TurnGate.make()
    const normalize = normalizer(config.normalize)
    const cached = CachedModel.make({ fixture, live: upstream?.model, normalize })
    const key = (request: ModelRequest) => {
      const text = textOf(request)
      return config.hold.map((hold) => hold.exec(text)?.[1]).find((match) => match !== undefined)
    }
    return yield* ModelServer.make({
      model: config.hold.length === 0 ? cached : TurnGate.model(cached, { gate, key }),
      evaluator: CachedEvaluator.make({ fixture, live: upstream?.evaluator, normalize }),
      gate,
      hostname: config.hostname,
      port: config.port
    })
  })

/**
 * Where {@link run} prints and when it stops.
 *
 * @category models
 * @since 1.0.0
 */
export interface Io {
  readonly print: (line: string) => void
  readonly stopped: Promise<void>
}

/**
 * Parses `argv`, serves it, prints the URL line, and stops when `io.stopped`
 * settles. Rejects with the parse or startup failure.
 *
 * @category constructors
 * @since 1.0.0
 */
export const run = async (
  argv: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>>,
  io: Io
): Promise<void> => {
  const config = parse(argv, env)
  const scope = Effect.runSync(Scope.make())
  try {
    const server = await Effect.runPromise(Scope.provide(serve(config), scope))
    io.print(JSON.stringify({ url: server.url }))
    await io.stopped
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
}
