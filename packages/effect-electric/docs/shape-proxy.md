---
title: "Proxy Electric shapes through your server"
description: "Serve a browser's Electric shape requests from your own route with ShapeProxy.make: a host-chosen table, a parameter allowlist that drops subset requests, Electric's secret added on the server, and one log line per request."
---

A browser that syncs with Electric should not call Electric directly. Electric's
URL and secret would reach the browser, and the browser would choose which
table, rows and columns it reads. `ShapeProxy.make` puts your server in between:
the browser sends Electric's own shape requests to your route, and the proxy
forwards what the protocol needs, with the shape and credentials your server
chose.

## Mount it

`make` returns an `effect/http` handler for one shape. It requires the
`HttpServerRequest` it answers and an `HttpClient` to call Electric with:

```ts
import { ShapeProxy } from "@smthrs/effect-electric"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpEffect from "effect/http/HttpEffect"

const program = Effect.gen(function*() {
  const connection = yield* ShapeProxy.config({ url: "http://localhost:30001" })
  return HttpEffect.toWebHandler(
    ShapeProxy.make({ ...connection, shape: { table: "items" } }).pipe(Effect.provide(FetchHttpClient.layer))
  )
})
```

Point the client's shape URL at the route that serves the handler, for example
`GET /api/shapes/items`.

`ShapeProxy.config` reads three variables with Effect `Config`:

| Variable             | Use                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `ELECTRIC_URL`       | Electric's origin. The proxy calls its `/v1/shape`. Required unless you pass `url` as the default. |
| `ELECTRIC_SECRET`    | Electric's secret, read as a redacted value and sent as `secret`. Optional.                        |
| `ELECTRIC_SOURCE_ID` | Electric Cloud's source id, sent as `source_id`. Optional.                                         |

You can also pass `url`, `secret` (a `Redacted` string) and `sourceId` to `make`
directly.

## What reaches Electric

The proxy builds every upstream request itself, in this order:

1. The Electric client's protocol parameters, in the order the browser sent
   them, the first value of each: `offset`, `handle`, `live`, `live_sse`,
   `experimental_live_sse`, `cursor`, `expired_handle`, `log` and
   `cache-buster`.
2. The host's shape: `table`, then `where` and its `params` when `shape` sets
   them, as `params[1]`, `params[2]` and so on, then `columns`, comma-separated,
   when `shape` lists them.
3. `secret` and `source_id`, when the connection has them.

Every other parameter the browser sends is dropped, including `table`,
`where`, `params`, `columns`, `replica`, `secret`, `source_id` and every
subset request's `subset__*` (`subset__where`, `subset__params`,
`subset__order_by`, `subset__limit`, `subset__offset`, `subset__where_expr`,
`subset__order_by_expr`). A browser can follow the shape, but it can't change
it or read part of it: `ElectricCollection` syncs whole shapes and sends no
subset requests, and a client that sends one gets the whole shape.

Electric's status, headers and body stream back. `content-encoding` and
`content-length` are dropped, because `fetch` has already decoded the body, and
so is every `access-control-*` header, because the proxy serves the browser's
own origin.

## Refusals

A request the proxy refuses never reaches Electric:

| Request                   | Status                 | Body |
| ------------------------- | ---------------------- | ---- |
| A method other than `GET` | 405, with `allow: GET` | none |

When Electric can't be reached, the proxy answers 502.

## What it records

The proxy records with plain Effect, so the host's own logger, tracer and
metric exporters pick up the records. None of them carries the secret, a where
clause or a parameter value.

- **Span.** One server span per request, named `name` (default
  `electric.shape`), with `http.response.status_code` and
  `electric.shape.live`. The `HttpClient` adds its own client span for the call to
  Electric, with `secret=REDACTED` in `url.full`.
- **Log line.** One line per request, once its body has ended, with the message
  `name` and the annotations `status`, `live`, `durationMs`, `bytes` and
  `outcome`. `outcome` is `complete`, `aborted`
  (the browser went away: status 499 before Electric answered, else mid-body)
  or `failed` (Electric's body broke off). The level is Error for a 5xx or a
  failed body, Warn for another 4xx, and Info otherwise, an aborted request
  included.
- **Count.** One count on `metric`, by `status` and `live` as strings. The
  default is `ShapeProxy.defaultMetric`, `electric_shape_requests`.

## Limits

- **The shape is the read boundary.** A browser reads the whole shape. To keep
  a browser to some rows, set `shape.where` and `shape.params` on the server;
  to keep a column on the server, list the others in `shape.columns`, the
  primary key included. A column added to the table later stays on the server
  until you list it.
- **Tested with `@electric-sql/client` 1.5.28 and Electric 1.8.1.**
