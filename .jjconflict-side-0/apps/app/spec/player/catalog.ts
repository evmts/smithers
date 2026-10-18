import { Glob } from "bun"
import { realpath } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { loadJourneys, journeyFiles } from "../loadJourneys"
import { results, type RunResult } from "../results"

/** The host reads the same definitions and receipts as the runner, newest per mode. */
export const catalog = async (resultsDirectory: string) => {
  const journeys = (await loadJourneys(await journeyFiles())).map(item => item.definition)
  const newest = new Map<string, RunResult>()
  for await (const file of new Glob("**/*.json").scan(resultsDirectory)) {
    let runs: ReadonlyArray<RunResult>
    try {
      const path = await realpath(resolve(resultsDirectory, file))
      if (!path.startsWith(resultsDirectory + sep)) continue
      runs = results(await Bun.file(path).json())
    } catch { continue }
    for (const run of runs) {
      const key = `${run.journey}:${run.mode}`
      if (!newest.has(key) || Date.parse(run.startedAt) > Date.parse(newest.get(key)!.startedAt)) newest.set(key, run)
    }
  }
  return { journeys: journeys.sort((a, b) => a.id.localeCompare(b.id)), runs: [...newest.values()] }
}
