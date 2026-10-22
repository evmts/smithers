import type { ControlRpcs } from "@smthrs/control"
import type { Rpc, RpcGroup } from "effect/rpc"
import { postApiWorkflowRpc, type Transport } from "../../src/internal/backend/ProductApi.ts"

declare const transport: Transport
// @ts-expect-error A procedure and payload are required.
postApiWorkflowRpc(transport)
// @ts-expect-error A JSON scalar is not a workflow call.
postApiWorkflowRpc(transport, { body: 1 })
// @ts-expect-error The relay does not serve arbitrary procedures.
postApiWorkflowRpc(transport, { body: { repo: "o/r", workspaceId: "w", procedure: "Missing", payload: {} } })
// @ts-expect-error Run requires a tagged plan or run target.
postApiWorkflowRpc(transport, { body: { repo: "o/r", workspaceId: "w", procedure: "Run", payload: {} } })
// @ts-expect-error Streaming procedures use the separately authenticated stream mount.
postApiWorkflowRpc(transport, { body: { repo: "o/r", workspaceId: "w", procedure: "Watch", payload: {} } })

type ListRpc = Extract<RpcGroup.Rpcs<typeof ControlRpcs.ControlRpcs>, { readonly _tag: "List" }>
const result = postApiWorkflowRpc(transport, {
  body: { repo: "o/r", workspaceId: "w", procedure: "List", payload: { _tag: "flows" } }
})
result.then((response) => {
  if (response.ok) {
    const payload: Rpc.SuccessEncoded<ListRpc> = response.payload
    return payload
  }
  return undefined
})
