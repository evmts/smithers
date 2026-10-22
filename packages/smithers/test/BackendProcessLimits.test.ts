import { expect, it } from "vitest"
import { run, spawn } from "../src/internal/backend/Process.ts"

const env = { PATH: process.env.PATH }

it.each(["pipe", "inherit"] as const)("rejects an already cancelled %s command", async (stdio) => {
  const controller = new AbortController()
  controller.abort()
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
    env,
    stdio,
    signal: controller.signal
  })
  child.stdout?.resume()
  child.stderr?.resume()
  await expect(child.exited).rejects.toMatchObject({ code: "cancelled" })
})

it("rejects overflow before an endless producer finishes", async () => {
  await expect(run(process.execPath, ["-e", "for (;;) require('node:fs').writeSync(1, Buffer.alloc(65536))"], {
    env,
    timeoutMs: 3000,
    maxBytes: 1024
  })).rejects.toMatchObject({ code: "tool_output_too_large" })
}, 15000)

it("removes backpressure listeners after every drain", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "for (let i = 0; i < 64; i++) require('node:fs').writeSync(1, Buffer.alloc(65536))"
  ], {
    env,
    stdio: "pipe"
  })
  child.stderr!.resume()
  let bytes = 0, maximum = 0
  for await (const chunk of child.stdout!) {
    bytes += chunk.length
    maximum = Math.max(maximum, child.stdout!.listenerCount("close"), child.stdout!.listenerCount("error"))
  }
  expect(await child.exited).toBe(0)
  expect(bytes).toBe(64 * 65536)
  expect(maximum).toBeLessThanOrEqual(2)
  expect(child.stdout!.listenerCount("close")).toBeLessThanOrEqual(1)
  expect(child.stdout!.listenerCount("error")).toBeLessThanOrEqual(1)
})

it.each([1, 2])("bounds file descriptor %i and accepts exactly maxBytes", async (descriptor) => {
  const script = (bytes: number) => `require('node:fs').writeSync(${descriptor}, Buffer.alloc(${bytes}, 120))`
  const result = await run(process.execPath, ["-e", script(1024)], { env, timeoutMs: 10000, maxBytes: 1024 })
  expect(result.code).toBe(0)
  expect(descriptor === 1 ? result.stdout : result.stderr).toBe("x".repeat(1024))
  await expect(run(process.execPath, ["-e", script(1025)], { env, timeoutMs: 10000, maxBytes: 1024 }))
    .rejects.toMatchObject({ code: "tool_output_too_large" })
})
