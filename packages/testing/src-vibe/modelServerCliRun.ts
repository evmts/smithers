// A-2, E-5 (D38): `run` is a runner boundary that returns a Promise to the
// `smthrs-model-server` bin script (Effect.runSync, runPromise), so it stays
// in TypeScript.
import { Effect, Exit, Scope } from "effect"
import { type Io, parse, serve } from "./ModelServerCli.vibe"

export const run = async (
  argv: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>>,
  io: Io
): Promise<void> => {
  const config = parse(argv, env)
  const scope = Effect.runSync(Scope.make())
  try {
    const server = await Effect.runPromise(Scope.provide(serve(config), scope))
    io.print(JSON.stringify({ url: server.url }))
    await io.stopped
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
}
