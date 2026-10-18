// Check person references in every fixture JSON, including optional subjects and imports.
// Repository owners are namespace identifiers; quoted source/code/message strings remain verbatim.
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, resolve, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const identity = new Set(["author", "actor", "assignee", "approver", "askedOf", "by", "for", "login", "account", "owner"])
const identities = new Set(["assignees", "reviewers", "owners"])
export function checkCast(value, cast, where, check = assert.ok) {
  if (Array.isArray(value)) return value.forEach((item, i) => checkCast(item, cast, `${where}[${i}]`, check))
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value)) {
    if (identity.has(key) && typeof item === "string" && !(where === "repo.json" && key === "owner"))
      check(cast.has(item), `${where}.${key}: ${item} is outside this repository's cast`)
    if (identities.has(key) && Array.isArray(item))
      item.forEach(login => check(cast.has(login), `${where}.${key}: ${login} is outside this repository's cast`))
    checkCast(item, cast, `${where}.${key}`, check)
  }
}
export function auditCasts(check = assert.ok) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "data")
  let files = 0
  for (const entry of readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory())) {
    const dir = resolve(root, entry.name)
    const cast = new Set(JSON.parse(readFileSync(resolve(dir, "people.json"), "utf8")).map(person => person.login))
    const visit = folder => {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        const path = resolve(folder, item.name)
        if (item.isDirectory()) visit(path)
        else if (item.name.endsWith(".json")) {
          files++
          checkCast(JSON.parse(readFileSync(path, "utf8")), cast, relative(dir, path), (ok, reason) => check(ok, `${entry.name}/${reason}`))
        }
      }
    }
    visit(dir)
  }
  return files
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(`PASS cast references in ${auditCasts()} JSON files across four repositories`)
