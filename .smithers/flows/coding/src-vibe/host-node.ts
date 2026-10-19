// E-7/EK4402: node:path, process.env and fetch are platform APIs that VibeLang
// code does not call directly. host.vibe runs the two fetches through try, as
// host.ts runs them through Effect.tryPromise, and reads the environment here.
import { join, resolve } from "node:path"
import { seatRefusal } from "../../../../packages/smithers/src/Providers.ts"

export const pathJoin = (...parts: ReadonlyArray<string>): string => join(...parts)
export const pathResolve = (path: string): string => resolve(path)
export const hostEnvironment = (): NodeJS.ProcessEnv => process.env

/** The factory seat bound to one role's model proxy credential. */
export const factorySeatBinding = async (
  origin: string,
  credential: string,
  signal: AbortSignal
): Promise<{ seat: string; protocol?: string }> => {
  const response = await fetch(`${origin.replace(/\/+$/, "")}/factory-seat`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal
  })
  if (!response.ok) throw new Error("Factory model is unavailable")
  const binding = await response.json() as { seat?: unknown; protocol?: unknown }
  if (
    typeof binding.seat !== "string" ||
    seatRefusal(binding.seat) !== undefined && binding.seat !== "auto"
  ) throw new Error("Invalid factory model")
  if (binding.protocol !== undefined && typeof binding.protocol !== "string") {
    throw new Error("Invalid factory model protocol")
  }
  return {
    seat: binding.seat,
    ...(typeof binding.protocol === "string" ? { protocol: binding.protocol } : {})
  }
}

/** The TODO input delivery fence a steering drain waits on. */
export const inputFence = async (runId: string, signal: AbortSignal): Promise<void> => {
  const origin = process.env.SMITHERS_MODEL_PROXY_URL
  const credential = process.env.SMITHERS_MODEL_ROLE_IMPLEMENTER_KEY
  if (!origin || !credential) throw new Error("Missing input delivery fence")
  const response = await fetch(`${origin.replace(/\/+$/, "")}/input-fence?run=${encodeURIComponent(runId)}`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal
  })
  if (!response.ok) throw new Error("Input delivery unavailable")
}
