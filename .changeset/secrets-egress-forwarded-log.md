---
"@smthrs/secrets": patch
---

A forwarded request's `secrets.egress` log line and `secret_egress_requests` count, which settle once the answer's body
has streamed, now go to the caller's logger and metrics even when the host streams the answer outside the request's
services, as a Cloudflare Worker does. Before, they reached the host's default logger without their fields.
