/**
 * `release/homebrew` through the flow API: the real graph, the real layer and a
 * real child process running `homebrew-release.mjs`.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer } from "effect"
import { Schema } from "effect"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import Step, { argv, layer, Request } from "./flow.ts"

const run = (payload: typeof Request.Type, executionId: string) =>
  Effect.runPromiseExit(
    Step.execute(payload, { executionId }).pipe(
      Effect.provide(
        Interpreter.layerWithImplementations(Step, layer).pipe(
          Layer.provideMerge(FlowEngine.layerMemory),
          Layer.provideMerge(NodeCrypto.layer)
        )
      )
    )
  )

/** The run failed as the module's typed exit, naming the module and nothing it printed. */
const assertModuleFailed = (exit: Exit.Exit<void, unknown>) => {
  assert.ok(Exit.isFailure(exit))
  const failure = JSON.stringify(exit.cause)
  assert.match(failure, /automation\/ModuleFailed/)
  assert.match(failure, /flows\/release\/homebrew-release\.mjs/)
}

/** Runs `body` in a fresh temporary directory, removed after. */
const inTemporary = async <A>(body: (directory: string) => Promise<A>) => {
  const directory = mkdtempSync(join(tmpdir(), "release-flow-"))
  try {
    return await body(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("the payload maps to the module's argument array", () => {
  assert.deepEqual(argv({ command: "normalize-bottle", directory: "assets" }), ["normalize-bottle", "assets"])
  assert.deepEqual(argv({ command: "prepare", directory: "assets", tag: "v1.0.0", root: "file:///assets" }), [
    "prepare",
    "assets",
    "v1.0.0",
    "file:///assets"
  ])
  assert.deepEqual(argv({ command: "qualify", directory: "assets", tag: "v1.0.0" }), ["qualify", "assets", "v1.0.0"])
})

test("prepare and qualify need the tag, and only prepare takes a root", () => {
  const decode = Schema.decodeUnknownExit(Request)
  assert.ok(Exit.isFailure(decode({ command: "qualify", directory: "assets" })))
  assert.ok(Exit.isFailure(decode({ command: "qualify", directory: "assets", tag: "v1", root: "file:///x" })))
})

const bottle = (directory: string, bytes: Buffer, digestOf: Buffer) => {
  const local = "smithers--1.2.3.arm64_sequoia.bottle.tar.gz"
  const filename = "smithers-1.2.3.arm64_sequoia.bottle.tar.gz"
  const sha256 = createHash("sha256").update(digestOf).digest("hex")
  const tags = { arm64_sequoia: { local_filename: local, filename, sha256 } }
  writeFileSync(join(directory, "smithers.bottle.json"), JSON.stringify({ smithers: { bottle: { tags } } }))
  writeFileSync(join(directory, local), bytes)
  return filename
}

test("normalize-bottle renames a bottle whose bytes match its digest", async () => {
  await inTemporary(async (directory) => {
    const bytes = Buffer.from("bottle fixture")
    const filename = bottle(directory, bytes, bytes)
    const exit = await run({ command: "normalize-bottle", directory }, "release-homebrew-bottle")
    assert.ok(Exit.isSuccess(exit), JSON.stringify(Exit.isFailure(exit) ? exit.cause : undefined))
    assert.deepEqual(readFileSync(join(directory, filename)), bytes)
  })
})

test("normalize-bottle refuses corrupt bytes as a typed failure", async () => {
  await inTemporary(async (directory) => {
    bottle(directory, Buffer.from("changed"), Buffer.from("bottle fixture"))
    assertModuleFailed(await run({ command: "normalize-bottle", directory }, "release-homebrew-corrupt"))
  })
})
