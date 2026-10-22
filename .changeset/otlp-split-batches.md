---
"@smthrs/observability": minor
---

`Otlp.layer` and `Otlp.layerFetch` split a batch the collector would refuse instead of discarding it.

- **`maxRequestBytes` and `maxRecords` options.** Pass a collector's limits, such as `OtlpRelay.serve`'s `maxBodyBytes`
  and `maxRecords`. A batch over either, or over the transport's 1 MiB, is sent as several requests under both, in
  order. Each span, log record or metric data point keeps its resource and scope; a metric's points are spread over
  requests when they must be.
- **Only an oversized record is discarded.** A record too large for a request on its own is left out and counted
  `oversized`; the rest of its batch is sent. Before, the whole batch was discarded.
- **At least once.** A refused part answers for the whole batch, which the exporter retries, so a part may arrive
  twice but none is lost.
