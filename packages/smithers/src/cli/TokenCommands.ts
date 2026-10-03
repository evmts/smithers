/**
 * `smthrs token mint`: a scoped, expiring gateway token signed under
 * `SMITHERS_TOKEN`, or a backend access token with `--cloud`.
 *
 * The gateway verifies the token with the same credential it serves under
 * (`@smthrs/control` `ScopedToken`), so minting needs no running gateway and
 * stores nothing. The verb runs on the host that holds the credential; it is
 * never offered over MCP, where a connected client could otherwise turn the
 * host's credential into tokens of its own.
 *
 * @since 1.0.0
 */

import * as ScopedToken from "@smthrs/control/ScopedToken"
import { Effect } from "effect"
import { Cli, z } from "incur"
import type * as Bridge from "../cli/ControlBridge.ts"
import * as CliError from "../CliError.ts"
import { duration } from "../Gc.ts"
import { Client, object, str } from "../internal/backend/Client.ts"
import * as Presentation from "./Presentation.ts"

/**
 * What `token mint` reports: the token, when it stops working, and the exact
 * grant it carries.
 *
 * @category models
 * @since 1.0.0
 */
export interface MintedToken {
  readonly token: string
  readonly expiresAt: string
  readonly scopes: ReadonlyArray<string>
  readonly procedures: ReadonlyArray<string>
  readonly runId?: string | undefined
  readonly flowId?: string | undefined
  readonly id?: number | undefined
  readonly name?: string | undefined
}

/**
 * Mints one token from the environment's `SMITHERS_TOKEN`.
 *
 * @category constructors
 * @since 1.0.0
 */
export const mint = (
  options: {
    readonly scope: ReadonlyArray<ScopedToken.Scope>
    readonly ttl: string
    readonly run?: string | undefined
    readonly flow?: string | undefined
  },
  environment: Record<string, string | undefined>
): Effect.Effect<MintedToken, CliError.UsageError> =>
  Effect.gen(function*() {
    const key = environment["SMITHERS_TOKEN"]?.trim()
    if (key === undefined || key.length === 0) {
      return yield* new CliError.UsageError({ message: "Set SMITHERS_TOKEN to the gateway credential to mint from" })
    }
    const ttlMillis = duration(options.ttl)
    if (ttlMillis === undefined) {
      return yield* new CliError.UsageError({
        message: `--ttl must be a positive duration such as 30s, 15m, 1h, or 2d, not ${options.ttl}`
      })
    }
    const minted = yield* ScopedToken.mint({
      key,
      scopes: options.scope,
      ttlMillis,
      runId: options.run,
      flowId: options.flow
    })
    return {
      token: minted.token,
      expiresAt: new Date(minted.claims.exp).toISOString(),
      scopes: [...new Set(options.scope)],
      procedures: minted.claims.procedures,
      ...(minted.claims.runId === undefined ? {} : { runId: minted.claims.runId }),
      ...(minted.claims.flowId === undefined ? {} : { flowId: minted.claims.flowId })
    }
  })

// Permission scopes from backend middleware.TokenScope. Repository, workspace,
// and run bindings are server-owned constraints, never permission scope names.
const cloudScopeNames = [
  "all",
  "admin",
  "read:admin",
  "write:admin",
  "read:repository",
  "write:repository",
  "read:organization",
  "write:organization",
  "read:user",
  "write:user",
  "read:workspace",
  "write:workspace",
  "read:approval",
  "write:approval",
  "read:agent",
  "write:agent"
] as const

const mintCloud = async (
  options: {
    scope: ReadonlyArray<string>
    ttl: string
    name?: string | undefined
    run?: string | undefined
    flow?: string | undefined
  },
  runtime: Bridge.Runtime
): Promise<MintedToken> => {
  if (options.run !== undefined || options.flow !== undefined) {
    throw new CliError.UsageError({ message: "--run and --flow are unavailable for Cloud access tokens" })
  }
  if (options.scope.some((scope) => !cloudScopeNames.includes(scope as typeof cloudScopeNames[number]))) {
    throw new CliError.UsageError({ message: "--cloud requires backend access-token scopes" })
  }
  const ttlMillis = duration(options.ttl), expires = Date.now() + (ttlMillis ?? 0)
  if (ttlMillis === undefined || !Number.isSafeInteger(ttlMillis) || expires > 8.64e15) {
    throw new CliError.UsageError({ message: "--ttl must be a positive duration such as 30s, 15m, 1h, or 2d" })
  }
  const name = options.name?.trim() ?? "smthrs"
  if (!name) throw new CliError.UsageError({ message: "--name must not be empty" })
  const client = new Client(runtime)
  try {
    const result = object(
      await client.request("POST", "/api/user/tokens", {
        name,
        scopes: [...new Set(options.scope)],
        expires_at: new Date(expires).toISOString()
      })
    )
    const grantedExpiry = Date.parse(str(result.expires_at))
    if (
      !str(result.token) || !Number.isSafeInteger(result.id) || Number(result.id) <= 0 ||
      !Array.isArray(result.scopes) || result.scopes.some((scope) => !options.scope.includes(scope)) ||
      new Set(result.scopes).size !== new Set(options.scope).size ||
      !Number.isFinite(grantedExpiry) || grantedExpiry <= Date.now() || grantedExpiry > expires
    ) {
      throw new CliError.Refused({ fault: "infra", code: "backend_protocol", message: "Token response was incomplete" })
    }
    // Mint is the one intentional token-output boundary. Never redact its new
    // token; only failures pass through the credential-aware backend redactor.
    return {
      token: str(result.token),
      expiresAt: str(result.expires_at),
      scopes: result.scopes,
      procedures: [],
      id: Number(result.id),
      name: str(result.name)
    }
  } catch (error) {
    throw client.failure(error)
  } finally {
    client.flushOutput()
  }
}

/**
 * Builds the `token` command group.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createTokenCli = (config: Bridge.Runtime = {}) =>
  Cli.create("token", { description: "Mint scoped, expiring gateway or Cloud access tokens" })
    .command("mint", {
      description: "Mint a token limited to the named scopes, an optional run or flow, and a lifetime",
      mcp: false,
      options: z.object({
        scope: z.array(z.enum([...cloudScopeNames, ...ScopedToken.scopeNames] as const)).min(1)
          .describe("Repeatable: gateway scopes, or backend scopes with --cloud"),
        cloud: z.boolean().default(false).describe("Mint a backend access token using the Cloud login"),
        name: z.string().optional().describe("Cloud access-token name (default smthrs)"),
        ttl: z.string().default("1h").describe("Lifetime such as 30s, 15m, 1h, or 2d"),
        run: z.string().optional().describe("Confine every call to this run id"),
        flow: z.string().optional().describe("Confine every call to this flow id")
      }),
      run: (context) =>
        Presentation.guard(
          context,
          () => {
            if (context.options.cloud) return mintCloud(context.options, config)
            if (context.options.name !== undefined) {
              throw new CliError.UsageError({ message: "--name requires --cloud" })
            }
            if (context.options.scope.some((scope) => !ScopedToken.scopeNames.includes(scope as ScopedToken.Scope))) {
              throw new CliError.UsageError({ message: "Gateway scopes are read:runs, write:runs, and approve:runs" })
            }
            return Effect.runPromise(
              mint(
                { ...context.options, scope: context.options.scope as Array<ScopedToken.Scope> },
                config.environment ?? process.env
              )
            )
          },
          { render: (minted) => ({ human: minted.token }) }
        )
    })
