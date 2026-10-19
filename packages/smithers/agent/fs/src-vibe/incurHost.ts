// A-2, E-4, D38: the runner boundary of `Incur.createCli`. Incur's `serve`, `fetch` and
// `close` are async functions that return Promises to TypeScript callers, and VibeLang has
// no async function outside a hatch (EK1003); `isDiscovery` and `reportServe` read
// `process` (EK4402). The Effect logic (projection, hydration, invocation) is `Incur.vibe`.
import * as Positionals from "@smthrs/build-cli/Positionals"
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { Cli as IncurCli, type MiddlewareHandler } from "incur"
import type * as FlowInvoker from "./FlowInvoker.vibe"
import { FsError } from "./FsError.vibe"

/** Runs an Effect against the services `createCli` captured. */
export type RunEffect = <A, E>(
  effect: Effect.Effect<A, E, FlowInvoker.FlowInvoker>,
  options?: { readonly signal: AbortSignal } | undefined
) => Promise<A>

/**
 * Runs one selected route's invocation for Incur. D-10, S4-1: handing `execute(selected,
 * context)` to `runEffect` by name inside the plain `run` method lifts the method into an
 * Effect, and with a `Promise` annotation the method still returns an Effect at run time.
 */
export const runSelected = <S, C>(
  runEffect: RunEffect,
  execute: (selected: S, context: C) => Effect.Effect<unknown, never, FlowInvoker.FlowInvoker>,
  selected: S,
  context: C,
  options: { readonly signal: AbortSignal } | undefined
): Promise<unknown> => runEffect(execute(selected, context), options)

/** What `Incur.vibe` hands the boundary: its projections, hydration and CLI builders. */
export interface Ports<Projections, Selection> {
  readonly name: string
  readonly services: Context.Context<FlowInvoker.FlowInvoker>
  readonly project: () => Effect.Effect<Projections, never, FlowInvoker.FlowInvoker>
  readonly metadataCli: (projections: Projections, runEffect: RunEffect) => IncurCli.Cli
  readonly hydrate: (
    tokens: ReadonlyArray<string>,
    dispatchTokens: ReadonlyArray<string>
  ) => Effect.Effect<Option.Option<Selection>, FsError, FlowInvoker.FlowInvoker>
  readonly dispatchCli: (selection: Selection, runEffect: RunEffect) => IncurCli.Cli
}

const discoveryFlags = new Set(["--help", "-h", "--llms", ["--llms", "full"].join("-"), "--schema", "--version"])

const isDiscovery = (argv: ReadonlyArray<string>): boolean =>
  // Incur itself tests truthiness, so `COMPLETE=""` must not divert a run.
  Boolean(process.env.COMPLETE) || argv.includes("--mcp") || argv.some((token) => discoveryFlags.has(token))

const isFetchDiscovery = (pathname: string): boolean =>
  pathname === "/mcp" || pathname === "/openapi.json" || pathname === "/openapi.yml" ||
  pathname === "/openapi.yaml" || pathname.startsWith("/.well-known/")

const normalizeArgv = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const first = argv[0]
  return first === undefined || !first.includes("/")
    ? argv
    : Object.freeze([...first.split("/"), ...argv.slice(1)])
}

const commandTokens = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const tokens: Array<string> = []
  for (const token of normalizeArgv(argv)) {
    if (token.startsWith("-")) break
    tokens.push(token)
  }
  return Object.freeze(tokens)
}

type RequestPath = {
  /** Segments exactly as Incur's own matcher will see them. */
  readonly raw: ReadonlyArray<string>
  /** The same segments decoded, which is what route resolution compares. */
  readonly decoded: ReadonlyArray<string>
}

const requestPath = (pathname: string): RequestPath | undefined => {
  const raw: Array<string> = []
  const decoded: Array<string> = []
  for (const segment of pathname.split("/")) {
    if (segment.length === 0) continue
    try {
      // Splitting before decoding keeps `%2F` inside one segment, so an encoded
      // slash can never invent a path boundary.
      decoded.push(decodeURIComponent(segment))
    } catch {
      return undefined
    }
    raw.push(segment)
  }
  return { raw: Object.freeze(raw), decoded: Object.freeze(decoded) }
}

const malformedPath = (): FsError =>
  new FsError({
    code: "parse_failed",
    method: "Incur.fetch",
    description: "The request path contains a malformed percent escape"
  })

const errorEnvelope = (error: FsError): string =>
  JSON.stringify({ ok: false, error: { code: error.code, message: error.description } }, null, 2)

const reportServe = (error: FsError, options: IncurCli.serve.Options): void => {
  const write = options.stdout ?? ((value: string) => {
    process.stdout.write(value)
  })
  write(`${errorEnvelope(error)}\n`)
  const exit = options.exit ?? ((code: number) => {
    process.exit(code)
  })
  exit(1)
}

