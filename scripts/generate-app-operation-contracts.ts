/** Project the authoritative Account declaration and wire schemas for its Go host.
 * @since 1.0.0
 */
import { Schema } from "effect"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import * as Account from "../packages/smithers/control/src/Account.ts"

const path = fileURLToPath(new URL("../packages/backend/appoperation/account.generated.json", import.meta.url))
const schema = (value: Schema.Constraint) => Schema.toJsonSchemaDocument(value, { onExcessProperty: "error" }).schema
const output = JSON.stringify({
  version: 1,
  operations: Account.accountOperations.map((declaration) => {
    const { input, ...metadata } = declaration
    return {
      ...metadata,
      input: schema(input),
      userOnly: "userOnly" in declaration ? declaration.userOnly : false,
      confirm: "confirm" in declaration ? declaration.confirm : null
    }
  }),
  schemas: {
    invocation: schema(Account.Invocation),
    reference: schema(Account.RequestReference),
    noInput: schema(Account.NoInput),
    identity: schema(Account.Identity),
    receipt: schema(Account.RequestReceipt),
    outcome: schema(Account.RequestOutcome),
    history: schema(Account.RequestHistory)
  }
}, (_key, value) => {
  if (typeof value === "function") throw new Error("Account host metadata must have a serializable port contract")
  return value
}, 2) + "\n"
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Account operation contracts are stale")
} else await writeFile(path, output)
