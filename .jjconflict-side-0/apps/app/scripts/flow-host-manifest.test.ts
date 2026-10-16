import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { writeFlowHostManifest } from "./flow-host-manifest.mjs"

test("native Flow host bundle names and checksums its Linux arm64 helper", async () => {
  const root = await mkdtemp(join(tmpdir(), "smithers-flow-hosts-"))
  try {
    const coding = join(root, "smithers-coding-host")
    const helper = join(root, "linux-arm64", "smithers-jj-export")
    await mkdir(join(root, "linux-arm64"))
    await writeFile(coding, "coding")
    await writeFile(helper, "linux helper")
    const manifest = await writeFlowHostManifest({
      output: join(root, "flow-hosts.json"), coding, jjExport: helper
    })
    const digest = createHash("sha256").update("linux helper").digest("hex")
    expect(manifest.hosts.jjExport).toEqual({
      executable: "linux-arm64/smithers-jj-export", sha256: digest, flows: []
    })
    expect(await readFile(join(root, "linux-arm64", "smithers-jj-export.sha256"), "utf8"))
      .toBe(`${digest}  smithers-jj-export\n`)
    expect(JSON.parse(await readFile(join(root, "flow-hosts.json"), "utf8"))).toEqual(manifest)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("node runs it as the bundle build does: OUTPUT CODING_HOST", async () => {
  const root = await mkdtemp(join(tmpdir(), "smithers-flow-hosts-cli-"))
  try {
    const coding = join(root, "smithers-coding-host")
    await writeFile(coding, "coding")
    const script = resolve(import.meta.dir, "flow-host-manifest.mts")
    const run = spawnSync("node", [script, join(root, "flow-hosts.json"), coding], { encoding: "utf8" })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
    const written = JSON.parse(await readFile(join(root, "flow-hosts.json"), "utf8"))
    expect(written.hosts.coding).toEqual({
      executable: "smithers-coding-host",
      sha256: createHash("sha256").update("coding").digest("hex"),
      flows: ["coding/dispatch"]
    })
    const usage = spawnSync("node", [script], { encoding: "utf8" })
    expect(usage.status).not.toBe(0)
    expect(usage.stderr).toContain("usage: flow-host-manifest.mts OUTPUT CODING_HOST")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
