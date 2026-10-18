---
"@smthrs/model": minor
---

`ModelProxy.serve` mints its own `invocationId` for every call it admits and
passes it to `onEnd` beside the caller's `requestId`. Key metering on
`invocationId`: a caller chooses `x-smithers-request-id` and may send one id on
any number of calls, so a host that recorded spend once per request id let a
caller spend without counting. The server span carries it as
`smithers.model.proxy.invocation_id`, and the server's log line as
`invocationId`.

```ts
ModelProxy.serve({
  prepare,
  onEnd: ({ invocationId, requestId, usage }) => recordSpend({ key: invocationId, requestId, usage })
})
```
