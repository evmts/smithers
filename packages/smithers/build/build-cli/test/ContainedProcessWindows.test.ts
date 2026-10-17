import * as ScopedProcess from "@smthrs/platform-node/ScopedProcess"
import { Effect, PlatformError, Sink, Stream } from "effect"
import { type ChildProcessHandle, ExitCode, makeHandle, ProcessId } from "effect/process/ChildProcessSpawner"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("@smthrs/platform-node/ScopedProcess", async (original) => ({
  ...await original<typeof import("@smthrs/platform-node/ScopedProcess")>()
}))
import * as ContainedProcess from "../src/internal/ContainedProcess.ts"

const platform = Object.getOwnPropertyDescriptor(process, "platform")!
afterEach(() => {
  Object.defineProperty(process, "platform", platform)
  vi.restoreAllMocks()
})

const fixture = (running: boolean, kill: ChildProcessHandle["kill"]) => {
  Object.defineProperty(process, "platform", { ...platform, value: "win32" })
  const handle = makeHandle({
    pid: ProcessId(12345),
    exitCode: running ? Effect.never : Effect.succeed(ExitCode(0)),
    isRunning: Effect.succeed(running),
    kill,
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void)
  })
  vi.spyOn(ScopedProcess, "spawn").mockReturnValue(Effect.succeed({ ...handle, targetPid: 12345 }))
  return {
    command: "git",
    args: ["literal argument"],
    cwd: "C:\\fixture",
    stdout: () => {},
    stderr: () => {}
  }
}

it("uses the shared Windows process owner and stops descendants after leader exit", async () => {
  const kill = vi.fn(() => Effect.void)
  expect(await ContainedProcess.run(fixture(false, kill))).toBe(0)
  expect(ScopedProcess.spawn).toHaveBeenCalledWith({
    command: "git",
    args: ["literal argument"],
    cwd: "C:\\fixture",
    env: undefined,
    stdin: "ignore",
    killSignal: "SIGTERM",
    forceKillAfter: 5000
  })
  expect(kill).toHaveBeenCalledWith({ killSignal: "SIGTERM", forceKillAfter: 5000 })
})

it("joins the shared Windows process owner on timeout", async () => {
  const kill = vi.fn(() => Effect.void)
  await expect(ContainedProcess.run({ ...fixture(true, kill), timeoutMs: 20 })).rejects.toMatchObject({
    code: "timed_out"
  })
  expect(kill).toHaveBeenCalledWith({ killSignal: "SIGTERM", forceKillAfter: 5000 })
})

it("retains owner failures instead of announcing successful timeout cleanup", async () => {
  const error = PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "ChildProcess",
    method: "kill",
    cause: new Error("owner stop denied")
  })
  await expect(ContainedProcess.run({ ...fixture(true, () => Effect.fail(error)), timeoutMs: 20 })).rejects
    .toMatchObject({ code: "cleanup_failed", cause: error })
})
