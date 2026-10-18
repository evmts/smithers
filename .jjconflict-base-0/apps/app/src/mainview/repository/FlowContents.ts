import type { FilesSeam } from "../state/seams/FilesSeam"
import { unsafePath } from "../state/seams/FilesSeam"

export type ReadState<T> = { readonly state: "loading" } | { readonly state: "error"; readonly reason: string } | { readonly state: "ready"; readonly value: T }
  /** The admitted repository answered that the path is absent: no such flow. */
  | { readonly state: "missing" }
export interface FlowDefinition { readonly name: string; readonly path: string; readonly source: string; readonly description?: string }
export type FlowContents = Pick<FilesSeam["contents"], "listFiles" | "readFile">
const root = ".smithers/flows"
/** The entry files `smthrs flow list` discovers a flow by (.smithers/flows/README.md), in that order. */
export const FLOW_ENTRY_FILES = ["flow.ts", "flow.mdx", "SKILL.md"] as const
/**
 * The contents route's 404 sentence (FilesSeam). The flows reader runs only
 * after the repository document admitted this repository, so here it names a
 * missing path, never a missing repository.
 */
const missingPath = (answer: string) => answer.startsWith("Path not found:")
/** A Markdown flow's `description:` frontmatter, when it is one plain or quoted line. */
export function frontmatterDescription(source: string): string | undefined {
  const head = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1]
  const line = head?.split(/\r?\n/).find(row => /^description:/.test(row))?.slice("description:".length).trim()
  if (!line || /^[|>]/.test(line)) return
  if (line.startsWith('"')) { try { const value: unknown = JSON.parse(line); return typeof value === "string" && value ? value : undefined } catch { return } }
  if (line.startsWith("'")) return line.length > 1 && line.endsWith("'") ? line.slice(1, -1).replaceAll("''", "'") || undefined : undefined
  return line
}
export const validFlowName = (name: string) => !!name && !name.includes("/") && !name.includes("\\") && !unsafePath(name) && !/[\s\x00-\x1f\x7f]/.test(name)
export const flowCommand = (name: string) => `npx smthrs@next flow start ${/^[a-zA-Z0-9][\w.-]*$/.test(name) ? name : `'${name.replaceAll("'", "'\\''")}'`}`

/** Static literal metadata only. Never evaluate repository code. */
export function flowDescription(source: string): string | undefined {
  const tokens = source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[a-zA-Z_$][\w$]*|[^\s]/g)?.filter(token => !token.startsWith("//") && !token.startsWith("/*")) ?? []
  const start = tokens.findIndex((token, i) => token === "Flow" && tokens[i + 1] === "." && tokens[i + 2] === "make" && tokens[i + 3] === "(" && tokens[i + 5] === "," && tokens[i + 6] === "{")
  if (start < 0) return
  let depth = 1
  for (let i = start + 7; i < tokens.length && depth > 0; i++) {
    const token = tokens[i]!
    if (token === "{" || token === "[" || token === "(") depth++
    if (token === "}" || token === "]" || token === ")") depth--
    if (depth !== 1 || !["description", '"description"', "'description'"].includes(token) || tokens[i + 1] !== ":") continue
    const literal = tokens[i + 2] ?? ""
    if (![",", "}"].includes(tokens[i + 3] ?? "")) return
    if (literal.startsWith('"')) { try { return JSON.parse(literal) as string } catch { return } }
    if (literal.startsWith("'") || literal.startsWith("`")) {
      if ((literal.startsWith("`") && literal.includes("${")) || /\\(?!['"`\\nrt])/.test(literal)) return
      return literal.slice(1, -1).replace(/\\(['"`\\nrt])/g, (_, char: string) => ({ n: "\n", r: "\r", t: "\t" })[char] ?? char)
    }
    return
  }
}

/** The entry file one flow directory declares, or "missing" when it declares none or is absent. */
async function flowEntry(contents: FlowContents, repo: string, name: string, ref?: string): Promise<ReadState<string>> {
  const answer = await contents.listFiles(`${root}/${name}`, repo, ref)
  if (typeof answer === "string") return missingPath(answer) ? { state: "missing" } : { state: "error", reason: answer }
  if (answer.card.kind !== "file-list" || !Array.isArray(answer.card.payload.entries) || answer.card.payload.truncated) return { state: "error", reason: "The flow definitions couldn't be read." }
  const files = new Set(answer.card.payload.entries.flatMap(entry => entry.kind === "file" ? [entry.name] : []))
  const entry = FLOW_ENTRY_FILES.find(file => files.has(file))
  return entry === undefined ? { state: "missing" } : { state: "ready", value: `${root}/${name}/${entry}` }
}

export async function readFlow(contents: FlowContents, repo: string, name: string, ref?: string): Promise<ReadState<FlowDefinition>> {
  if (!validFlowName(name)) return { state: "missing" }
  const entry = await flowEntry(contents, repo, name, ref)
  if (entry.state !== "ready") return entry
  const path = entry.value
  const answer = await contents.readFile(path, repo, undefined, ref)
  if (typeof answer === "string") return missingPath(answer) ? { state: "missing" } : { state: "error", reason: answer }
  if (answer.card.kind !== "file") return { state: "error", reason: "The flow source couldn't be read." }
  const payload = answer.card.payload
  if (typeof payload.content !== "string") return { state: "error", reason: "The flow source couldn't be read." }
  if (payload.binary || payload.truncated || new TextEncoder().encode(payload.content).byteLength > 512 * 1024) return { state: "error", reason: payload.binary ? "Binary file" : "The flow source is too large to display." }
  const source = payload.content
  const description = path.endsWith(".ts") ? flowDescription(source) : frontmatterDescription(source)
  return { state: "ready", value: { name, path, source, ...(description === undefined ? {} : { description }) } }
}

/**
 * The flows `smthrs flow list` would name at the top of `.smithers/flows`: each
 * directory that declares an entry file. One listing for the root, then one per
 * directory (at most six at a time). Descriptions are read when opening the
 * source, never invented; a directory read that fails fails the whole list.
 */
export async function readFlows(contents: FlowContents, repo: string, ref?: string): Promise<ReadState<readonly { name: string; path: string }[]>> {
  const answer = await contents.listFiles(root, repo, ref)
  if (typeof answer === "string") return missingPath(answer) ? { state: "ready", value: [] } : { state: "error", reason: answer }
  if (answer.card.kind !== "file-list") return { state: "error", reason: "The flow definitions couldn't be read." }
  const entries = answer.card.payload.entries
  if (!Array.isArray(entries)) return { state: "error", reason: "The flow definitions couldn't be read." }
  if (answer.card.payload.truncated) return { state: "error", reason: "The flow definitions haven't all loaded." }
  const names = entries.flatMap(entry => entry.kind === "dir" && validFlowName(entry.name) ? [entry.name] : [])
  const found: (ReadState<string> | undefined)[] = names.map(() => undefined)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(6, names.length) }, async () => {
    while (next < names.length) { const index = next++; found[index] = await flowEntry(contents, repo, names[index]!, ref) }
  }))
  const failed = found.find(entry => entry?.state === "error")
  if (failed?.state === "error") return { state: "error", reason: failed.reason }
  return { state: "ready", value: names.flatMap((name, index) => { const entry = found[index]; return entry?.state === "ready" ? [{ name, path: entry.value }] : [] }) }
}
