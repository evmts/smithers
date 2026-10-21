# Startup wipe and telemetry boundaries

2026-10-21 — confirmed browser regressions.

The activation handshake deadline begins after the coordinated wipe and known-owner session preflight. A pending wipe lock must not consume the worker receipt budget. A refused activation remains refused if preparation completes later.

An unreadable wipe marker cannot prove that retained stores are clean. Directory lookup errors preserve the marker and select the existing unwiped host; only `NotFoundError` proves an absent directory. Both synchronous and asynchronous program-stop failures still reload the page once.

The browser telemetry relay withholds `url.full` and `url.query` entirely. Attribute-name checks do not protect credentials or content inside URL values. A regression sends credential-bearing URL attributes through the real `@smthrs/observability` relay and checks the resulting values.

No new library or runtime is introduced. The library catalog's observability entry supplies the relay; existing device-identity and unavailable-storage records report refusal through the existing host paths.
