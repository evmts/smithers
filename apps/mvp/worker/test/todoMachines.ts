// Test support: the branches' machines a `todo` run's agent works on, as a test `Machines` service over an in-memory
// working copy of each branch, cloned from the scripted GitHub's branch head on first use. The run's sandbox tools
// reach it as they reach a branch's real machine (worker/flows/TodoAgent.ts); worker/flows/Todo.test.ts and
// evals/todo-steer.eval.ts use it.
import type { SandboxTools } from "@smthrs/sandbox"
import { Effect, Layer } from "effect"
import { Machines } from "../branch/Machines.ts"
import type { ScriptedGitHub } from "../github/test/scriptedGitHub.ts"

/** The machine: one in-memory working copy per branch machine, cloned from the branch's head on GitHub on first use. */
export const machines = (github: ScriptedGitHub, run: (command: string) => number = () => 0) => {
  const copies = new Map<string, { readonly initial: Map<string, string>; readonly files: Map<string, string> }>()
  const calls: Array<{ readonly branchId: string; readonly branch: string; readonly ownerId: string; readonly callId: string; readonly tool: string }> = []
  const service = Machines.of({
    tool: (branch, ownerId, callId, call) =>
      Effect.suspend(() => {
        calls.push({ branchId: branch.branchId, branch: branch.branch, ownerId, callId, tool: call.tool })
        let copy = copies.get(branch.branchId)
        if (copy === undefined) {
          const files = new Map(github.tree(branch.branch))
          copy = { initial: new Map(files), files }
          copies.set(branch.branchId, copy)
        }
        const { initial, files } = copy
        const done = (result: SandboxTools.Result) => Effect.succeed({ result, generation: 1 })
        switch (call.tool) {
          case "write":
            files.set(call.path, call.content)
            return done({ tool: "write", path: call.path, bytes: call.content.length })
          case "read": {
            const content = files.get(call.path)
            if (content === undefined) {
              return Effect.fail({ _tag: "@smthrs/sandbox/SandboxTools/ToolRefused", reason: "not_found" } as never)
            }
            return done({ tool: "read", path: call.path, content, bytes: content.length, truncated: false })
          }
          case "status": {
            const paths = [...new Set([...initial.keys(), ...files.keys()])].sort()
            const entries = paths.flatMap((path) => {
              const before = initial.get(path)
              const after = files.get(path)
              if (before === after) return []
              if (before === undefined) return [{ path, index: "?", worktree: "?" }]
              if (after === undefined) return [{ path, index: " ", worktree: "D" }]
              return [{ path, index: " ", worktree: "M" }]
            })
            return done({ tool: "status", branch: branch.branch, entries })
          }
          case "list": {
            const prefix = call.path === undefined ? "" : `${call.path}/`
            const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
              .filter((name) => !name.includes("/"))
            return done({
              tool: "list",
              path: call.path ?? ".",
              entries: names.map((name) => ({ name, kind: "file" as const, bytes: files.get(`${prefix}${name}`)!.length })),
              truncated: false,
            })
          }
          case "run": {
            const exitCode = run(call.command)
            return done({
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
          case "diff":
            return done({ tool: "diff", diff: "", bytes: 0, truncated: false })
        }
      }),
    sleepIfIdle: () => Effect.die("the todo run never puts a machine to sleep"),
  })
  return { calls, copies, layer: Layer.succeed(Machines, service) }
}

