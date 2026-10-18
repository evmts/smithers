/** Exact, read-only upstream audit. Only the two task-authorized jj operations are used. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
const revision = "4e26f6af"
const cwd = process.argv.find(arg => arg.startsWith("--upstream="))?.slice(11) ?? join(homedir(), "effectscript")
const jj = (...args) => execFileSync("jj", ["--ignore-working-copy", "file", ...args, "-r", revision], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
const read = name => JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), "utf8"))
const files = read("files"), tree = read("tree"), aliases = read("path-aliases")
const records = ["issues", "pulls", "commits", "runs", "stack", "releases", "tags"].map(name => JSON.stringify(read(name))).join("\n")
const reviewEntry = readFileSync(new URL("../../../../effeck-site-main.tsx", import.meta.url), "utf8")
const paths = new Set(jj("list").trimEnd().split("\n"))
for (const blob of files) {
  assert(paths.has(blob.path), `Upstream path: ${blob.path}`)
  assert.equal(blob.content, jj("show", `root-file:${blob.path}`), `Full pinned blob: ${blob.path}`)
  assert.equal(tree.find(entry => entry.path === blob.path)?.size, Buffer.byteLength(blob.content), `Tree byte size: ${blob.path}`)
  if (blob.path.endsWith(".vibe")) assert.equal(blob.lang, "vibe")
}
for (const entry of tree) assert(entry.kind === "dir" ? [...paths].some(path => path.startsWith(entry.path + "/")) : paths.has(entry.path), `Pinned tree entry: ${entry.path}`)
for (const [before, after] of Object.entries(aliases)) {
  assert(!paths.has(before), `Alias is an upstream rename: ${before}`)
  assert(files.some(blob => blob.path === after), `Alias target: ${after}`)
  assert(!files.some(blob => blob.path === before), `No duplicate old blob: ${before}`)
  if (before.endsWith(".effeck")) assert(records.includes(before) || reviewEntry.includes(before), `Legacy extension requires a historical record or retained screen URL: ${before}`)
}
for (const page of read("docs")) {
  const path = `docs/${page.slug}.md`
  assert.equal(page.body, files.find(blob => blob.path === (aliases[path] ?? path))?.content, `Docs body: ${page.slug}`)
}
const home = JSON.parse(files.find(blob => blob.path === ".smithers/home.json").content).blocks
assert.deepEqual(read("repo").config.home.filter(block => block.type !== "fixed-by-agents"), home)
console.log(`PASS ${revision}: ${files.length} complete blobs, ${tree.length} tree entries, ${read("docs").length} docs, home blocks, ${Object.keys(aliases).length} old-path aliases`)
