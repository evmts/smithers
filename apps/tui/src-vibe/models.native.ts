// E-7 (EK4402): homedir and readFileSync are platform APIs; models.vibe calls them where models.ts does.
// A-2/E-4 (D38): `detect` awaits Promise.all over Providers.claudeCode and Effect.runPromise, a runner
// boundary that hands a Promise to TypeScript callers, so its body stays TypeScript, unchanged from
// models.ts. The module's private helpers reach it as `internal`.
import * as NodeControl from "@smthrs/cli/NodeControl"
import * as Providers from "@smthrs/cli/Providers"
import type * as RequestExecutor from "@smthrs/model/RequestExecutor"
import { Effect, type Layer } from "effect"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import type { Available, Model } from "./models.vibe"

/** `homedir()`. */
export const homeDirectory = (): string => homedir()

/** `readFileSync(path, "utf8")`. */
export const readFile = (path: string): string => readFileSync(path, "utf8")

/** The models.vibe helpers `detect` uses. */
export interface Internal {
  readonly detectWithoutClaude: (environment: NodeJS.ProcessEnv) => Available
  readonly hostOf: (environment: NodeJS.ProcessEnv) => Providers.Host
  readonly claudeCode: ReadonlyArray<Omit<Model, "provider">>
  readonly described: (seat: string) => Omit<Model, "provider">
  readonly withModels: (models: ReadonlyArray<Model>, environment: NodeJS.ProcessEnv) => Available
}

/** models.ts `detect`, unchanged. */
export const detect = async (
  environment: NodeJS.ProcessEnv,
  poolExecutor: Layer.Layer<RequestExecutor.RequestExecutor>,
  internal: Internal
): Promise<Available> => {
  const base = internal.detectWithoutClaude(environment)
  const [claude, poolSeat] = await Promise.all([
    Providers.claudeCode(internal.hostOf(base.environment)),
    Effect.runPromise(
      NodeControl.accountPoolDefaultModel(base.environment).pipe(
        Effect.provide(poolExecutor),
        Effect.timeout(5000),
        Effect.orElseSucceed(() => undefined)
      )
    )
  ])
  const models = [...base.models]
  if (claude.available) models.push(...internal.claudeCode.map((model) => ({ ...model, provider: "Claude Code" })))
  if (poolSeat !== undefined && !models.some((model) => model.seat === poolSeat)) {
    models.push({ ...internal.described(poolSeat), provider: "Account pool" })
  }
  return internal.withModels(models, base.environment)
}
