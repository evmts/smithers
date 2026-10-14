import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { spawnSync } from "./test-child"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("the unit target collects proof tests without collecting Playwright's sibling proof directory", () => {
  const argv: string[] = JSON.parse(execFileSync("node", ["--input-type=module", "-e", `
    import { Package } from "./PACKAGE.ts"
    import { metadata } from "@smthrs/targets/Target"
    import { runArgv } from "@smthrs/targets/NodeTest"
    console.log(JSON.stringify(runArgv(metadata(Package.unitTests).attrs)))
  `], { cwd: join(import.meta.dir, ".."), encoding: "utf8", timeout: 120_000 }))
  const proofPath = argv.find(path => path.replace(/^\.\//, "") === "proof")!
  const root = mkdtempSync(join(tmpdir(), "unit-proof-selection-"))
  try {
    mkdirSync(join(root, "proof"))
    mkdirSync(join(root, "e2e/proof"), { recursive: true })
    /*
     * The collected test says so ITSELF. Bun 1.4 prints a passing test's name
     * nowhere — a one-file run is `1 pass / Ran 1 test across 1 file` and no
     * more — so asserting on the reporter's own words proved only that Bun had
     * changed its output. A marker the test writes is the same proof that THIS
     * file ran, and it does not move with the reporter.
     */
    writeFileSync(join(root, "proof/page.test.ts"), 'import { test, expect } from "bun:test"; test("proof unit collected", () => { console.log("PROOF_UNIT_COLLECTED"); expect(1).toBe(1) })')
    writeFileSync(join(root, "e2e/proof/j8.spec.ts"), 'throw new Error("Playwright proof must not run under Bun")')
    const result = spawnSync(process.execPath, ["test", "--isolate", proofPath], { cwd: root, encoding: "utf8", timeout: 60_000 })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(output).toContain("PROOF_UNIT_COLLECTED")
    expect(output).toContain("1 pass")
    // Exactly the one file: a collected sibling would raise its run count.
    expect(output).toContain("Ran 1 test across 1 file")
    expect(output).not.toContain("Playwright proof must not run under Bun")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
