// A-2/E-4/E-7 (EK1003, EK4402): the seat scan's credential rules are async
// (Providers.claudeCode and Claude Code's login probe return Promises), and
// hostOf reads the home directory, so they stay TypeScript. NativeEquipment.vibe
// awaits them through `sync(async ...)` boundaries, as NativeEquipment.ts's
// Effect.promise did, and rebinds `seatCandidates` with its JSDoc. Every line
// below is NativeEquipment.ts's own; the closure `subscriptionSeat` of
// `layerSeatEvaluator` takes its `environment` as a parameter.
import * as SeatRouter from "@smthrs/agent/SeatRouter"
import * as Endpoint from "@smthrs/model/Endpoint"
import { homedir } from "node:os"
import { isAbsolute, relative } from "node:path"
import * as Environment_ from "../Environment.ts"
import * as Providers from "../Providers.vibe"
import * as CodexLogin from "./CodexLogin.vibe"
import { readText } from "./HostFiles.ts"
import { routedReviewModels, routers } from "./NativeEquipment.vibe"

export const apiKeyVariable: Readonly<Record<string, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
}

/**
 * How the `openai` provider authenticates. `api-key` is the default and the
 * only mode the other providers have. `chatgpt` routes the same seat strings
 * to the ChatGPT-subscription backend on the local Codex login, so a lane
 * opts in through the environment without respelling any seat: the journaled
 * seat, its context window, and its committed price stay identical.
 */
export const openaiAuthVariable = "SMITHERS_OPENAI_AUTH"

/**
 * A Smithers account pool (`SMITHERS_ACCOUNT_POOL_URL`, `{base}/provider-pool`)
 * holding connected Codex accounts and Anthropic API keys.
 * `SMITHERS_ACCOUNT_POOL_PROVIDERS` lists the routes (`chatgpt`, `anthropic`)
 * the host may take to it and `SMITHERS_ACCOUNT_POOL_KEY` holds the pool
 * credential. Which routes have accounts the pool answers at
 * `GET {pool}/routes`, asked when a seat resolves and remembered briefly, so an
 * account connected after boot serves the next seat: the openai seat then runs
 * in ChatGPT mode against `${pool}/chatgpt`, and the anthropic seat against
 * `${pool}/anthropic`. The pool picks the account per request. A Claude
 * subscription is never pooled: Anthropic lets only Claude Code sign with it, so
 * it is the `claude-code` provider's alone.
 */
export const accountPoolVariable = "SMITHERS_ACCOUNT_POOL_URL"
export const accountPoolKeyVariable = "SMITHERS_ACCOUNT_POOL_KEY"

export type AccountPoolRoute = "chatgpt" | "anthropic"

export interface AccountPool {
  readonly origin: string
  readonly key: string
  readonly routes: ReadonlyArray<string>
}

export const origin = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value.replace(/\/+$/, "")

/** The configured account pool, when the host may take any route to it. */
export const accountPoolOf = (environment: Readonly<Record<string, string | undefined>>): AccountPool | undefined => {
  const poolOrigin = origin(Environment_.read(environment, accountPoolVariable))
  const key = environment[accountPoolKeyVariable]
  const routes = (Environment_.read(environment, "SMITHERS_ACCOUNT_POOL_PROVIDERS") ?? "").split(",")
    .map((item) => item.trim()).filter((item) => item !== "")
  return poolOrigin === undefined || key === undefined || key === "" || routes.length === 0
    ? undefined
    : { origin: poolOrigin, key, routes }
}

/**
 * The seat an alias runs as on `host`: the `provider:modelId` it names, except
 * that a Claude alias runs on Claude Code (`claude-code:<alias>`) when no
 * Anthropic key is set. Anything else is returned unchanged.
 */
export const aliasSeat = async (declared: string, host: Providers.Host): Promise<string> => {
  const seat = Providers.expandSeat(declared)
  return seat !== declared && seat.startsWith("anthropic:") && (await credential("anthropic", host))._tag === "Refused"
    ? `claude-code:${declared}`
    : seat
}

