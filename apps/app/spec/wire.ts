import { RepoContentsSchema } from "@smthrs/rpc/RepoContents"
import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import { FileCardSchema } from "@smthrs/rpc/FileCard"
import { mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join } from "node:path"
import type { Exchange } from "./observe"

const schemas = { RepoContents: RepoContentsSchema, RepositoryHome: RepositoryHomeSchema, FileCard: FileCardSchema }
export const decode = (name: string, body: unknown): unknown => {
  const schema = schemas[name as keyof typeof schemas]
  if (!schema) throw new Error(`Unknown RPC schema: ${name}`)
  const result = schema.safeParse(body)
  if (!result.success) throw new Error(`${name}: ${result.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ")}`)
  return result.data
}
const redact = (value: unknown, redactCredentials: (text: string) => string): unknown => {
  if (typeof value === "string") return redactCredentials(value)
  if (Array.isArray(value)) return value.map(item => redact(item, redactCredentials))
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [redactCredentials(key),
      /^(?:token|password|secret|authorization|cookie|access_token|refresh_token)$/i.test(key) ? "[redacted]"
        : key === "content" && record.encoding === "base64" && typeof item === "string"
          ? Buffer.from(redactCredentials(Buffer.from(item, "base64").toString("utf8"))).toString("base64") : redact(item, redactCredentials)]))
  }
  return value
}
/** Unknown routes are never saved as trusted fixtures. */
export const capture = async (exchange: Exchange, directory: string, revision: string): Promise<void> => {
  const path = new URL(exchange.url).pathname
  const schema = /\/contents\/.+/.test(path) ? "RepoContents" : /\/home$/.test(path) ? "RepositoryHome" : undefined
  if (!schema || exchange.status < 200 || exchange.status >= 300) return
  // Decode for acceptance, preserve unknown fields for wire-drift consumers.
  decode(schema, exchange.body)
  // Load the existing build tool only for capture, not every journey run.
  const { redactCredentials } = await import(new URL("../../../packages/smithers/build/targets/src/LlmLint.ts", import.meta.url).href) as { readonly redactCredentials: (text: string) => string }
  const fixture = redact({
    schema, response: exchange.body,
    provenance: { url: exchange.url, time: new Date().toISOString(), revision, lifecycle: "artifact" }
  }, redactCredentials)
  const output = join(directory, "overrides")
  await mkdir(output, { recursive: true })
  await writeFile(join(output, `${createHash("sha256").update(exchange.method + exchange.url).digest("hex")}.json`), JSON.stringify(fixture, null, 2) + "\n")
}
