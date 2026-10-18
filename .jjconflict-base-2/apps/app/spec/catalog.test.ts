import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { loadJourneys, journeyFiles } from "./loadJourneys"
import { catalog } from "./player/catalog"
const names = ["github-paths", "line-to-run", "waiting-on-you", "issue-to-stack", "settings-models", "states"].map(name => `default/${name}`)

test("runner and catalog retain all 86 P1 definitions and 124 checkpoints", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "spec-catalog-"))
  try {
    const loaded = await loadJourneys(names)
    expect(loaded).toHaveLength(86)
    expect(loaded.reduce((n, { definition }) => n + (definition.steps.length || 1), 0)).toBe(124)
    expect(new Set(loaded.map(item => item.definition.id)).size).toBe(86)
    const all = await loadJourneys(await journeyFiles())
    expect(all).toHaveLength(92)
    const data = await catalog(directory)
    expect(data.journeys).toHaveLength(all.length)
    for (const { definition } of loaded) expect(data.journeys.find(item => item.id === definition.id)).toEqual(definition)
    expect(data.journeys.filter(item => item.id.startsWith("default/settings-models-"))).toHaveLength(2)
    expect(data.journeys.filter(item => item.id.startsWith("default/states-"))).toHaveLength(80)
    expect(loaded[4]!.file).toBe(loaded[5]!.file)
    expect(loaded[6]!.file).not.toBe(loaded[5]!.file)
    const file = resolve(directory, "duplicate.ts")
    await writeFile(file, `export default ${JSON.stringify([loaded[0]!.definition, loaded[0]!.definition])}`)
    const empty = resolve(directory, "empty.ts")
    await writeFile(empty, "export default []")
    await expect(loadJourneys([file])).rejects.toThrow("Duplicate journey")
    await expect(loadJourneys([empty])).rejects.toThrow("No journeys")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
