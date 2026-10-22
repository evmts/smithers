# Worker run identity and alert links

2026-10-21 · Bug fixes from worker review.

Compare opaque execution identifiers exactly. Only UUID spellings are case insensitive, matching Postgres identity; a credential’s root still takes precedence over its child id.

Read alert links from Effect Config `ALERT_APP_URL`, independently of the saving request’s origin. Refuse destination saves when the configured URL is missing, malformed, carries credentials or uses a protocol other than HTTP or HTTPS. This configuration changes no delivery provider or destination.

Use the existing Effect and notifications entries in `docs/libraries.md`; no new dependency.
