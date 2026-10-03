import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BenchmarkFailed, type Input } from "./schema.ts"

export interface Credentials {
  readonly home: string
  readonly env: NodeJS.ProcessEnv
  readonly secrets: ReadonlyArray<string>
  close(): Promise<void>
}
export function cloudEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  environment ??= process.env
  const token = environment.BENCHMARK_SMITHERS_TOKEN
  if (!token) {
    throw new BenchmarkFailed({ code: "credentials", message: "Seed BENCHMARK_SMITHERS_TOKEN as a repository secret" })
  }
  const expires = Date.parse(environment.BENCHMARK_TOKEN_EXPIRES_AT ?? "")
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    throw new BenchmarkFailed({
      code: "credentials",
      message: "Seed the scoped Cloud token and a future BENCHMARK_TOKEN_EXPIRES_AT credential deadline"
    })
  }
  const origin = environment.SMITHERS_API_ORIGIN ?? "https://api.jjhub.tech"
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new BenchmarkFailed({ code: "configuration", message: "SMITHERS_API_ORIGIN must be an HTTPS origin" })
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.href !== `${parsed.origin}/`) {
    throw new BenchmarkFailed({ code: "configuration", message: "SMITHERS_API_ORIGIN must be an HTTPS origin" })
  }
  const env: NodeJS.ProcessEnv = {
    ...environment,
    SMITHERS_TOKEN: token,
    SMITHERS_API_ORIGIN: parsed.origin,
    GIT_TERMINAL_PROMPT: "0"
  }
  // Git LFS failure logs persist GIT_CONFIG_* values and trace switches.
  // Credentials belong in the private config file created below.
  for (const name of Object.keys(env)) {
    if (/^GIT_CONFIG(?:_|$)|^GIT_TRACE/.test(name) || name === "GIT_CURL_VERBOSE") delete env[name]
  }
  return env
}
export function secretValues(environment: NodeJS.ProcessEnv): Array<string> {
  const found = new Set<string>()
  for (const [name, value] of Object.entries(environment)) {
    if (value && /TOKEN|SECRET|PASSWORD|AUTH_BUNDLES|API_KEY/.test(name)) found.add(value)
  }
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.length >= 8) found.add(value)
    else if (value && typeof value === "object") { for (const child of Object.values(value)) visit(child) }
  }
  if (environment.BENCHMARK_CODEX_AUTH_BUNDLES) {
    try {
      visit(JSON.parse(environment.BENCHMARK_CODEX_AUTH_BUNDLES))
    } catch {
      throw new BenchmarkFailed({ code: "credentials", message: "Invalid BENCHMARK_CODEX_AUTH_BUNDLES JSON" })
    }
  }
  return [...found]
}
export async function credentials(
  accounts: NonNullable<Input["accounts"]>,
  models: boolean,
  environment?: NodeJS.ProcessEnv
): Promise<Credentials> {
  environment ??= process.env
  if (!accounts.length || accounts.some((account) => !["codex-1", "codex-3", "codex-acct-1"].includes(account))) {
    throw new BenchmarkFailed({ code: "credentials", message: "Account is outside the benchmark pool" })
  }
  const env = cloudEnvironment(environment)
  const secrets = secretValues(environment)
  const home = await mkdtemp(join(tmpdir(), "smithers-benchmark-auth-"))
  await chmod(home, 0o700)
  try {
    const gitConfig = join(home, "gitconfig")
    await writeFile(
      gitConfig,
      `[http ${JSON.stringify(`${env.SMITHERS_API_ORIGIN}/`)}]\n` +
        `\textraHeader = ${JSON.stringify(`Authorization: Bearer ${env.SMITHERS_TOKEN}`)}\n` +
        "[http]\n\tfollowRedirects = false\n",
      { mode: 0o600 }
    )
    if (models) {
      let bundles: Record<string, unknown>
      try {
        const value: unknown = JSON.parse(environment.BENCHMARK_CODEX_AUTH_BUNDLES ?? "")
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid bundle object")
        bundles = value as Record<string, unknown>
      } catch {
        throw new BenchmarkFailed({
          code: "credentials",
          message: "Seed BENCHMARK_CODEX_AUTH_BUNDLES as a repository secret"
        })
      }
      for (const account of accounts) {
        const auth = bundles[account] as {
          tokens?: { access_token?: string; refresh_token?: string; account_id?: string }
        } | undefined
        const tokens = auth?.tokens
        if (
          typeof tokens?.access_token !== "string" || !tokens.access_token.trim() ||
          typeof tokens.account_id !== "string" || !tokens.account_id.trim() ||
          (tokens.refresh_token !== undefined &&
            (typeof tokens.refresh_token !== "string" || !tokens.refresh_token.trim()))
        ) {
          throw new BenchmarkFailed({ code: "credentials", message: `Missing Codex bundle for ${account}` })
        }
        const directory = join(home, ".smithers", "accounts", account)
        await mkdir(directory, { recursive: true, mode: 0o700 })
        await writeFile(join(directory, "auth.json"), JSON.stringify(auth), { mode: 0o600 })
      }
    }
    const driverEnv: NodeJS.ProcessEnv = {
      ...env,
      HOME: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      SMITHERS_CODEX_POOL: accounts.join(","),
      SMITHERS_CODEX_POOL_STATE: join(home, "pool.json")
    }
    for (const name of Object.keys(driverEnv)) {
      if (
        (/TOKEN|SECRET|PASSWORD|AUTH|API_KEY/.test(name) &&
          !["SMITHERS_TOKEN", "BENCHMARK_TOKEN_EXPIRES_AT"].includes(name)) ||
        ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "GOOGLE_APPLICATION_CREDENTIALS", "AWS_SHARED_CREDENTIALS_FILE"].includes(
          name
        )
      ) {
        delete driverEnv[name]
      }
    }
    return { home, secrets, env: driverEnv, close: () => rm(home, { recursive: true, force: true }) }
  } catch (error) {
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
