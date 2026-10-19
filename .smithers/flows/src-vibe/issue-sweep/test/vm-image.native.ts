// A-2/E-4 (D38) and E-7: vm-image is a command-line script. Its runner
// (Effect.runPromise), process.argv, execFileSync, the clock and stdout stay
// TypeScript, verbatim from issue-sweep/test/vm-image.ts; vm-image.vibe hands
// it the image build.
import { Effect } from "effect"
import { execFileSync } from "node:child_process"

export const run = async <E>(buildImage: (revision: string) => Effect.Effect<string, E>): Promise<void> => {
  const revision = process.argv[2] ??
    execFileSync("gh", ["api", "repos/smithersai/smithers/commits/main", "--jq", ".sha"], { encoding: "utf8" }).trim()
  const started = Date.now()
  const snapshot = await Effect.runPromise(buildImage(revision))
  process.stdout.write(`${JSON.stringify({ snapshot, revision, seconds: (Date.now() - started) / 1000 })}\n`)
}
