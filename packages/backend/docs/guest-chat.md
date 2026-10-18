# Sponsored guest chat

Lane `eh-guest`, 2026-10-17. Shared install implementation; hosted and
single-owner compositions mount the same boundary. No hosted job or preview
service participates. Access is disabled by an empty operator allowlist.

## Authority

A random, HttpOnly session capability belongs to one public repository. It is
never a user, roster member, owner credential or general API bearer. The sole
guest action is the fixed `guest.chat` flow. Its model request contains text,
the built-in app instructions followed by `.smithers/instructions/app.md` read
at a pinned main tip, and a bounded output allowance. No tools, provider-held
context, retries, workspace, secret or write capability is supplied. Published
home and docs retain their existing public read authorization.

The app asks for a repository directly instead of deciding existence from the
first catalog page. The server's guest projection decides whether the composer
can submit. Every refusal offers the existing sign-in action.

## Admission and accounting

Use the existing model proxy's price table, bounded-request parser and streaming
forwarder. Before forwarding, a PostgreSQL transaction locks the global guest
pool, checks the kill switch, launch interval, daily and launch spend, IP request
count and idempotency key, then inserts the maximum input/output reservation.
Integer nanodollars are used throughout. Defaults: $0.10/request, $100/UTC day,
$500/launch window and 10 requests/IP/UTC day. One configured model is permitted;
unknown prices fail closed. A sponsor is the operator, independent of the repo's
owner and of the guest capability.

Reservations commit before dispatch. Duplicate keys never dispatch again,
including after timeout, disconnect or restart. Unknown outcomes retain their
full bound. Only authoritative successful usage may reduce a reservation; a
failed settlement leaves the bound intact. A day/window total includes pending
reservations. Kill-switch changes fence admission and cancel active provider
requests; a database read failure refuses calls. Existing calls remain charged
conservatively when cancellation cannot establish provider usage.

Crossing half the daily cap creates one durable record in the existing
notification machinery, in the admission transaction, plus a structured log.
Delivery is a separate lane. Diagnostics contain landing, interaction, run,
reservation, repository and pinned revision IDs, stages, durations and refusal
codes. Addresses are HMAC-hashed using an operator secret; no message content,
credentials or raw addresses enter diagnostic output.

## Increments and proof

1. Durable guest principal, reservation accounting and shared HTTP composition.
   Exercise both router compositions with a fake provider, twenty concurrent
   requests against $0.30, restart, duplicate, timeout, kill switch, isolation,
   instruction ordering and alert deduplication.
2. App guest flow, streaming transcript, direct repository lookup and sign-in
   refusals. Exercise the typed flow and its real HTTP seam, then Playwright.
3. Operator configuration/runbook and stale anonymous-turn documentation.

Keep access off by default. Tests use isolated lane-owned databases and local
provider stand-ins. A passed fake-provider test is not a deployed-app receipt.
The lane lands source and evidence; the DRI reviews and deploys.

## Operator runbook

Configure the same variables in either composition. A deployment must have an
offered provider key through its existing model-key adapter. Guest requests
never receive that key. No dependency or private deployment service is needed.

| Variable | Default / requirement |
| --- | --- |
| `SMITHERS_GUEST_REPOSITORIES` | Empty; comma-separated `owner/repo` names |
| `SMITHERS_GUEST_PROVIDER` | Required when enabled; `openai` or `cerebras` |
| `SMITHERS_GUEST_MODEL` | Required; one model with a checked-in provider price |
| `SMITHERS_GUEST_SPONSOR_ID` | Required; operator's persisted user ID |
| `SMITHERS_GUEST_IP_SECRET` | Required; private random string of at least 32 bytes, stable across replicas and restarts |
| `SMITHERS_GUEST_DISABLED` | `false`; `true` disables configured guest access |
| `SMITHERS_GUEST_REQUEST_NANOS` | `100000000` ($0.10) |
| `SMITHERS_GUEST_DAILY_NANOS` | `100000000000` ($100) |
| `SMITHERS_GUEST_WINDOW_NANOS` | `500000000000` ($500) |
| `SMITHERS_GUEST_WINDOW_START` | Required; RFC3339 UTC timestamp, inclusive |
| `SMITHERS_GUEST_WINDOW_END` | Required; RFC3339 UTC timestamp, exclusive |
| `SMITHERS_GUEST_REQUESTS_PER_IP` | `10` |
| `SMITHERS_GUEST_OUTPUT_TOKENS` | `1024`; positive, at most 4096 |

All replicas use the same PostgreSQL product database. Keep the HMAC secret and
trusted proxy-hop configuration consistent, or an address could receive more
than one bucket. The shared trusted-hop middleware resolves addresses; guest
code ignores request-supplied forwarding identity. IPv6 addresses share a /64.

The operator's person credential can `PUT /api/admin/guest` with
`{"disabled":true}`. A self-hosted owner or hosted administrator is required;
delegated agent/run credentials and guest cookies are refused. The switch is
persisted under `guest.suspended` in install settings and serializes with
reservations. New admissions stop at commit; active calls poll every 100 ms,
canceling on suspension or unavailable accounting. To resume, send
`{"disabled":false}`. Browser credentials retain the ordinary CSRF boundary.

Reservation accounting retains the original numeric repository ID after that
repository is deleted. Deleting and recreating an allowlisted name must never
reset the operator's daily or launch pool.

Keep the allowlist empty while installing. Apply product migrations, configure
the fixed model, sponsor, secret and explicit launch interval, then enable the
intended public repositories. A private or archived repository remains refused
even when its name is configured. Removing a name prevents further calls;
use the global switch to cancel in-flight calls too.

Guest session cookies are scoped to one repository's guest endpoints. A caller
can inspect only its own `GET /api/repos/{owner}/{repo}/guest/runs/{run}` receipt.
No recovery path re-dispatches a reserved request. A restart can therefore leave
a `reserved` row whose full bound remains held; never release such a row merely
because the process or browser disappeared. Model instructions are pinned to the
main tip at admission. The browser retains each repository session's transcript
in its own durable namespace; it never executes model tool requests.

The `notifications` row with `source_type='guest_spend'` and the UTC day as
`source_id` is the once-per-day 50% alert delivery can consume. Notification
delivery configuration belongs to its owning lane. Structured guest logs carry
correlation IDs, stages, monetary bounds, duration and stable refusal codes.
They exclude prompts, answers, cookie values, provider keys and raw addresses.
