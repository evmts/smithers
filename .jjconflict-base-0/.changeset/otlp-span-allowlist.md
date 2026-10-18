---
"@smthrs/observability": minor
---

`Otlp.layer` and `Otlp.layerFetch` take `spans`, the span names to export.
A span off the list still runs and still parents: its children keep its trace
id and name it as their parent, and only the listed spans are sent. Logs and
metrics are unaffected. Pass an `OtlpRelay.serve` allowlist's names so a
program that records many spans the relay drops, such as a durable engine's
storage spans, sends only what the relay keeps.

```ts
Otlp.layerFetch({ baseUrl: `${origin}/api/telemetry`, spans: allow.records })
```
