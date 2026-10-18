---
"@smthrs/model": minor
---

`ModelProxy.serve` hands `prepare` a second argument, an `Admission`:
`{ requestId, invocationId, requestBytes }`. `invocationId` is the same
server-minted id `onEnd` later reports, so a host can reserve a call's worst
case against a budget before the model runs and settle it when the call ends,
under one key. A budget read before the call and recorded after it let
concurrent calls all pass the read and overshoot without bound.
`requestBytes` bounds the prompt: a byte-level tokenizer never yields more
tokens than bytes. Existing one-argument `prepare` functions still type-check.

```ts
ModelProxy.serve({
  prepare: (request, { invocationId, requestBytes }) =>
    reserve({ key: invocationId, tokens: requestBytes + maxTokens }).pipe(Effect.as({ model, request })),
  maxBodyBytes: 64 * 1024,
  onEnd: ({ invocationId, usage }) => settle({ key: invocationId, usage })
})
```