/**
 * Whether a Claude alias that {@link aliasSeat} sends to Claude Code first
 * tries the account pool's anthropic route: the pool knows only when the seat
 * resolves whether it holds a connected Anthropic API key.
 */
export const poolFirst = (declared: string, seat: string, host: Providers.Host): boolean =>
  seat === `claude-code:${declared}` && accountPoolOf(host.environment)?.routes.includes("anthropic") === true

/**
 * How {@link seatResolver} signs one provider's seats on `host`, or why it
 * cannot: the one statement of its credential rules, which the resolver
 * routes by and {@link seatCandidates} offers by.
 *
 * `openai` runs in the mode `SMITHERS_OPENAI_AUTH` selects: a key, or the
 * ChatGPT session behind the model proxy or in this machine's Codex login,
 * which `codex` seats always use. `anthropic`
 * takes only a key; a Claude subscription runs as `claude-code`, on Claude
 * Code, which signs its own requests. An empty variable is an unset one. An
 * account pool with accounts for the provider's route signs ahead of all of
 * these; see {@link poolRouteOf}.
 */
export type Credential =
  | { readonly _tag: "Compatible"; readonly key: string }
  | { readonly _tag: "Pooled"; readonly key: string; readonly origin: string }
  | { readonly _tag: "Codex"; readonly file: string }
  | { readonly _tag: "ClaudeCode"; readonly executable: string }
  | { readonly _tag: "Key"; readonly key: string }
  | { readonly _tag: "Refused"; readonly refusal: (seat: string) => string }

const refused = (refusal: (seat: string) => string): Credential => ({ _tag: "Refused", refusal })

/** This machine, as the seat scan reads it. */
export const hostOf = (environment: Readonly<Record<string, string | undefined>>): Providers.Host => ({
  environment,
  homeDirectory: homedir(),
  readFile: readText,
  claudeCode: () => Providers.claudeCodeLogin(environment)
})

export const credential = async (provider: string, host: Providers.Host): Promise<Credential> => {
  const environment = host.environment
  // The OpenAI-compatible Chat Completions providers are routed by table
  // (`Providers.compatible`). `Object.hasOwn`, so `constructor:x` finds no
  // inherited function.
  if (Object.hasOwn(Providers.compatible, provider)) {
    const found = Providers.compatibleKey(provider, environment)
    return found === undefined
      ? refused((seat) => `Set ${Providers.compatible[provider]!.variables.join(" or ")} to run the ${seat} seat`)
      : { _tag: "Compatible", key: found.key }
  }
  if (provider === "claude-code") {
    const found = await Providers.claudeCode(host)
    return found.executable === undefined
      ? refused((seat) => `${found.reason}, so the ${seat} seat cannot run: ${found.setupHint}`)
      : { _tag: "ClaudeCode", executable: found.executable }
  }
  if (provider === "codex") {
    // The login file says whether a subscription is signed in; no vendor
    // process runs to resolve a seat. The refusal names the file, never its text.
    const file = CodexLogin.locate(environment, host.homeDirectory)
    const reason = CodexLogin.unusable(file, host.readFile(file))
    return reason === undefined
      ? { _tag: "Codex", file }
      : refused((seat) =>
        `${
          CodexLogin.executable(environment) === undefined ? "install Codex, then " : ""
        }run \`codex login --device-auth\` to run the ${seat} seat: ${reason}`
      )
  }
  // Own properties only: `constructor:foo` must not read Object.prototype.
  const variable = Object.hasOwn(apiKeyVariable, provider) ? apiKeyVariable[provider] : undefined
  if (variable === undefined) return refused(() => `No route is configured for the ${provider} provider`)
  const configured = Environment_.read(environment, openaiAuthVariable)
  const authMode = provider === "openai" && configured !== undefined && configured !== "" ? configured : "api-key"
  if (authMode !== "api-key" && authMode !== "chatgpt") {
    return refused((seat) => `${openaiAuthVariable} must be "api-key" or "chatgpt" to run the ${seat} seat`)
  }
  const value = environment[variable]
  const key = value === undefined || value.length === 0 ? undefined : value
  if (authMode === "chatgpt") {
    // Behind the Smithers model proxy the ChatGPT seat carries the proxy
    // credential as the `openai` seat's key.
    const origin = Endpoint.proxyOrigin("chatgpt", environment)
    if (origin !== undefined) {
      return key === undefined
        ? refused((seat) => `Set ${variable} to run the ${seat} seat through the model proxy`)
        : { _tag: "Pooled", key, origin }
    }
    return credential("codex", host)
  }
  return key === undefined ? refused((seat) => `Set ${variable} to run the ${seat} seat`) : { _tag: "Key", key }
}

