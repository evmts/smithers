import type { z } from "zod"
import { RepositoryContentsSchema } from "@smthrs/rpc/RepositoryRead"
import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import { FileCardSchema } from "@smthrs/rpc/FileCard"
import { mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join } from "node:path"
import type { Exchange } from "./observe"
import { readRoutes } from "./routes/reads"
import { matchRoute } from "./route"

const schemas = { RepoContents: RepositoryContentsSchema, RepositoryHome: RepositoryHomeSchema, FileCard: FileCardSchema }
const schemaErrors = (issues: ReadonlyArray<z.core.$ZodIssue>): string[] => issues.flatMap(issue =>
  issue.code === "invalid_union" ? schemaErrors(issue.errors.flat()).sort((a, b) => Number(a.startsWith("$:")) - Number(b.startsWith("$:")))
    : [`${issue.path.join(".") || "$"}: ${issue.message}`])
export const decode = (name: string, body: unknown): unknown => {
  const schema = schemas[name as keyof typeof schemas] ?? readRoutes.find(route => `${route.method} ${route.path}` === name)?.schema
  if (!schema) throw new Error(`Unknown RPC schema: ${name}`)
  const result = schema.safeParse(body)
  if (!result.success) throw new Error(`${name}: ${schemaErrors(result.error.issues).join("; ")}`)
  return result.data
}
const redact = (value: unknown, redactCredentials: (text: string) => string): unknown => {
  if (typeof value === "string") return redactCredentials(value)
  if (Array.isArray(value)) return value.map(item => redact(item, redactCredentials))
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [redactCredentials(key),
      /^(?:key)$|(?:token|password|passwd|secrets?|apikey|privatekey|authorization|cookies?|credentials?|secretvalue|credentialvalue)$/i.test(key.replace(/[-_]/g, "")) ? "[redacted]"
        : key === "content" && record.encoding === "base64" && typeof item === "string"
          ? Buffer.from(redactCredentials(Buffer.from(item, "base64").toString("utf8"))).toString("base64") : redact(item, redactCredentials)]))
  }
  return value
}
const unknownFieldsOf = (raw: unknown, decoded: unknown, path = "$"): Array<{ path: string; kind: string }> => {
  if (Array.isArray(raw) && Array.isArray(decoded)) return raw.flatMap((value, index) => unknownFieldsOf(value, decoded[index], `${path}[${index}]`))
  if (raw === null || decoded === null || typeof raw !== "object" || typeof decoded !== "object") return []
  return Object.entries(raw).flatMap(([key, value]) => Object.hasOwn(decoded, key)
    ? unknownFieldsOf(value, (decoded as Record<string, unknown>)[key], `${path}.${key}`)
    : [{ path: `${path}.${key}`, kind: value === null ? "null" : Array.isArray(value) ? "array" : typeof value }])
}
/** Use the D1 RPC route contracts; unknown or malformed responses never become fixtures. */
export const capture = async (exchange: Exchange, directory: string, revision: string): Promise<void> => {
  // Load the existing credential masker only for capture, including diagnostics.
  const { redactCredentials } = await import(new URL("../../../packages/smithers/build/targets/src/LlmLint.ts", import.meta.url).href) as { readonly redactCredentials: (text: string) => string }
  const path = new URL(exchange.url).pathname
  const route = readRoutes.find(route => route.method === exchange.method && matchRoute(route.path, path) !== undefined)
  if (!route) throw new Error(redactCredentials(`Unknown RPC capture schema: ${exchange.method} ${path}`))
  const schema = `${route.method} ${route.path}`
  let decoded: unknown
  try { decoded = decode(schema, exchange.body) }
  catch (error) { throw new Error(redactCredentials(String(error))) }
  const fixture = redact({
    schema, status: exchange.status, response: decoded,
    // Drift needs unknown names/types, never untyped values that may be credentials.
    unknownFields: unknownFieldsOf(exchange.body, decoded),
    provenance: { url: exchange.url, time: new Date().toISOString(), revision, lifecycle: "artifact" }
  }, redactCredentials)
  decode(schema, (fixture as { readonly response: unknown }).response)
  const output = join(directory, "overrides")
  await mkdir(output, { recursive: true })
  await writeFile(join(output, `${createHash("sha256").update(exchange.method + exchange.url).digest("hex")}.json`), JSON.stringify(fixture, null, 2) + "\n")
}
