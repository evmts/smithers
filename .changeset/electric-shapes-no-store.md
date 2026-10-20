---
"@smthrs/effect-electric": minor
---

Shapes the server decides per request: no caching by default, refusals in
place of a narrower shape, and a secret that stays out of URLs.

- **No caching by default.** Electric marks a shape's first response
  `public, max-age=604800`, and the browser's URL doesn't name the person, so
  a shape whose rows depend on the session could come back from the browser's
  HTTP cache for the next person, or after sign-out. `ShapeProxy.make` takes
  `cache`. The default, `"no-store"`, drops Electric's `cache-control`, `etag`,
  `surrogate-control`, `cdn-cache-control` and `expires`, and every response,
  a 405 or 502 included, says `cache-control: private, no-store`. `"public"`
  passes Electric's caching headers through; use it only for a shape that is
  the same for everyone and served without a session check.
  `ShapeSource.fetchSource` sends every request with `cache: "no-store"`, so
  the HTTP cache never answers one, a response cached before this change
  included. In a Cloudflare Worker that needs a compatibility date of
  2024-11-11 or later.
- **A shape decided per request.** `shape` can be an Effect that fails with
  the new `ShapeProxy.Refused` (`401`, `403` or `503`, with an optional
  `retryAfter`). The proxy answers the refusal with
  `cache-control: private, no-store` and records it like any request, without
  calling Electric. Refuse rather than serve a narrower shape under the same
  URL: a `where` that changes under a device's `handle` makes Electric answer
  `409 must-refetch`, which empties the device's copy. `Options` and `make`
  take the Effect's requirements as `R`.
- **The secret as a bearer token.** `Connection.secretAs` (`ELECTRIC_SECRET_AS`
  in `ShapeProxy.config`) is `"parameter"`, Electric's `secret` query
  parameter and the default, or `"bearer"`: `authorization: Bearer <secret>`,
  for an Electric behind your own gateway, so the secret is in no URL a
  platform logs or traces.

```ts
ShapeProxy.make({
  ...connection,
  secretAs: "bearer",
  shape: Effect.map(
    whoIsAsking.pipe(Effect.mapError(() => new ShapeProxy.Refused({ status: 503, retryAfter: 5 }))),
    (person) => ({ table: "runs", where: "owner = $1", params: { "1": person.id } })
  )
})
```
