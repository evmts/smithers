---
"@smthrs/effect-electric": minor
---

A live batch cut short no longer loses its rows, and each shape request is
traced.

- **No skipped batch.** `@electric-sql/client` 1.5.28 takes a response's
  offset from its headers before it parses the body. A batch it then couldn't
  read was skipped when the shape restarted, and an empty 200 body was read as
  `[]` with no error: the rows in it never reached the device.
  `ElectricCollection.make` now reads every 2xx batch of the shape's log in
  full before Electric sees it. A body that breaks off is a network failure,
  and the sync policy sends the request again. A body that ends but isn't a
  whole batch (cut short, empty, or not Electric's, such as a portal's page)
  stops the shape with no status before Electric takes its offset, so
  `reconnect` sends the same request again. `Succeeded` now means a 2xx and a
  whole batch.
- **Traced.** Each shape request records one span, `electric.shape.request`,
  with no row content: `electric.collection`, `electric.shape.live`,
  `electric.shape.request_offset`, `http.response.status_code`, and for a 2xx
  `electric.shape.handle`, `electric.shape.offset`, `electric.shape.bytes`,
  `electric.shape.complete` and `electric.shape.rows`.
- **Two test switches.** `ShapeSource.Switches` gains `cut(bytes, requests?)`,
  a body that ends after `bytes` bytes, and `drop(bytes, requests?)`, a body
  whose read fails there. A negative `bytes` counts back from the body's end.
