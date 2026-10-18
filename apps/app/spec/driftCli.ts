import { readFile, rename, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { drift, type DriftInput } from "./drift"
import { issueOwner } from "./issueOwner"
import { results } from "./results"

/** Manifest holds world capabilities, journey owners, Product decisions and factory spec policy. */
export const driftCli = async (manifest: string, directory: string, receiptFiles: readonly string[], overrides: Partial<DriftInput> = {}) => {
  const input = JSON.parse(await readFile(manifest, "utf8")) as Omit<DriftInput, "runs" | "previous">
  const runs = (await Promise.all(receiptFiles.map(async file => results(JSON.parse(await readFile(file, "utf8")))))).flat()
  const path = resolve(directory, "drift.json")
  let previous: DriftInput["previous"]
  try { previous = JSON.parse(await readFile(path, "utf8")).rows } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const value = await drift({ ...input, ...overrides, runs, previous }, issueOwner(process.env.GITHUB_TOKEN ?? ""))
  const temporary = path + `.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 })
  await rename(temporary, path)
  return value
}
if (import.meta.main) {
  const [manifest, directory, ...files] = process.argv.slice(2)
  if (!manifest || !directory || !files.length) throw new Error("driftCli.ts <manifest> <results-directory> <receipts...>")
  console.log(JSON.stringify(await driftCli(manifest, directory, files)))
}
