// Test support: the commands of a test `Machines` (`SandboxCommand.Commands`), for the flows that run a command as a
// `sandbox/Command` job (worker/flows/SandboxCommand.ts). A test whose machine runs real processes uses
// worker/test/box.ts with `Machine.command`; these stand in where the machine itself is in memory.
import { type SandboxCommand, SandboxTools } from "@smthrs/sandbox"
import { Effect } from "effect"

/** The commands of a machine a test never runs a command on: each operation dies. */
export const noCommands: SandboxCommand.Commands = {
  start: () => Effect.die("this test runs no command"),
  observe: () => Effect.die("this test runs no command"),
  collect: () => Effect.die("this test runs no command"),
  cancel: () => Effect.die("this test runs no command"),
}

/**
 * Commands that finish as they start: `run(command)` is the exit code, `started` hears each key the first time it
 * starts, and a key starts once however often it is asked. A key never started observes `lost` and collects `ToolLost`.
 * `results` is the machine's record of its commands, shared by every `Commands` asked of the same machine.
 */
export const instantCommands = (
  run: (command: string) => number,
  started: (key: string, call: typeof SandboxTools.Run.Type) => void = () => {},
  results = new Map<string, typeof SandboxTools.RunResult.Type>(),
): SandboxCommand.Commands => {
  return {
    start: (call, key) =>
      Effect.sync(() => {
        if (!results.has(key)) {
          started(key, call)
          const exitCode = run(call.command)
          results.set(key, {
            tool: "run",
            exitCode,
            timedOut: false,
            stdout: "",
            stderr: "",
            stdoutBytes: 0,
            stderrBytes: 0,
            truncated: false,
          })
        }
        return { pid: 2, startedAt: 1 }
      }),
    observe: (key) =>
      Effect.sync(() => {
        const result = results.get(key)
        return result === undefined
          ? { state: "lost" as const }
          : { state: "finished" as const, exitCode: result.exitCode, timedOut: false }
      }),
    collect: (key) =>
      Effect.suspend(() => {
        const result = results.get(key)
        return result === undefined ? Effect.fail(new SandboxTools.ToolLost()) : Effect.succeed(result)
      }),
    cancel: () => Effect.void,
  }
}
