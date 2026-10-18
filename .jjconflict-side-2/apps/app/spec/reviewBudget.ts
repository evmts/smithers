import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export interface Limits { readonly modelCalls?: number; readonly promptTokens?: number; readonly wallMs?: number }
export interface Charge { readonly modelCalls: number; readonly promptTokens: number; readonly wallMs: number }
interface Ledger { version: 1; days: Record<string, Charge>; runs: Record<string, Charge> }
const zero = (): Charge => ({ modelCalls: 0, promptTokens: 0, wallMs: 0 })
const keys = ["modelCalls", "promptTokens", "wallMs"] as const
const valid = (charge: Charge) => keys.every((key) => Number.isSafeInteger(charge[key]) && charge[key] >= 0)

/** Atomic conservative reservation: failures and cancellation never refund dispatch capacity. */
export const reserve = async (options: {
  path: string; run: string; at: Date; perRun: Limits; perDay: Limits; charge: Charge
}): Promise<boolean> => {
  if (!valid(options.charge) || !options.run || !Number.isFinite(options.at.getTime())) throw new Error("Invalid budget reservation")
  for (const limit of [options.perRun, options.perDay]) {
    if (Object.values(limit).some((value) => !Number.isSafeInteger(value) || value! < 1)) throw new Error("Invalid budget limit")
  }
  await mkdir(dirname(options.path), { recursive: true })
  // Contention refuses dispatch. A crashed writer's lock also fails closed.
  try { await mkdir(`${options.path}.lock`) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
    throw error
  }
  const staging = `${options.path}.tmp`
  try {
    const raw = await readFile(options.path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    const ledger: Ledger = raw === undefined ? { version: 1, days: {}, runs: {} } : JSON.parse(raw)
    if (ledger.version !== 1 || !ledger.days || !ledger.runs || ![...Object.values(ledger.days), ...Object.values(ledger.runs)].every(valid)) throw new Error("Invalid budget ledger")
    const day = options.at.toISOString().slice(0, 10)
    const runKey = JSON.stringify([day, options.run])
    const add = (current: Charge): Charge => Object.fromEntries(keys.map((key) => [key, current[key] + options.charge[key]])) as unknown as Charge
    const run = add(Object.hasOwn(ledger.runs, runKey) ? ledger.runs[runKey]! : zero())
    const daily = add(Object.hasOwn(ledger.days, day) ? ledger.days[day]! : zero())
    const fits = (charge: Charge, limit: Limits) => valid(charge) && keys.every((key) => limit[key] === undefined || charge[key] <= limit[key]!)
    if (!fits(run, options.perRun) || !fits(daily, options.perDay)) return false
    ledger.runs[runKey] = run
    ledger.days[day] = daily
    await writeFile(staging, JSON.stringify(ledger) + "\n")
    await rename(staging, options.path)
    return true
  } finally { await rmdir(`${options.path}.lock`) }
}
