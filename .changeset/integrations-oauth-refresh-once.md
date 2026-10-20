---
"@smthrs/integrations": minor
---

`Core.OAuthToken.exchangeRefreshToken` presents one refresh token once and
returns the whole `Grant`, rotation included, for a host that stores refresh
tokens itself, such as one per signed-in person. A lost answer is not retried,
because GitHub's refresh tokens are single-use.

An OAuth error body is now a refusal whatever its status. GitHub answers a used
code or refresh token with `200 OK` and `{ "error": "bad_verification_code" }`,
which used to fail as `decode-failed`; it is now `permission-denied` with
`oauthError` set. `reasonForOAuthError` maps GitHub's `bad_verification_code`
and `bad_refresh_token` to `permission-denied`, and
`incorrect_client_credentials` and `redirect_uri_mismatch` to
`invalid-config`.

```ts
const grant = yield* Core.OAuthToken.exchangeRefreshToken({
  tokenUrl: "https://github.com/login/oauth/access_token",
  clientId,
  clientSecret,
  refreshToken
})
```