const reportFetch = (error: FsError): Response =>
  new Response(errorEnvelope(error), {
    status: 400,
    headers: { "content-type": "application/json" }
  })

/** Builds the CLI whose `serve`, `fetch` and `close` cross into Promises. */
export const serveRoutes = <Projections, Selection>(
  ports: Ports<Projections, Selection>
): IncurCli.Cli & { readonly close: () => Promise<void> } => {
  const { name } = ports
  const runEffect: RunEffect = Effect.runPromiseWith(ports.services)
  const cli = IncurCli.create(name)

  // Dispatch CLIs are short-lived; the metadata CLI also receives guards
  // registered after discovery, including an already running MCP server.
  const middlewares: Array<MiddlewareHandler> = []
  let metadataInstance: IncurCli.Cli | undefined
  const register = cli.use.bind(cli)
  cli.use = (handler) => {
    middlewares.push(handler)
    metadataInstance?.use(handler)
    return register(handler)
  }
  const guarded = (surface: IncurCli.Cli): IncurCli.Cli => {
    Positionals.guard(surface)
    for (const handler of middlewares) surface.use(handler)
    return surface
  }

  // The host owns the shared build. Request cancellation only releases that
  // request's waiter; closing the host interrupts projection itself.
  const lifetime = new AbortController()
  let metadata: Promise<IncurCli.Cli> | undefined
  const metadataSurface = (signal?: AbortSignal): Promise<IncurCli.Cli> => {
    lifetime.signal.throwIfAborted()
    signal?.throwIfAborted()
    // Only successful builds are cached. A rejected build must not poison
    // later discovery requests, including failures while mounting Incur.
    const build = metadata ??= runEffect(ports.project(), { signal: lifetime.signal }).then((projections) => {
      lifetime.signal.throwIfAborted()
      return metadataInstance = guarded(ports.metadataCli(projections, runEffect))
    }).catch((error: unknown) => {
      metadata = undefined
      throw error
    })
    if (signal === undefined) return build
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort)
        reject(signal.reason)
      }
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
      build.then((surface) => {
        signal.removeEventListener("abort", abort)
        resolve(surface)
      }, (error: unknown) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      })
    })
  }

  const select = (
    tokens: ReadonlyArray<string>,
    dispatchTokens: ReadonlyArray<string>,
    options?: { readonly signal: AbortSignal } | undefined
  ): Promise<
    { readonly _tag: "Selection"; readonly selection: Option.Option<Selection> } | {
      readonly _tag: "Error"
      readonly error: FsError
    }
  > =>
    runEffect(
      ports.hydrate(tokens, dispatchTokens).pipe(
        Effect.match({
          onFailure: (error: FsError) => ({ _tag: "Error" as const, error }),
          onSuccess: (selection) => ({ _tag: "Selection" as const, selection })
        })
      ),
      options
    )

  cli.serve = async (argv = process.argv.slice(2), options = {}) => {
    lifetime.signal.throwIfAborted()
    if (isDiscovery(argv)) return (await metadataSurface()).serve(argv, options)
    const normalized = normalizeArgv(argv)
    const tokens = commandTokens(normalized)
    const outcome = await select(tokens, tokens)
    if (outcome._tag === "Error") return reportServe(outcome.error, options)
    return Option.isNone(outcome.selection)
      ? (await metadataSurface()).serve([...normalized], options)
      : guarded(ports.dispatchCli(outcome.selection.value, runEffect)).serve([...normalized], options)
  }

  cli.fetch = async (request) => {
    lifetime.signal.throwIfAborted()
    request.signal.throwIfAborted()
    const url = new URL(request.url)
    if (isFetchDiscovery(url.pathname)) return (await metadataSurface(request.signal)).fetch(request)
    const path = requestPath(url.pathname)
    if (path === undefined) return reportFetch(malformedPath())
    const outcome = await select(path.decoded, path.raw, { signal: request.signal })
    if (outcome._tag === "Error") return reportFetch(outcome.error)
    return Option.isNone(outcome.selection)
      ? (await metadataSurface(request.signal)).fetch(request)
      : guarded(ports.dispatchCli(outcome.selection.value, runEffect)).fetch(request)
  }

  return Object.assign(cli, {
    async close(): Promise<void> {
      lifetime.abort(new DOMException("The CLI is closed", "AbortError"))
      // Interruption settles the Effect fiber even when a native import is
      // still evaluating. Never await the native import itself at shutdown.
      await metadata?.catch(() => undefined)
      metadata = undefined
      metadataInstance = undefined
    }
  })
}
