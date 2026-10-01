/** The Account operation bound to the existing selected backend client.
 * @since 1.0.0
 */

import * as Account from "@smthrs/control/Account"
import { Schema } from "effect"
import { z } from "incur"
import { Refused } from "../../CliError.ts"
import type { Client, Values } from "./Client.ts"
import type { Handler } from "./Resources.ts"

/** CLI words and help come from the shared declaration. The transport has no positional arguments;
 * the shared schema remains the invocation decoder.
 * @private
 * @since 1.0.0
 */
export const declarations = Object.fromEntries(
  Account.accountOperations.map((operation) => [operation.name.replaceAll(".", " "), {
    description: operation.summary,
    args: z.object({}),
    options: z.object({})
  }])
)

/** Bind only to the selected Session/Client; no operation history or run is manufactured.
 * @private
 * @since 1.0.0
 */
export const handlers: Record<string, Handler> = Object.fromEntries(
  Account.accountOperations.map(
    (operation) => [operation.name.replaceAll(".", " "), async (client: Client, args: Values) => {
      Schema.decodeUnknownSync(operation.input)(args)
      const selected = await client.session.require()
      let disposed = false, request: Account.AccountRequest | undefined
      let result: Account.AccountRead | undefined
      let failure: unknown
      let completion = Promise.resolve()
      const authority: Account.AccountAuthority = {
        state: "signed-in",
        owner: selected.host,
        origin: selected.api_url,
        epoch: 0,
        readsScopes: false
      }
      const controller = Account.createAccountController({
        authority: () => authority,
        disposed: () => disposed,
        boxes: () => [],
        signIn: () => {},
        admit: async (next) => {
          request = next
        },
        pending: () => undefined,
        current: (current) => request?.id === current.id,
        read: async (_request, _facts, signal) => {
          const body = await client.request("GET", "/api/user", undefined, {
            origin: selected.api_url,
            token: selected.token,
            signal
          })
          const facts = Account.identityFacts(body)
          if (facts === undefined) {
            throw new Refused({
              fault: "infra",
              code: "backend_protocol",
              message: "The backend returned an unreadable account."
            })
          }
          const current = await client.session.resolve()
          if (current?.token !== selected.token || current.api_url !== selected.api_url) {
            throw new Refused({
              fault: "user",
              code: "session_expired",
              message: "The selected account changed. Try again."
            })
          }
          return { facts }
        },
        complete: async (_request, answer) => {
          result = answer
        },
        work: async (_request, run) => {
          completion = run().then(() => {}, (error) => {
            failure = error
          })
          await completion
        },
        failed: () => {},
        report: (error) => {
          failure = error
        }
      })
      const cancelled = () => {
        disposed = true
        controller.dispose()
      }
      client.runtime.signal?.addEventListener("abort", cancelled, { once: true })
      try {
        client.runtime.signal?.throwIfAborted()
        await controller.showAccount()
        await completion
        client.runtime.signal?.throwIfAborted()
        if (failure !== undefined) throw failure
        if (result === undefined || "error" in result) {
          throw new Refused({
            fault: "infra",
            code: "backend_protocol",
            message: "The backend returned an unreadable account."
          })
        }
        return { login: result.facts.login }
      } finally {
        client.runtime.signal?.removeEventListener("abort", cancelled)
        disposed = true
        controller.dispose()
      }
    }]
  )
)
