---
"@smthrs/model": minor
---

`ModelProxy` carries a provider's keep-alives to the client. `serve` writes a
blank NDJSON line each time the served model runs `Model.Liveness`, at most one
a second and none within a second of an event, and the client runs
`Model.Liveness` for every chunk of the body it reads. A browser `ModelStep`
calling a model endpoint heard nothing while the provider reasoned without an
event, so a `high` call that thought past 300 seconds timed out though the
provider was alive. A silent provider still yields no blank line and still
times out. Every client already skips blank lines, so the wire stays readable
by older clients.
