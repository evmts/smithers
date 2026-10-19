// A-2/E-4 (D38) and E-7: job-host is a test fixture process. process.argv,
// process.env, its stdout and stderr, the workspace API's async transport
// wrapper and the runner (Effect.runPromise) stay TypeScript, verbatim from
// issue-sweep/test/job-host.ts; job-host.vibe holds the job program.
import * as CloudSandbox from "@smthrs/cli/CloudSandbox"
import { Effect } from "effect"

export const argv: ReadonlyArray<string> = process.argv
export const environment: NodeJS.ProcessEnv = process.env
export const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

/** The workspace API, reporting each failed request and removing a half-created workspace by its exact name. */
export const transportOf = (api: CloudSandbox.WorkspaceApi): CloudSandbox.WorkspaceApi => ({
  sshPrefix: api.sshPrefix,
  request: async (...args) => {
    try {
      return await api.request(...args)
    } catch (cause) {
      const error = cause as { status?: number; code?: string; detail?: { code?: string } }
      process.stderr.write(
        `${JSON.stringify({ method: args[0], status: error.status, code: error.detail?.code ?? error.code })}\n`
      )
      // Creation may be admitted before its response fails. Remove only this
      // test's exact stable name; never clean up another run's workspace.
      if (args[0] === "POST" && args[1].endsWith("/workspaces")) {
        const name = (args[2] as { name: string }).name
        const listed = await api.request("GET", args[1], undefined, AbortSignal.timeout(30_000))
        for (const row of listed as Array<{ id: string; name: string }>) {
          if (row.name === name) {
            await api.request(
              "DELETE",
              `${args[1]}/${encodeURIComponent(row.id)}`,
              undefined,
              AbortSignal.timeout(30_000)
            )
          }
        }
      }
      throw cause
    }
  }
})

export const run = async <E>(host: () => Effect.Effect<void, E>): Promise<void> => {
  await Effect.runPromise(host())
}
