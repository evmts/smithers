/**
 * `release/homebrew-publish` through the flow API: the real graph, the real layer and a
 * real child process running `homebrew-publish.mjs`.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer } from "effect"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"
import Step, { argv, layer, type Request } from "./flow.ts"

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
  assert.match(failure, /flows\/release\/homebrew-publish\\.mjs/)
}

/** Runs `body` with `env` set (undefined unsets), restoring the previous values after. */
const withEnv = async <A>(env: Record<string, string | undefined>, body: () => Promise<A>) => {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  const assign = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  assign(env)
  try {
    return await body()
  } finally {
    assign(previous)
  }
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
  assert.deepEqual(argv({ command: "assets", directory: "assets", tag: "v1.0.0" }), ["assets", "assets", "v1.0.0"])
  assert.deepEqual(argv({ command: "tap", directory: "assets", tag: "v1.0.0" }), ["tap", "assets", "v1.0.0"])
})

// Writes to real GitHub repositories are forbidden in tests: the child answers
// GitHub from a preloaded stub that reports no check runs, so qualification is
// absent and the module must refuse before any write.
test("publication without the authenticated qualification is refused", async () => {
  await inTemporary(async (directory) => {
    const stub = join(directory, "fetch.mjs")
    writeFileSync(
      stub,
      [
        "import cp from \"node:child_process\"",
        "import { syncBuiltinESMExports } from \"node:module\"",
        `cp.execFileSync = (cmd, args) => args[0] === "rev-parse" ? "${"a".repeat(40)}\\n" : ""`,
        "syncBuiltinESMExports()",
        "globalThis.fetch = async (url, options) => {",
        "  if (options?.method && options.method !== \"GET\") throw new Error(\"unexpected mutation\")",
        "  return Response.json({ check_runs: [] })",
        "}"
      ].join("\n")
    )
    const env = {
      NODE_OPTIONS: `--import=${pathToFileURL(stub).href}`,
      GITHUB_TOKEN: "release-flow-secret",
      RELEASE_QUALIFICATION_TOKEN: "release-flow-secret",
      RELEASE_QUALIFICATION_APP_ID: "42"
    }
    const exit = await withEnv(env, () => run({ command: "tap", directory, tag: "v1.2.3" }, "release-homebrew-tap"))
    assertModuleFailed(exit)
    assert.doesNotMatch(JSON.stringify(Exit.isFailure(exit) ? exit.cause : undefined), /release-flow-secret/)
  })
})
