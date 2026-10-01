/** Shared declarations, with this presentation host's existing form hints. */
import * as Shared from "@smthrs/control/Operation"
import type { FormHints } from "../flow-form"
export type { OperationPayload } from "@smthrs/control/Operation"
export { NoInput } from "@smthrs/control/Operation"
export type OperationMetadata<Capability extends string = string, Host extends string = string> = Shared.OperationMetadata<Capability, Host, FormHints>
export type Operation<I extends Shared.OperationPayload = Shared.OperationPayload, Capability extends string = string, Host extends string = string> = Shared.Operation<I, Capability, Host, FormHints>
/** The same declaration factory; only the host's form-hint type is specialized. */
export const operation: <const O extends Operation>(declared: O) => O = Shared.operation
