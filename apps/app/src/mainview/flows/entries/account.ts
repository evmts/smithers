/* The shared Account operation bound to the GUI controller. */
import { accountOperations } from "@smthrs/ui/app-operations/account"
import { bind } from "./Declare"
import type { FlowEntry, Namespace } from "../registry"
import type { CommandActions } from "./Declare"

/** The `account` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "account", label: "Account", summary: "Who is signed in and what Smithers knows about them" }

/** The Account chrome button and slash door read the same controller facts. */
export const accountFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> =>
  bind(accountOperations, { "account.show": () => actions.showAccount() })
