import { type CliError, Gc, Output } from "@smthrs/cli"
import { Effect } from "effect"

/**
 * Renders one command result in both forms the CLI prints: compact JSON for
 * scripts and indented text for people.
 *
 * @returns The JSON text, the human text, and the process status.
 * @since 1.0.0
 */
export const renderReport = (): Effect.Effect<
  { readonly json: string; readonly human: string; readonly exitCode: number },
  CliError.RenderingError
> =>
  Effect.gen(function*() {
    const output = Output.make()
    const report = { runs: ["run-1", "run-2"], dryRun: true, olderThan: Gc.defaultRetention }
    const json = yield* output.render(report, "json")
    const human = yield* output.render(report, "human")
    return { json: json.text, human: human.text, exitCode: json.exitCode }
  })

/**
 * Shows the renderer refusing a value it would have to execute, and returns
 * the stable code and path a caller can branch on.
 *
 * @returns The refusal code and the path of the offending member.
 * @since 1.0.0
 */
export const renderRefusal = (): Effect.Effect<{ readonly code: string; readonly path: string }> =>
  Output.make().render({ status: "ok", onDone: () => undefined }, "json").pipe(
    Effect.map(() => ({ code: "rendered", path: "$" })),
    Effect.catch((error) => Effect.succeed({ code: error.code, path: error.path }))
  )

/**
 * Reads a retention window the way `smthrs gc --older-than` does.
 *
 * @param spelling - A window such as `30d`, `12h`, or `90m`.
 * @returns The window in milliseconds, or `undefined` for a spelling `gc` refuses.
 * @since 1.0.0
 */
export const retentionWindow = (spelling: string): number | undefined => Gc.duration(spelling)
