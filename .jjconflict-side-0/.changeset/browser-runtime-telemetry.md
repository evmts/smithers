---
"@smthrs/platform-browser": minor
---

`BrowserRuntime.run` takes `telemetry`, a layer that receives the engine
worker's records: every log line, span and metric of the leader, the engine
and the flows it runs. Without it they stay in the worker.

```ts
BrowserRuntime.run({
  name: "smithers",
  sqlite,
  flows,
  registerFlows,
  telemetry: Otlp.layerFetch({ baseUrl: `${self.location.origin}/api/telemetry`, serviceName: "engine" })
})
```
