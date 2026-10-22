import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import * as Detached from "../src/Detached.ts"

it("admits a run beyond a large sparse log without retaining the log in launcher memory", async () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-admission-memory-"))
  try {
    const entry = join(root, "child.mjs")
    writeFileSync(
      entry,
      `import { ftruncateSync, writeSync } from 'node:fs';
      ftruncateSync(2, 256 * 1024 * 1024);
      writeSync(2, '\\nSMITHERS_DETACHED_ADMISSION=run:' + process.env.SMITHERS_INTERNAL_DETACHED_ADMISSION + ' runId=run-memory\\n');`
    )
    const before = process.resourceUsage().maxRSS
    const result = await Detached.launch({ root, entry, payload: "{}", admission: async () => true, timeoutMs: 10000 })
    expect(result).toHaveProperty("runId", "run-memory")
    // maxRSS is KiB on Node on both supported test hosts. The 256 MiB hole
    // must be read incrementally; retaining even one full copy breaches this.
    expect(process.resourceUsage().maxRSS - before).toBeLessThan(128 * 1024)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("refuses excessive distinct admission claims instead of retaining them indefinitely", async () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-admission-claims-"))
  try {
    const entry = join(root, "child.mjs")
    writeFileSync(
      entry,
      `import { writeSync } from 'node:fs';
      for (let n = 0; n < 4096; n++) writeSync(2, 'SMITHERS_DETACHED_ADMISSION=run:' + process.env.SMITHERS_INTERNAL_DETACHED_ADMISSION + ' runId=run-' + n + '\\n');`
    )
    const result = await Detached.launch({ root, entry, payload: "{}", admission: async () => false, timeoutMs: 10000 })
    expect(result).toHaveProperty("reason", expect.stringContaining("admission candidate limit"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
