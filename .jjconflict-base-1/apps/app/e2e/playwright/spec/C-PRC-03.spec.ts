import { execFile } from "node:child_process"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { expect, test } from "../browserTest"

// Engineering CLI boundary with isolated external transport; not host qualification.
// 27381adab9 moved issue closure out of check-receipts into issue-claim, so this
// suite now proves the recorder boundary; it pins names the suite still declares.
test("C-PRC-03: the recorder refuses invalid evidence before publication", async () => {
  test.setTimeout(120_000)
  const root = resolve(__dirname, "../../../../..")
  const { stdout } = await promisify(execFile)(process.execPath,
    ["--test", "--test-reporter=tap", ".smithers/flows/evidence/check-receipts.test.mjs"],
    { cwd: root, timeout: 110_000, maxBuffer: 4 * 1024 * 1024 })
  expect(stdout).toMatch(/# fail 0\b/)
  expect(stdout).toMatch(/# skipped 0\b/)
  expect(stdout).toMatch(/# pass [1-9]\d*/)
  expect(stdout).toContain("GitHub check success authenticates artifact claims at recorder boundary")
  expect(stdout).toContain("root-check-mapping-validation: markers refuse recorder without dispatch")
  expect(stdout).toContain("duplicate CI artifact identities refuse at recorder boundary")
})
