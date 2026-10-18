import * as Cloudflare from "alchemy/Cloudflare"
import type * as Actor from "./Actor.ts"
import { program, props } from "./ChatApi.ts"
import type { Signed } from "./SignIn.ts"

// ChatApi under `alchemy dev` (alchemy.run.ts picks it only then): the same program with real sign-in once the GitHub
// App's client id and secret are in the environment, and until then a local developer signed in as an Admin, so the
// browser's agent can call the model endpoint on a laptop (docs/features/sign-in.md#local-development). Production
// bundles worker/ChatApi.ts, which never imports this file.

/** The local developer: a person with the Admin role. */
export const localDeveloper: Actor.Actor = { subject: { kind: "person", id: "local-developer" }, role: "admin" }

const fallback: Signed = { actor: localDeveloper, login: "local-developer" }

export default class DevChatApi extends Cloudflare.Worker<DevChatApi>()(
  "ChatApi",
  { ...props, main: "worker/DevChatApi.ts" },
  program({ fallback }),
) {}
