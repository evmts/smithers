// E-7 (EK4402): node:fs, node:path and process.env are platform APIs that
// VibeLang code does not call directly; Integrations.vibe reads its
// configuration file through these.
// A-2/E-4 (D38): async bodies (EK1003) and the runner boundary that hands a
// Promise to TypeScript callers stay TypeScript. `probe`, the credential lookup
// and the `doctor` command body are Integrations.ts's own, verbatim; the
// module's helpers are passed in, because a hatch cannot import the private
// names of the .vibe module that rebinds it.
import * as Environment from "@smthrs/integrations/Environment"
import * as GitHub from "@smthrs/integrations/github"
import { Effect, Redacted } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type * as Presentation from "../cli/Presentation.ts"
import type * as CliError from "../CliError.vibe"
import { withCredentials } from "./Credentials.vibe"
import type { Integration } from "./Integrations.vibe"
import type { LocalOptions } from "./Store.vibe"

/** `path.resolve(root, file)`. */
export const resolvePath = (root: string, file: string): string => resolve(root, file)

/** Whether a file exists. */
export const fileExists = (path: string): boolean => existsSync(path)

/** A file's UTF-8 text. */
export const readText = (path: string): string => readFileSync(path, "utf8")

/** An async command body, as `async () => body()`. */
export const promised = async <A>(body: () => A): Promise<A> => body()

/** `probe`, given the module's host authorization check. */
export const makeProbe = (
  authorize: (item: Integration, env: Readonly<Record<string, string | undefined>>) => Integration
) =>
async (entry: Integration, token: string, timeoutMs = 10_000) => {
  authorize(entry, Environment.ambientEnvironment())
  const operation = GitHub.GitHubClient.make({ token, apiBaseUrl: entry.apiBaseUrl, maxRetries: 0 }, {}).request(
    "GET",
    "/rate_limit"
  )
  await Effect.runPromise(operation.pipe(Effect.timeout(timeoutMs)))
  return { id: entry.id, provider: entry.provider, healthy: true }
}

/** The `doctor` command body, given the module's refusal, default variable and probe. */
export const makeDoctor = (deps: {
  readonly refused: (fault: CliError.Fault, message: string) => CliError.Refused
  readonly defaultTokenEnv: (kind: Integration["provider"]) => string
  readonly probe: (
    entry: Integration,
    token: string,
    timeoutMs?: number
  ) => Promise<{ id: string; provider: Integration["provider"]; healthy: boolean }>
}) => {
  const secret = async (options: LocalOptions, entry: Integration): Promise<string> => {
    if (entry.credentialId !== undefined) {
      return withCredentials(options, (service) =>
        service.get(entry.credentialId!).pipe(
          Effect.flatMap(service.resolve),
          Effect.map(Redacted.value)
        ), true)
    }
    const envName = entry.tokenEnv ?? deps.defaultTokenEnv(entry.provider)
    const value = process.env[envName]
    if (value === undefined || value.length === 0) {
      throw deps.refused("user", `Missing credential environment variable ${envName}`)
    }
    return value
  }
  return async (
    context: Presentation.Failing & {
      readonly options: LocalOptions & { readonly offline: boolean; readonly timeoutMs: number }
    },
    select: () => ReadonlyArray<Integration>
  ) => {
    const entries = select()
    const results = await Promise.all(entries.map(async (entry) => {
      try {
        const token = await secret(context.options, entry)
        return context.options.offline ?
          { id: entry.id, provider: entry.provider, healthy: true, check: "credential-present" } :
          { ...await deps.probe(entry, token, context.options.timeoutMs), check: "provider-authentication" }
      } catch {
        // Provider error objects can carry nested request details; diagnostics report only inert identifiers.
        return {
          id: entry.id,
          provider: entry.provider,
          healthy: false,
          check: context.options.offline ? "credential-present" : "provider-authentication",
          error: "Credential lookup or provider authentication failed"
        }
      }
    }))
    if (results.some((result) => !result.healthy)) {
      return context.error({
        code: "integration_unhealthy",
        exitCode: 1,
        message: JSON.stringify({ healthy: false, integrations: results })
      })
    }
    return { healthy: true, integrations: results }
  }
}
