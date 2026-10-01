/** The Account read, declared independently of the host that presents it. */
import { NoInput, operation } from "./index"

/** Account operations in registration order. */
export const accountOperations = [
  operation({
    /*
     * Signed out, the read presents the sign-in step instead of an empty
     * account. It therefore requires the identity capability, not a signed-in
     * session, and remains callable by both the human and the model.
     */
    name: "account.show",
    summary: "Show account",
    runtime: ["identity"],
    input: NoInput
  })
] as const
