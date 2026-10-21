---
"@smthrs/secrets": minor
---

Adds `@smthrs/secrets`: a sandbox or a flow step uses a secret without holding its value.

- `Placeholder.minter(key)`: placeholders `smthrs-secret-<64 hex>` derived with HMAC-SHA-256 per scope and name, so a
  new scope, such as a sandbox's next generation, revokes the old ones; `find` and `is` recognize them.
- `Binding`: a secret's `Name`, exact lowercase DNS `Host`s (no wildcard, IP or single label) and `Method`s, and
  `checkValue`, which refuses a value under 8 bytes, over 16 KiB, with a control character or unpaired surrogate.
- `Egress.forward(request, policy)` and `Egress.execute(request, policy)`: substitute a placeholder's value into
  header values only (a Basic credential decoded first), only for the secret's own hosts and methods, over HTTPS on
  the scheme's port; refuse unknown placeholders, other hosts and more than 16 placeholders or 64 KiB of headers
  unsent; never follow a redirect; record each decision by name through the host's `Egress.Audit` before sending;
  and scrub every answer's headers and body of every value in the policy, whichever host answers: the value, its
  percent, JSON and base64 forms at every alignment, across chunks, after dropping `Range` and asking for an
  uncompressed answer. The host provides `Egress.Vault`,
  `Egress.Audit` and the `HttpClient`, whose own span is off. `secret_egress_requests` counts each request by
  `outcome`; nothing recorded carries a value.
- `Scrub.make(targets)`: the scrubber, for text and streams.
