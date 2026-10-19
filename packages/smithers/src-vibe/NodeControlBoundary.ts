// A-2/E-4 (EK1003): the stored-login reader NodeControl.makeConfig hands to
// Application.Config.login is an async function returning a Promise to
// TypeScript callers, so it stays TypeScript, line for line.
import type * as Environment_ from "./Environment.ts"
import { Session } from "./internal/backend/Session.ts"

/** Reads the stored login for `remote` when it is first asked for. */
export const sessionLogin = (environment: Environment_.Source, remote: string) => async () =>
  (await new Session(environment).resolve(new URL(remote).origin))?.token
