#!/usr/bin/env node
import { createHash } from "node:crypto"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const sha256 = async (path) =>
  createHash("sha256").update(await readFile(path)).digest("hex")

const inside = (root, path) => {
  const child = relative(root, path)
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

const host = async (root, path, flows) => {
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

// The optional organization host's exact catalog (flows/organization/<name>/flow.ts).
// packages/backend/flowmanifest organizationFlows is the Go copy; a distribution
// test loads this script's output there, so the two cannot drift silently.
export const organizationFlows = [
  "organization/book-block",
  "organization/delegate",
  "organization/deliver",
  "organization/hire",
  "organization/intake",
  "organization/meeting-prepare",
  "organization/meetings-plan",
  "organization/retire",
  "organization/saas-request",
  "organization/status",
  "organization/sync",
  "organization/task"
]

export const writeFlowHostManifest = async ({ output, coding, librarian, organization }) => {
  const manifestPath = resolve(output)
  const root = dirname(manifestPath)
  await mkdir(root, { recursive: true })
  const hosts = {
    coding: await host(root, coding, ["coding/dispatch"]),
    librarian: await host(root, librarian, ["librarian/history", "librarian/wiki"]),
    ...(organization === undefined ? {} : { organization: await host(root, organization, [...organizationFlows]) })
  }
  for (const entry of Object.values(hosts)) {
    await writeFile(
      resolve(root, `${entry.executable}.sha256`),
      `${entry.sha256}  ${entry.executable}\n`,
      { mode: 0o644 }
    )
  }
  await writeFile(manifestPath, `${JSON.stringify({ version: 1, hosts }, null, 2)}\n`, { mode: 0o644 })
  return { version: 1, hosts }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const [output, coding, librarian, organization] = args
  if (output === undefined || coding === undefined || librarian === undefined || args.length > 4) {
    throw new Error("usage: flow-host-manifest.mjs OUTPUT CODING_HOST LIBRARIAN_HOST [ORGANIZATION_HOST]")
  }
  await writeFlowHostManifest({ output, coding, librarian, organization })
}
