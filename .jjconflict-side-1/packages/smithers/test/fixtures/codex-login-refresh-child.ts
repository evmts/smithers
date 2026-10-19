/** One Smithers process signing with a shared Codex login, asking the `codex` in the given directory to refresh it. */
import { Effect } from "effect"
import { dirname } from "node:path"
import * as CodexLogin from "../../src/internal/CodexLogin.ts"

const [file, bin] = process.argv.slice(2)
if (file === undefined || bin === undefined) throw new Error("expected the login file and the codex directory")

const environment = { PATH: bin, CODEX_HOME: dirname(file), HOME: dirname(file) }
const headers = await Effect.runPromise(
  CodexLogin.make({ file, refresh: CodexLogin.cliRefresh({ environment }) }).auth.sign({})
)
process.stdout.write(`${JSON.stringify(headers)}\n`)
