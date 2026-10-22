import { afterAll, expect, it } from "@effect/vitest"
import type { Sandbox } from "@smthrs/sandbox"
import { Cause, Effect, Exit, Stream } from "effect"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initialize, main } from "../../examples/41-sandboxed-flow.ts"

const directory = mkdtempSync(join(tmpdir(), "flows-sandboxed-flow-"))

afterAll(() => rmSync(directory, { recursive: true, force: true }))

it("runs the child's code in a scratch machine and journals it as one action", async () => {
  const filename = join(directory, "engine.sqlite")
  const root = join(directory, "sandboxes")

  const first = await main({ filename, root })

  expect(first.result.output.greeting).toBe("hello, Ada")
  // The child ran where the provider put it: its working directory is the
  // session workspace under `root`, named after the derived session key.
  expect(first.result.output.workdir).toContain("greet-sandboxed-greeting")
  const work = first.result.work
  expect(work?._tag).toBe("Changed")
  expect(work?._tag === "Changed" && work.patch).toContain("diff --git a/greeting.txt b/greeting.txt")
  expect(work?._tag === "Changed" && work.patch).toContain("+hello, Ada")
  expect(first.acquisitions).toBe(1)
  expect(existsSync(filename)).toBe(true)
  expect(readdirSync(root)).toEqual([])

  // The same execution over the same journal answers the recorded result: the
  // action is not dispatched again, so no machine is asked for.
  const second = await main({ filename, root })
  expect(second.result).toEqual(first.result)
  expect(second.acquisitions).toBe(0)
}, 60_000)

it.effect("reports unsuccessful repository initialization as a provider failure", () => {
  const session: Sandbox.Session = {
    id: "faulty",
    remoteId: "faulty",
    workdir: "/sandbox",
    readFile: () => Effect.die("unused"),
    writeFile: () => Effect.die("unused"),
    spawn: () => Effect.succeed({ stdout: Stream.empty, stderr: Stream.empty, exitCode: Effect.succeed(128) })
  }
  return Effect.gen(function*() {
    const result = yield* initialize(session).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(Cause.hasFails(result.cause)).toBe(true)
      expect(Cause.squash(result.cause)).toMatchObject({ code: "spawn_error" })
    }
  })
})
