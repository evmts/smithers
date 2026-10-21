---
title: Self-hosted Grafana (LGTM stack on a Latitude server, instead of Grafana Cloud)
status: blocked
area: infra
owner: Latitude observability lane
updated: 2026-10-20
links: [observability.md, second-build-machine.md, sign-in.md, decisions-for-will.md, infrastructure-as-code.md, ../observability.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:07 PDT

**What:** Connect production telemetry to the working self-hosted Grafana stack on Latitude.

**Why:** Will selected self-hosted Grafana; production needs a durable, authenticated telemetry destination.

**Current state:** At 19:06 the lead confirms public-internet trace, log and metric ingestion and refusal without the token, using a temporary tunnel that has been removed. No Grafana Cloud stack was found; nothing was deleted. The old password belonged to deleted 2025 Hetzner infrastructure. Production remains unwired because the Cloudflare token lacks the required permissions.

**Next step:** After Will adds the two permissions, the infrastructure owner runs the private tunnel setup, wires production telemetry, deploys and proves production ingestion. Preserve the successful temporary-ingress receipt separately from permanent production completion.

**Open questions for Will:** Add Account / Cloudflare Tunnel / Edit and Account / Workers Observability / Edit to the baseapp token. No further Grafana Cloud deletion decision is needed.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 19:05 PDT

**What:** Move telemetry to self-hosted Grafana, Tempo, Loki and Prometheus on msb-lat-nyc-01, then remove Grafana Cloud.

**Why:** Will, queue, about 18:33: "Yes please delete it and just self host grafana".

**Correction:** `TF_VAR_grafana_password` is not a Grafana Cloud password. It is the admin password of a self-hosted Grafana in the old "app2" Reth indexer Terraform (December 2025, Hetzner and Cloudflare), whose code and server are gone. The rows below that call it the Grafana Cloud password are wrong.

**Current state (receipts in the private infra notes):**
- No Grafana Cloud stack, token or endpoint exists on Will's Mac, and nothing sends to one: not the old plue stack (Google Cloud Monitoring), not smithers.sh, not this app. Nothing was deleted, because nothing was found.
- The self-hosted stack has an authenticated public OTLP/HTTP ingress: Cloudflare Tunnel, then a bearer-token proxy, then the collector. A trace, a log and a metric sent over the public internet were queried back in Grafana (2026-10-21 01:56 and 01:58 UTC, through a temporary tunnel).
- The named tunnel isn't created: the Cloudflare token lacks Cloudflare Tunnel Edit. Cloudflare Access isn't enabled on the account, so the bearer token replaces an Access service token.
- Production sends nothing yet. Wiring the Workers needs a code change and a deploy ([observability.md](../observability.md#sending-to-your-own-collector)).

**Next step:** Will adds Cloudflare Tunnel Edit and Workers Observability Edit to the deploy token; the lead runs the private tunnel script, then wires the destinations into `alchemy.run.ts` before a deploy.

**Open questions for Will:** None. If he has a Grafana Cloud account outside this Mac, he deletes its stacks at grafana.com, My Account.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 14:55 PDT

**What:** Research and stand up Grafana, Tempo, Loki and Prometheus on Latitude.

**Why:** Will asked for self-hosting instead of Grafana Cloud at 14:20.

**Current state:** At 14:25 the lead reports a remote lane setting up the stack with SSH-only access. No working ingestion or deployment receipt is reported. The old credential exposure remains unresolved.

**Next step:** Prove telemetry ingestion and access, then resolve the old Cloud credential/stack.

**Open questions for Will:** Review the self-hosting proposal after research; disposal of the old Cloud stack remains open.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: Codex Sol lane (task e) under the SDK coordinator on msb-lat-nyc-01, briefed by the lead at 14:20 on 2026-10-20 and restarted between 14:20 and 14:23 on the `codex-tevm` account, the one that accepts Sol


## What

Grafana, Tempo, Loki, Prometheus and an OTLP collector (`grafana/otel-lgtm`) in rootless Docker as the `lane` user on msb-lat-nyc-01, with data on that server's disk and a retention limit.

```
app / Worker telemetry ──OTLP──▶ msb-lat-nyc-01  127.0.0.1 only
                                   ├─ collector ─▶ Tempo (traces) · Loki (logs) · Prometheus (metrics)
                                   └─ Grafana  ◀── SSH tunnel from a maintainer's Mac
```

- Every port binds to 127.0.0.1; nothing is public yet.
- A strong admin password in an owner-only file under `~lane/.secrets/`, never printed.
- `~/lanes/grafana/README.md` on the server: the SSH tunnel, the OTLP endpoint, retention and backups.
- Server infrastructure, not repository code; at most a short self-hosting page if the repository has an observability doc for it.

## Why

**14:20:47 on 2026-10-20, Will (queue, on "Rotate the exposed Grafana password"):** "Can we self host grafana instead of using graafana cloud"

The Grafana Cloud password (`TF_VAR_grafana_password`) was printed into an agent transcript early on 2026-10-20, and the lead had asked Will to rotate it five times since 01:00 ([sign-in](sign-in.md)).

## State

- **14:20:47 on 2026-10-20: Will's answer** (above), recorded in `queue/dispatch.md` at 14:28.
- **14:20: the lead wrote the coordinator brief** (scratchpad `final/SERVER-LANES-BRIEF.md`, task e). The coordinator first started on an account that rejects Sol; the lead restarted it between 14:20 and 14:23 on `codex-tevm` (scratchpad `start-sdk20.sh`; to Will at 14:23:49: "Restarting the Latitude coordinator on the account that works, with two more jobs: the small SDK review findings, and self-hosting Grafana").
- 14:25:28, the lead to Will: "a Codex lane is setting up Grafana, Tempo, Loki and Prometheus there, reachable only over SSH for now."
- No report by 14:30 (`~/lanes/sdk20/REPORT.md` on the server).

## Next

From 14:30 on 2026-10-20: the lane's report and README: the stack up on 127.0.0.1, retention set, the password stored and unprinted. Then point the app's OTLP export at it (the local dev stack first; production after the first deploy) and retire the Grafana Cloud stack.

## Questions for Will

- The Grafana Cloud password stays exposed until its stack is deleted or the password rotated. Delete the Grafana Cloud stack once the self-hosted one receives the app's telemetry? Recommended: yes. (Not asked yet; `queue/dispatch.md` 14:28 notes the exposure.)
