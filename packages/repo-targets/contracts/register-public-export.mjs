/** Register one deliberately reviewed public addition, preserving historical maps. */
import { readFileSync, writeFileSync } from "node:fs"

const [directory, subpath, reason] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(new URL(`../../../${directory}/package.json`, import.meta.url), "utf8"))
const name = manifest.name
if (!name || !subpath || !reason) throw new Error("Expected package, subpath and review reason")
const development = manifest.exports[subpath]
const published = manifest.publishConfig.exports[subpath]
if (!development || !published || subpath.includes("*")) throw new Error("Expected an explicit public entry")
const file = new URL("./fixtures/public-export-surface.json", import.meta.url)
const fixture = JSON.parse(readFileSync(file, "utf8"))
if (fixture.added.some((entry) => entry.name === name && entry.subpath === subpath)) {
  throw new Error("Addition already registered")
}
fixture.added.push({ name, subpath, development, published, reason })
writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n")
