# Converter operator runbook

Keep `SMITHERS_GUEST_REPOSITORIES` empty until the DRI explicitly enables a public
repository. This change does not enable access or configure production.

## Install

Apply the product migrations, including `guest_conversions`, and retain all
[guest chat configuration](guest-chat.md#operator-runbook). Add:

| Variable | Value |
| --- | --- |
| `SMITHERS_GUEST_COMPILE_ENDPOINT` | Fixed operator-controlled HTTP(S) worker URL; empty disables conversion execution |
| `SMITHERS_GUEST_RECEIPT_SEED` | Standard Base64 of a 32-byte Ed25519 seed; operator secret, same across replicas |
| `SMITHERS_GUEST_PROXY_ORIGIN` | Exact HTTPS external origin, for example `https://effeck.dev`, without trailing slash |
| `SMITHERS_GUEST_PROXY_SECRET` | Independent random secret of at least 32 bytes, shared only with the external Worker |

The public repository must contain the shipped version's typed converter
fixture as `.smithers/flows/convert/flow.ts` and its own prompt beside it. No real
prompt or golden set is supplied by Smithers. Publish the derived public key
with the Effeck share verifier; keep old public keys available for old shares
when rotating the operator seed. No key is fetched when opening a share.

Run the compiler in the Effeck-owned credential-free Linux image, outside the
backend process: fixed pinned `effeck --noEmit --pretty false -p <fixed project>`,
locked effect 4.0.5 and effeck-runtime, fresh directory per request, no network,
1 CPU, 512 MiB, 10 seconds. Do not install compiler credentials or user-supplied
flags. Restrict ingress to the backend through deployment networking. The
backend sends no cookies or bearer credentials to this endpoint.

## effeck.dev same-origin Worker

Expose only Worker-local `/api/convert/session`, `/api/convert/conversions`,
`/api/convert/conversions/key` and `/api/convert/conversions/{key}`. Map them to
fixed backend paths under `/api/guest-proxy/repos/effeck/effeck/`; never accept a
caller-selected upstream, repository or URL. Require browser requests to have
the Worker's own origin and JSON content type; refuse cross-origin POSTs.

Forward:

- Method and bounded JSON body, with Content-Type `application/json`.
- `Origin: https://effeck.dev` (the configured exact origin).
- `X-Smithers-Guest-Proxy`: the Worker's private shared proxy secret.
- `X-Smithers-Guest-IP`: the ingress-provided visitor IP (Cloudflare's trusted
  `CF-Connecting-IP`), never a visitor-supplied forwarding header.
- `X-Smithers-Guest-Session`: the opaque guest capability from the Worker's own
  host-only cookie. No Smithers cookie, Cookie header, browser Authorization,
  upstream path or caller-supplied `X-Smithers-*` identity is forwarded.

`GET …/session` returns a capability in `X-Smithers-Guest-Session`; there is no
Set-Cookie crossing hosts. Store it only at effeck.dev in a Secure, HttpOnly,
SameSite=Strict, host-only cookie scoped to `/api/convert`, for at most one day.
Strip the capability header from the browser response. Set Cache-Control
`no-store` for every proxy response; never cache one guest's result for another.
Preserve status, Retry-After and bounded JSON. The upstream secret must never
reach JavaScript, logs or a public response. Forward a disconnect if desired;
the backend still persists its already claimed result without redispatch.

The proxy boundary validates the secret and origin, strips host cookies and
bearer credentials, and uses only the authenticated Worker's IP/session fields.
The ordinary endpoint retains its existing same-origin and CSRF protections.
No CORS permission or cookie-domain widening is needed.

## Observe and stop

Inspect content-free `guest conversion` stage records and reservations by their
correlation IDs. `compiled` is evidence only of an exit-0 response from the
configured worker. Unknown or failed calls remain conservatively charged.

The existing operator/person `PUT /api/admin/guest {"disabled":true}` stops new
model admissions in the shared pool and cancels active model/compiler transport. It applies to chat and conversions; neither
a guest nor an agent credential can operate it. Saved receipts remain readable.
Removing the allowlist entry denies new guest repository access entirely.
Never delete uncertain reservations to free budget or replay a claim after a
restart. A failed receipt persistence requires repairing storage and observing
the same key, not creating another conversion automatically.

Before enabling: exercise fake-worker HTTP tests, then the real credential-free
worker with the repository's golden set and pinned identities. Verify a signed
share locally and alter one character to confirm rejection. Confirm zero guest
access while the allowlist is empty. Production enablement and deployment belong
to the hosting DRI, not this lane.
