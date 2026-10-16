#!/usr/bin/env node
import { createHash } from "node:crypto"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

/** One Flow host executable in a native bundle, by its path relative to the manifest. */
export interface FlowHost {
  readonly executable: string
  readonly sha256: string
  readonly flows: ReadonlyArray<string>
}

/** `flow-hosts.json`, which packages/backend/flowmanifest reads (#2273). */
export interface FlowHostManifest {
  readonly version: 1
  readonly hosts: { readonly coding: FlowHost; readonly jjExport?: FlowHost }
}

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256").update(await readFile(path)).digest("hex")

const inside = (root: string, path: string): boolean => {
  const child = relative(root, path)
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

const host = async (root: string, path: string, flows: ReadonlyArray<string>): Promise<FlowHost> => {
  const absolute = resolve(path)
  if (!inside(root, absolute)) throw new Error(`Flow host escapes its bundle: ${absolute}`)
  const info = await stat(absolute)
  if (!info.isFile() || info.size === 0) throw new Error(`Flow host is unavailable: ${absolute}`)
  await chmod(absolute, 0o755)
  return {
    executable: basename(absolute),
    sha256: await sha256(absolute),
    flows
  }
}

export const writeFlowHostManifest = async (
  { output, coding, jjExport }: { readonly output: string; readonly coding: string; readonly jjExport?: string | undefined }
): Promise<FlowHostManifest> => {
  const manifestPath = resolve(output)
  const root = dirname(manifestPath)
  await mkdir(root, { recursive: true })
  const hosts: FlowHostManifest["hosts"] = {
    coding: await host(root, coding, ["coding/dispatch"]),
    ...(jjExport === undefined ? {} : {
      jjExport: {
        ...await host(root, jjExport, []),
        executable: relative(root, resolve(jjExport))
      }
    })
  }
  for (const entry of Object.values(hosts)) {
    await mkdir(dirname(resolve(root, `${entry.executable}.sha256`)), { recursive: true })
    await writeFile(
      resolve(root, `${entry.executable}.sha256`),
      `${entry.sha256}  ${basename(entry.executable)}\n`,
      { mode: 0o644 }
    )
  }
  await writeFile(manifestPath, `${JSON.stringify({ version: 1, hosts }, null, 2)}\n`, { mode: 0o644 })
  return { version: 1, hosts }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output, coding, jjExport] = process.argv.slice(2)
  if (output === undefined || coding === undefined) {
    throw new Error("usage: flow-host-manifest.mts OUTPUT CODING_HOST [LINUX_ARM64_JJ_EXPORT]")
  }
  await writeFlowHostManifest({ output, coding, jjExport })
}
