/** Repository site commands share the backend owner-action seam.
 * @since 0.1.0
 */
import { constants } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { UsageError } from "../../CliError.ts"
import { object, str } from "./Client.ts"
import type { Client, Values } from "./Client.ts"
import type { Handler } from "./Resources.ts"

const maxBytes = 16 << 20
const maxFiles = 512
const endpoint = (c: Client, o: Values) => `${c.repoPath(o.repo)}/site`
const command = (c: Client, o: Values, body: unknown) => c.request("POST", endpoint(c, o), body)
const activeVersion = async (c: Client, o: Values): Promise<string> => {
  if (o.expected !== undefined) return str(o.expected)
  return str(object(object(await c.request("GET", endpoint(c, o))).site).active)
}

/** @private
 * @since 0.1.0
 */
export const sites: Record<string, Handler> = {
  "site status": (c, _a, o) => c.request("GET", endpoint(c, o)),
  "site enable": (c, _a, o) => command(c, o, { action: "enable", name: str(o.name), appPrefix: str(o["app-prefix"]) }),
  "site activate": async (c, a, o) =>
    command(c, o, { action: "activate", version: str(a.version), expected: await activeVersion(c, o) })
}
for (const action of ["add", "verify", "remove"] as const) {
  sites[`site domain ${action}`] = (c, a, o) => command(c, o, { action: `domain.${action}`, domain: str(a.domain) })
}

sites["site publish"] = async (c, a, o) => {
  const root = resolve(str(a.directory))
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new UsageError({ message: "Publish a directory without symbolic links" })
  }
  const files: Array<{ path: string; data: string }> = []
  let bytes = 0
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const filename = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new UsageError({ message: "Publication contains a symbolic link" })
      if (entry.isDirectory()) {
        await visit(filename)
        continue
      }
      if (!entry.isFile() || files.length >= maxFiles) {
        throw new UsageError({ message: "Publication contains unsupported files or exceeds 512 files" })
      }
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > maxBytes - bytes) {
          throw new UsageError({ message: "Publication exceeds 16 MiB" })
        }
        const parts: Buffer[] = []
        let count = 0
        for (;;) {
          const chunk = Buffer.alloc(Math.min(64 << 10, maxBytes - bytes - count + 1))
          const read = await file.read(chunk, 0, chunk.byteLength, null)
          if (!read.bytesRead) break
          count += read.bytesRead
          if (bytes + count > maxBytes) throw new UsageError({ message: "Publication exceeds 16 MiB" })
          parts.push(chunk.subarray(0, read.bytesRead))
        }
        bytes += count
        files.push({
          path: relative(root, filename).split(sep).join("/"),
          data: Buffer.concat(parts).toString("base64")
        })
      } finally {
        await file.close()
      }
    }
  }
  await visit(root)
  if (!files.length) throw new UsageError({ message: "Publication is empty" })
  await c.confirm(o.yes, `publish ${files.length} files (${bytes} bytes) to ${c.repo(o.repo)}`)
  return command(c, o, { action: "publish", files, expected: await activeVersion(c, o) })
}
