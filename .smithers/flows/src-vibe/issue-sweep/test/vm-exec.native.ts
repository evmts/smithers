// A-2/E-4 (D38) and E-7: vm-exec is a command-line script. Its runner
// (Effect.runPromise), process.argv, process.pid and the process's output and
// exit code stay TypeScript, verbatim from issue-sweep/test/vm-exec.ts;
// vm-exec.vibe hands it the scoped program.
import { Effect } from "effect"

export const run = async <E>(
  exec: (line: string, pid: number) => Effect.Effect<{ readonly stdout: string; readonly stderr: string; readonly code: number }, E>
): Promise<void> => {
  const line = process.argv[2] ?? "true"
  const ran = await Effect.runPromise(exec(line, process.pid))
  process.stdout.write(ran.stdout)
  process.stderr.write(ran.stderr)
  process.exitCode = ran.code
}
