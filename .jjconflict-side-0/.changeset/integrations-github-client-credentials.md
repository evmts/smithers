---
"@smthrs/integrations": minor
---

`GitHub.GitHubClient` takes `clientCredentials`, an App's client id and secret,
and sends them as HTTP Basic in place of any token: how GitHub authenticates its
`/applications/{client_id}/...` endpoints, such as revoking a user's token.
Error text never carries the secret or the encoded header.

```ts
const app = yield* GitHub.GitHubClient.make({ clientCredentials: { clientId, clientSecret } }, {})
yield* app.request("DELETE", `/applications/${clientId}/token`, { access_token })
```
