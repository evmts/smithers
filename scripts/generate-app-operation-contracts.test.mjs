import assert from "node:assert/strict"
import { mkdtemp, mkdir, copyFile, readFile, writeFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))
test("generated Account contracts detect artifact and authoritative metadata drift", async () => {
  const owned = await mkdtemp(join(tmpdir(), "account-contract-producer-"))
  try {
    for (const directory of ["scripts", "packages/smithers/control/src", "packages/backend/appoperation"]) await mkdir(join(owned, directory), { recursive: true })
    for (const path of ["scripts/generate-app-operation-contracts.ts", "packages/smithers/control/src/Account.ts", "packages/smithers/control/src/Operation.ts", "packages/backend/appoperation/account.generated.json"]) await copyFile(join(root, path), join(owned, path))
    await writeFile(join(owned, "package.json"), '{"type":"module"}')
    await symlink(join(root, "node_modules"), join(owned, "node_modules"))
    const run = (...args) => spawnSync(process.execPath, [join(owned, "scripts/generate-app-operation-contracts.ts"), ...args], { cwd: owned, encoding: "utf8" })
    assert.equal(run("--check").status, 0)
    const generated = join(owned, "packages/backend/appoperation/account.generated.json")
    await writeFile(generated, "{}\n")
    assert.notEqual(run("--check").status, 0)
    assert.equal(run().status, 0)
    assert.deepEqual(JSON.parse(await readFile(generated, "utf8")).schemas.noInput, { type: "object", additionalProperties: false })
    const source = join(owned, "packages/smithers/control/src/Account.ts")
    await writeFile(source, (await readFile(source, "utf8")).replace('summary: "Show account"', 'summary: "Changed in the owned producer fixture"'))
    assert.notEqual(run("--check").status, 0)
    assert.equal(run().status, 0)
    assert.equal(JSON.parse(await readFile(generated, "utf8")).operations[0].summary, "Changed in the owned producer fixture")
    assert.equal(run("--check").status, 0)
  } finally { await rm(owned, { recursive: true, force: true }) }
})