/**
 * The account pool route a provider's seats may take: `chatgpt` for the openai
 * seat unless `SMITHERS_OPENAI_AUTH` pins it to its key or names no valid mode,
 * and `anthropic` for the anthropic seat behind a configured pool.
 */
export const poolRouteOf = (
  provider: string,
  environment: Readonly<Record<string, string | undefined>>
): AccountPoolRoute | undefined => {
  if (provider === "anthropic") {
    return origin(Environment_.read(environment, accountPoolVariable)) === undefined ? undefined : "anthropic"
  }
  if (provider !== "openai") return undefined
  if (origin(Environment_.read(environment, accountPoolVariable)) !== undefined) return "chatgpt"
  const configured = Environment_.read(environment, openaiAuthVariable)
  return configured === undefined || configured === "" || configured === "chatgpt" ? "chatgpt" : undefined
}

/** The seats an `auto` run may be routed to on this host; see NativeEquipment's `seatCandidates`. */
export const seatCandidates = async (host: Providers.Host): Promise<ReadonlyArray<string>> => {
  const pool = accountPoolOf(host.environment)
  const available = await Promise.all(SeatRouter.seats.map(async (alias) => {
    const seat = await aliasSeat(alias, host)
    // A route the pool is configured for is offered: the pool is asked which
    // routes have accounts when the seat resolves.
    const expanded = poolFirst(alias, seat, host) ? Providers.expandSeat(alias) : seat
    const route = poolRouteOf(expanded.slice(0, expanded.indexOf(":")), host.environment)
    if (pool !== undefined && route !== undefined && pool.routes.includes(route)) return true
    const provider = seat.slice(0, seat.indexOf(":"))
    return (await credential(provider, host))._tag !== "Refused"
  }))
  return SeatRouter.seats.filter((_, index) => available[index])
}

/** The subscription that judges in Jev's place; see NativeEquipment's `layerSeatEvaluator`. */
export const subscriptionSeat = async (
  environment: Readonly<Record<string, string | undefined>>
): Promise<string | undefined> => {
  const host = hostOf(environment)
  if ((await credential("claude-code", host))._tag === "ClaudeCode") return "claude-code:haiku"
  const pool = accountPoolOf(environment)
  const route = poolRouteOf("openai", environment)
  const signed = await credential("openai", host)
  if (
    (pool !== undefined && route !== undefined && pool.routes.includes(route)) ||
    signed._tag === "Codex" || signed._tag === "Pooled"
  ) return "luna"
  for (const router of routers) {
    if ((await credential(router, host))._tag !== "Refused") {
      return `${router}:${routedReviewModels[0]}`
    }
  }
  return undefined
}

/** Whether this process runs on Bun. */
export const bunVersion = (): string | undefined => process.versions.bun

/** `node:path` relative. */
export const relativePath = (from: string, to: string): string => relative(from, to)

/** `node:path` isAbsolute. */
export const isAbsolutePath = (path: string): boolean => isAbsolute(path)
