---
"@smthrs/integrations": major
---

HTTP goes through Effect's `HttpClient` instead of the global `fetch`. Callers
provide it through a layer, usually `FetchHttpClient.layer` from
`effect/http`; a test provides a client of its own to inject a transport
fault.

- `GitHub.GitHubClient.make` returns
  `Effect<GitHubClient, IntegrationError, HttpClient>` and fails with an
  `invalid-config` `IntegrationError` instead of throwing it.
  `GitHub.GitHubClient.layer` requires `HttpClient`.
- `Core.OAuthToken.make` returns
  `Effect<AccessTokenSource, IntegrationError, HttpClient>` and fails instead
  of throwing. `Core.OAuthToken.exchangeCode` requires `HttpClient`.
- `GitHub.Proxy.make` and `GitHub.Proxy.layer` require `HttpClient` for the
  calls to GitHub.

None of them follows a redirect: each sets the fetch transport's `redirect`
to `"manual"`, replacing any `FetchHttpClient.RequestInit` you provide, so a
token, a client secret or a forwarded credential never reaches a `Location`
host. Do not pass a client wrapped in `HttpClient.followRedirects`. They send
no `b3` or `traceparent` header. A GitHub failure whose body has no `message`
now names the status alone, without the HTTP status text.

```ts
// Before
const client = GitHub.GitHubClient.make({})
const viewer = await Effect.runPromise(client.request("GET", "/user"))
// After
const viewer = await Effect.runPromise(
  Effect.flatMap(GitHub.GitHubClient.make({}), (client) => client.request("GET", "/user")).pipe(
    Effect.provide(FetchHttpClient.layer)
  )
)
```

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
