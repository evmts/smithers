---
"@smthrs/platform-browser": minor
---

`BrowserEngine`'s `start`, `result`, `cancel` and `signal` take a
`BrowserEngine.FlowReference`: a flow's `_tag` and its payload, success and
error schemas. A whole flow is still one. A tab can run a flow whose steps
import code the tab must not load, such as an agent, by holding only its
reference; the engine worker imports the whole flow.

```ts
const AnswerReference = {
  _tag: "chat/Answer",
  payloadSchema: Schema.Struct({ answerId: Schema.String }),
  successSchema: Schema.Struct({ status: Schema.Literals(["done", "failed"]) }),
  errorSchema: Schema.Never
} as const satisfies BrowserEngine.FlowReference

yield* engine.start(AnswerReference, { executionId, payload: { answerId } })
```
