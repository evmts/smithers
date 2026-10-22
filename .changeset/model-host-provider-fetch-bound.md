---
"@smthrs/model-host": patch
---

`providerTransport`, and so every `HostModel` and `toModel` model, now sends each provider request through its own
fetch. Effect's fetch client reads `FetchHttpClient.Fetch` from the fiber that sends a request, and the transport only
provided it while its layer built, so a caller's `Fetch` replaced it: a model served inside a ChatApi handler called
the provider with the handler's fetch, `HostModel`'s `fetch` option went unused, and a provider's redirect was followed
rather than refused. The transport now binds its redirect-refusing fetch to every request it makes.
