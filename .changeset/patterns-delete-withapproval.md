---
"@smthrs/patterns": major
"@smthrs/migrate": patch
---

`WithApproval` is deleted under the approved flows-as-code design (FLOW-10,
sections 4.2 and 7.5). It restated `HumanTask`, and its declaration dropped the
approval flow's authority. Ask a person with `HumanTask` and branch on the answer.

```ts
// Before
WithApproval.withApproval(Deploy, { reason, approval })

// After: in the flow body
Node.branch(
  HumanTask.decode(Schema.Boolean)(
    HumanTask.action.call({ name: "deploy-approval", kind: "confirm", prompt: reason })
  ),
  {
    if: Node.capture({}, (approved) => approved),
    then: Node.capture({}, () => Deploy.call(payload)),
    else: Node.capture({}, () => Node.fail("Deploy denied"))
  }
)
```

Import `HumanTask` from `@smthrs/flow`, `Node` from `@smthrs/plan/Node`, and
`Schema` from `effect/Schema`. `WithApproval.make`, `withApproval`, and
`Options` are deleted. `Approved` moves to `Pattern.Approved`.

`Runbook` and `Intervene` keep their approval options. They call the approval
member with `{ input, reason, scope: "run" }` before the gated flow, without a
decorator that clips the approval member's authority, and the declared gate
fails closed: any answer other than the literal `"approved"` fails the flow
with a `PatternError` (`invalid_input`, `cause.decision`) and the gated step
never runs. Their error schemas also carry each member flow's declared error.
Their runtime forms keep the same denial behavior. Migration mappings use `HumanTask.action` with
`Node.branch` for approvals and `Runbook.make` for runbooks.

Library catalog entry: "Make a durable workflow" (`@smthrs/flow`).

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
