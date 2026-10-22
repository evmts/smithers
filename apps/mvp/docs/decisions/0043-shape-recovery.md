# 0043 — Observe shape recovery and enforce shape audiences

2026-10-22. Repair of the transport defined by 0002; no new feature or runtime.

Use the catalog's `@smthrs/effect-electric` ShapeProxy, ShapeSource and SyncPolicy, and the existing Effect telemetry exporter. Retain the client's indefinite backoff on 5xx; 4xx stops without retry. Record each proxy outcome with a generated span correlation id, fixed shape name, status class, duration and the dependency boundary that answered. Record browser conversation/composer failure and recovery only on transitions, confirming applied collection data before reporting recovery.

An Admin shape is requested only after the browser confirms Admin access. Direct unauthorized requests answer 403 before contacting Electric; a failed session database answers 503 without replacing the device's shape definition. Previously all pages subscribed, and non-Admins received an empty-audience shape; local integration reproduces that behavior. The old production 503 cannot be attributed more precisely without the diagnostics this change adds.

Each successful session confirmation advances a local generation, even when its role is unchanged. A shape stopped by 403 reconnects only after a newer confirmation grants Admin access; a refusal arriving late is compared with the generation that sent its request. No UI prose, app retry loop, extra binding or new persisted schema is needed. Tests inject faulty Effect services, delegate healthy requests to real Postgres/Electric, and verify recovery without a page reload.

Preserve the client abort signal alongside Effect interruption in ShapeSource. Once headers arrive the request Effect has returned, but its body still needs the caller’s cancellation; otherwise closing a collection leaves a real Electric long poll alive. Test hosts close request admission, abort and drain request scopes before dropping their isolated schemas.
