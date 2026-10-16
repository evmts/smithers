/**
 * Embeds the CLI in a host program: serves `smithers-build owners` against a
 * workspace with injected terminals and an exit hook, then reads the JSON
 * answer instead of a process's output. This is the "Embed the CLI in
 * another program" guide's first section; `test/examples.test.ts` runs it.
 */
import { makeCli } from "@smthrs/build-cli"
import type * as Reporter from "@smthrs/build-cli/Reporter"

/** One changed path and the package and approvers it lands on. */
export interface Ownership {
  readonly path: string
  readonly package: string
  readonly approvers: ReadonlyArray<string>
}

interface OwnersJson {
  readonly touched_paths: ReadonlyArray<{
    readonly path: string
    readonly package: string
    readonly owners: ReadonlyArray<{ readonly login?: string; readonly team?: string; readonly role: string }>
  }>
}

/**
 * Asks the workspace at `workspace` who must approve a change to `paths`.
 * Rejects with the CLI's own output when the command exits non-zero.
 */
export const whoOwns = async (workspace: string, paths: ReadonlyArray<string>): Promise<ReadonlyArray<Ownership>> => {
  let output = ""
  let logs = ""
  let exitCode = 0
  // A terminal that is not a TTY keeps every renderer plain.
  const terminal = (write: (text: string) => void): Reporter.Terminal => ({ write, isTTY: false, columns: 80 })

  await makeCli({
    stdout: terminal((text) => {
      output += text
    }),
    stderr: terminal((text) => {
      logs += text
    })
  }).serve(["owners", ...paths, "--format", "json", "--workspace", workspace], {
    exit: (code) => {
      exitCode = code
    },
    stdout: (text) => {
      output += text
    }
  })

  if (exitCode !== 0) throw new Error(`owners exited ${exitCode}: ${output}${logs}`)
  const answer = JSON.parse(output) as OwnersJson
  return answer.touched_paths.map((entry) => ({
    path: entry.path,
    package: entry.package,
    approvers: entry.owners
      .filter((owner) => owner.role === "approve")
      .map((owner) => owner.login ?? `team:${owner.team}`)
  }))
}
