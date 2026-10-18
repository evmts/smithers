import { Glob } from "bun"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { journey, type Journey } from "./journey"

/** A module exports one journey or an ordered array of independently addressable cases. */
export const loadJourneys = async (names: readonly string[]) => {
  const loaded: { definition: Journey; file: string }[] = []
  const ids = new Set<string>()
  for (const name of names) {
    const file = name.endsWith(".ts") ? resolve(name) : resolve(import.meta.dirname, "journeys", `${name}.journey.ts`)
    const value = (await import(pathToFileURL(file).href)).default
    const cases = Array.isArray(value) ? value : [value]
    if (!cases.length) throw new Error(`No journeys: ${file}`)
    for (const item of cases) {
      const definition = journey(item)
      if (ids.has(definition.id)) throw new Error(`Duplicate journey: ${definition.id}`)
      ids.add(definition.id)
      loaded.push({ definition, file })
    }
  }
  return loaded
}

/** Catalog and all-journeys CLI selection share the same file discovery. */
export const journeyFiles = async (): Promise<string[]> => {
  const files: string[] = []
  for await (const file of new Glob("**/*.journey.ts").scan(resolve(import.meta.dirname, "journeys")))
    files.push(resolve(import.meta.dirname, "journeys", file))
  return files.sort()
}
