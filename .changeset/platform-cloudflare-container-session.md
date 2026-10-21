---
"@smthrs/platform-cloudflare": minor
---

Add `ContainerSession.make`: a container Durable Object's container as `@smthrs/sandbox`'s `Sandbox.Session`, so `SandboxTools` and `Sandbox.layerHost` run in it as one user, in one working directory.

`SandboxObject.wake` takes an `egress` fetcher: with it, every outbound HTTP request the box makes beyond its intercepted hosts, and every HTTPS request, goes to that egress (`interceptAllOutboundHttp`, `interceptOutboundHttps("*")`). `SandboxObject.Machine` now names both methods.
