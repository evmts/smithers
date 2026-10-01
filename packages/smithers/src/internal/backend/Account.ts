/** The Account operation bound to authenticated product operation admission.
 * @since 1.0.0
 */

import * as Account from "@smthrs/control/Account"
import { Schema } from "effect"
import { z } from "incur"
import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Refused, UsageError } from "../../CliError.ts"
import type { Client, Values } from "./Client.ts"
import type { Handler } from "./Resources.ts"

const retainedRequest = Schema.Struct({
  requestId: Account.RequestId,
  receipt: Schema.optional(Account.RequestReceipt)
})
const protocol = () =>
  new Refused({ fault: "infra", code: "backend_protocol", message: "Invalid account operation receipt" })
const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(schema: S, value: unknown): S["Type"] => {
  try {
    return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
  } catch {
    throw protocol()
  }
}
/** CLI help derives the operation; transport options reconnect its existing receipt.
 * @private
 * @since 1.0.0
 */
export const declarations = Object.fromEntries(
  Account.accountOperations.map((operation) => [operation.name.replaceAll(".", " "), {
    description: operation.summary,
    args: z.object({}),
    options: z.object({
      request: z.string().optional().describe("Read a request"),
      history: z.boolean().optional().describe("Show requests"),
      cancel: z.boolean().optional().describe("Cancel the selected request")
    })
  }])
)
/** Persist request identifiers only. Remote jobs remain the execution authority.
 * @private
 * @since 1.0.0
 */
export const handlers: Record<string, Handler> = Object.fromEntries(
  Account.accountOperations.map((
    operation
  ) => [operation.name.replaceAll(".", " "), async (client: Client, args: Values, options: Values) => {
    Schema.decodeUnknownSync(operation.input)(args)
    if (options.history && (options.request || options.cancel) || options.cancel && !options.request) {
      throw new UsageError({ message: "Select history or a request; cancellation requires a request" })
    }
    const selected = await client.session.require()
    const ownerOf = (value: typeof selected) =>
      createHash("sha256").update(JSON.stringify([value.api_url, value.source, value.token])).digest("hex")
    const owner = ownerOf(selected)
    const current = async () => {
      if (ownerOf(await client.session.require()) !== owner) {
        throw new Refused({ fault: "user", code: "account_changed", message: "Account changed" })
      }
    }
    const rpc = async (procedure: string, payload: unknown) => {
      await current()
      const answer = await client.request("POST", "/api/workflow/rpc", { procedure, payload }, {
        origin: selected.api_url,
        token: selected.token,
        ...(client.runtime.signal ? { signal: client.runtime.signal } : {})
      })
      await current()
      return answer
    }
    if (options.history) return decode(Account.RequestHistory, await rpc("Operation.History", {}))
    const requestId = options.request === undefined ? randomUUID() : decode(Account.RequestId, options.request)
    const path = join(
      dirname(client.session.authPath),
      "requests",
      owner,
      `${createHash("sha256").update(requestId).digest("hex")}.json`
    )
    let retained: typeof retainedRequest.Type | undefined
    try {
      retained = decode(retainedRequest, JSON.parse(readFileSync(path, "utf8")))
    } catch (error) {
      if (error instanceof SyntaxError) throw protocol()
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
    if (retained && retained.requestId !== requestId) throw protocol()
    const reference = { name: operation.name, requestId }
    const read = async (procedure: "Operation.Cancel" | "Operation.Read") => {
      const outcome = decode(Account.RequestOutcome, await rpc(procedure, reference))
      if (
        outcome.requestId !== requestId || retained?.receipt && outcome.operationId !== retained.receipt.operationId
      ) throw protocol()
      return outcome
    }
    if (options.cancel) return read("Operation.Cancel")
    if (options.request && (!retained || retained.receipt)) return read("Operation.Read")
    // Commit the reconnect identity before admission. A failed/unresolved
    // request retains its ID for the same idempotent admission after reload.
    client.session.write(path, JSON.stringify({ requestId }) + "\n")
    const receipt = decode(Account.RequestReceipt, await rpc("Operation.Dispatch", { ...reference, input: {} }))
    if (receipt.requestId !== requestId) throw protocol()
    client.session.write(path, JSON.stringify({ requestId, receipt }) + "\n")
    return receipt
  }])
)
