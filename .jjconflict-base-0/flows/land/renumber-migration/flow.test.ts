/**
 * `land/renumber-migration` through the flow API: the real graph, the real
 * layer and a real child process running `renumber-migration.mjs` in a scratch
 * checkout built by `migration-fixture.mjs`, with the pinned sqlc and Go.
 *
 * The module refuses a home that holds the issue-claim credential store, so
 * each case runs it under an empty scratch home.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer } from "effect"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { installMigrationFixture, registry } from "../migration-fixture.mjs"
import Renumber, { argv, env, layer, Request } from "./flow.ts"

const run = (payload: typeof Request.Type, executionId: string) =>
  Effect.runPromiseExit(
    Renumber.execute(payload, { executionId }).pipe(
      Effect.provide(
        Interpreter.layerWithImplementations(Renumber, layer).pipe(
          Layer.provideMerge(FlowEngine.layerMemory),
          Layer.provideMerge(NodeCrypto.layer)
        )
      )
    )
  )

const product = "packages/backend/db/product"
const reserved = `${product}/migrations/0009_reserved.sql`

// A committed checkout whose origin/main is HEAD, entered under a scratch home.
// The Go build cache stays the host's, so the scratch home does not rebuild it.
const inCheckout = async <A>(install: boolean, body: (root: string) => Promise<A>) => {
  const root = mkdtempSync(join(tmpdir(), "renumber-migration-"))
  const git = (...args: Array<string>) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  const previous = { cwd: process.cwd(), HOME: process.env.HOME, GOCACHE: process.env.GOCACHE }
  const goCache = execFileSync("go", ["env", "GOCACHE"], { encoding: "utf8" }).trim()
  try {
    if (install) installMigrationFixture(root)
    else writeFileSync(join(root, "notes.sql"), "SELECT 1;\n")
    git("init", "-q", "-b", "main")
    git("config", "user.name", "Fixture")
    git("config", "user.email", "fixture@example.invalid")
    git("add", ".")
    git("commit", "-q", "-m", "baseline")
    git("update-ref", "refs/remotes/origin/main", "HEAD")
    process.env.HOME = join(root, ".git/test-home")
    process.env.GOCACHE = goCache
    process.chdir(root)
    return await body(root)
  } finally {
    process.chdir(previous.cwd)
    for (const key of ["HOME", "GOCACHE"] as const) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    rmSync(root, { recursive: true, force: true })
  }
}

test("the payload maps to the module's argument array and ticket environment", () => {
  assert.deepEqual(argv({ file: reserved }), [reserved])
  assert.deepEqual(env({ file: reserved }), {})
  assert.deepEqual(env({ file: reserved, ticket: "T-TEST-01" }), { SMITHERS_MIGRATION_TICKET: "T-TEST-01" })
})

test("a file outside the product migrations is refused by the module, as a typed failure", async () => {
  await inCheckout(false, async (root) => {
    const exit = await run({ file: "notes.sql" }, "renumber-migration-refused")
    assert.ok(Exit.isFailure(exit))
    const failure = JSON.stringify(exit.cause)
    assert.match(failure, /automation\/ModuleFailed/)
    assert.match(failure, /flows\/land\/renumber-migration\.mjs/)
    assert.match(failure, /"exitCode":1/)
    assert.equal(readFileSync(join(root, "notes.sql"), "utf8"), "SELECT 1;\n")
  })
})

test("a reserved migration takes the next number on origin/main and its ticket's table", async () => {
  await inCheckout(true, async (root) => {
    writeFileSync(join(root, reserved), "CREATE TABLE reserved(id bigint PRIMARY KEY);\n")
    writeFileSync(join(root, product, "migrate.go"), registry(`{9, "migrations/0009_reserved.sql"},`))
    writeFileSync(
      join(root, "packages/backend/db/ownership.csv"),
      "table,target_owner,status\nthings,product,installed\nreserved,product,planned:T-TEST-01;owner:smithers-8a\n"
    )
    const exit = await run({ file: reserved, ticket: "T-TEST-01" }, "renumber-migration-success")
    assert.ok(Exit.isSuccess(exit), JSON.stringify(Exit.isFailure(exit) ? exit.cause : undefined))
    assert.ok(!existsSync(join(root, reserved)))
    assert.equal(
      readFileSync(join(root, product, "migrations/0002_reserved.sql"), "utf8"),
      "CREATE TABLE reserved(id bigint PRIMARY KEY);\n"
    )
    assert.match(readFileSync(join(root, product, "migrate.go"), "utf8"), /\{2, "migrations\/0002_reserved.sql"\}/)
    assert.match(
      readFileSync(join(root, "packages/backend/db/ownership.csv"), "utf8"),
      /reserved,product,product migration 0002;owner:smithers-8a\n$/
    )
    assert.match(readFileSync(join(root, "packages/backend/internal/db/models.go"), "utf8"), /type Reserved struct/)
  })
})
