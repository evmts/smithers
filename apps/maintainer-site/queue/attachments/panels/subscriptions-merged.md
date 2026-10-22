# Subscriptions: merged position (Opus merger, 2026-10-21 11:45)

Reports read: Codex Sol (`sol/report.md`), Codex Astra (`astra/report.md`), Claude Opus (`opus/report.md`). No Fable panelist, by Will's choice.

## 1. Position

**Swap at the agent level.** An admin picks which agent backs the `coding` role: `{kind:"smithers"}` (today's loop, the default) or `{kind:"harness", harness:"claude-code", runner, model?}`. A harness backend runs the unmodified Claude Code CLI on a runner machine (the Mac mini for us), under the login of the person whose TODO it is. The CLI's only tools are our branch-sandbox tools, served to it over MCP with a job-scoped token. The runner pulls jobs over outbound HTTPS; nothing calls into the mini. The cloud side is one `ExternalJob` step, so it survives crashes on either end.

**Confidence: 72%.** It is the only shape the Claude Code terms describe as allowed (§4), and a tracer run on 2026-10-21 finished a real coding task this way (§2). It drops to the 50s if Will declines the durability exception in §4.2, and rises when the local e2e (§6) passes.

```
Cloudflare: todo run (FlowExecution DO, journaled)                    Runner machine (outbound HTTPS only)
 todo/Implement                                                        smthrs runner (launchd), runner token
  ├ agent/ResolveBackend: agent_backends["coding"]                     │
  ├ smithers ─▶ AgentAction (today, unchanged, per-call journal)       │
  └ harness  ─▶ ExternalAgent = ExternalJob                            │
      start    INSERT agent_jobs (key = origin#gN) ─── queued ────────▶│ POST /api/runners/claim (long poll)
      status   parked probes (DO timers) ◀── heartbeat, lease ─────────│ person ─▶ that person's home only
      collect  {summary, session, usage} ◀── settle ───────────────────│ claude -p --tools "" --strict-mcp-config
      cancel   cancel flag ───────────────────────────────────────────▶│   --session-id v5(origin) | --resume (g≥2)
                                                                        │ kills the process group on cancel
 /api/agent-jobs/<key>/mcp  (bearer: job token, sha-256 on the row) ◀── MCP tools/call ── the CLI
   └ each call ─▶ sandbox/Call (one durable run per call, callId v5) ─▶ branch container
```

## 2. Evidence I checked myself

| Claim | Check | Result |
|---|---|---|
| Claude Code can be locked to MCP-only tools and finish a task | Tracer on the MacBook: a disposable HTTP MCP server with list/read/write/run over a temp checkout; `claude -p --tools "" --strict-mcp-config --mcp-config <file> --allowedTools mcp__smithers` (2.1.305) | `init.tools` = the four MCP tools only, `apiKeySource: none` (subscription). Fixed a failing test in 5 turns, 5 s, $0.03, prompt cache read 17.6k tokens. Evidence: `scratchpad/subs-merge/tracer/run.jsonl` |
| A chosen session id resumes after a crash | `--session-id <uuid>` then `--resume <uuid>` in the same directory | Second turn recalled the first. `--resume` of an unknown id exits 1 with "No conversation found", so the runner can fall back to a fresh `--session-id` |
| `ExternalJob` is the durable primitive for external work | `packages/smithers/flows/flow/src/ExternalJob.ts` | Irreversible start keyed `origin#gN`, sealed probes on parked timers, `Lost` → cancel → generation g+1, collect, cancel on rollback |
| CLI agents were already meant to be one durable job | Decision 0005:235 and `docs/work/connect-agents-sandboxes-forge.md:65` (Will's Q2 answer) | "Third-party CLI agents (Claude Code, Codex) run inside the box later as `job/Run` jobs, because they bring their own loop." |
| Each sandbox tool call can be its own durable run | `worker/branch/SandboxCalls.ts`, `worker/flows/SandboxCall.ts` | The browser agent's calls already start `sandbox/Call`, one execution per call id, fenced in the machine |
| `@smthrs/mcp` is client-only | `packages/smithers/mcp/src` | `McpClient`, `McpFlows`; no server. New: `McpServer` |
| The `agent` model role is shared by chat and the TODO agent | `worker/Executions.ts:181`, `ModelRoles.ts` | A separate `coding` role is needed so chat is untouched |
| Migrations | `apps/mvp/db/migrations` on main@origin `931fed70` | Highest is 0037; the new one takes the next free number at landing |

## 3. Disagreements and how I settled them

| Question | Sol | Astra | Opus | Settled |
|---|---|---|---|---|
| Model-level or agent-level swap | Model level, 88% | Model level, 86% | Agent level, 70% | **Agent level.** (1) Terms: a model-level relay makes Claude Code a text pipe for our own agent loop. That is "route requests through Free, Pro, or Max plan credentials" for a product, and the Usage Policy (effective 2026-11-12) adds "misrepresent the product or client being used". The legal page's carve-out names only "the unmodified Claude Code binary with their own Claude subscription", which is what agent level runs. (2) Will's words: "change what agents get used" and "pointing the coding agents at our subscriptions". (3) Prior design: 0005's CLI agents run as one job. (4) The tracer works. Sol and Astra are right that it costs per-call journaling; that goes to Will (§4.2). |
| Transport | Tunnel + Access, 82% | Tunnel + Access, 80% | Runner pulls, no tunnel | **Runner pulls.** No inbound path, no tunnel to keep up, and a Durable Object alarm caps a held stream at 15 minutes against a 40-minute step. Long poll plus `ExternalJob` probes needs no new runtime. Astra notes a pull adds claim and lease machinery; it is two tables and three routes, all inside the external system `ExternalJob` already models. |
| Codex | Persistent app-server text seat | Same, 65% feasible | Agent level, switched off until OS-isolated | **Switched off.** Opus's probe on 0.163 shows Codex keeps `functions.exec`, `apply_patch` and the `codex_apps` MCP server even with `features.shell_tool=false`, and reached a shell through `claude_code.Bash`. The adapter ships and is tested; the runner refuses Codex jobs until each person's Codex runs as its own OS user. |
| API fallback when the mini is off | Off by default | Off by default | Policy `wait`/`smithers`/`fail` | **Off.** A job waits until its deadline, or fails after `claimWithin` if the backend sets one. No silent spend. |
| Concurrency | 1 per account | Hard host and account caps | 2 per home, 8 per runner | **1 per home, 4 per runner** by default, in the runner's config. Unmeasured, so the safest default (Sol). |

## 4. Decisions for Will

### 4.1 Subscription terms (Will owns these)

Sources fetched 2026-10-21. Anthropic pages fetched directly; OpenAI's pages return 403 to fetchers, so their text is from the search index and the copy saved on 2026-10-02 in the `smithers-fallback-agents` skill.

- **Claude Code legal page:** "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Carve-out: it does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code." Also: "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."
- **Anthropic Consumer Terms** (effective Oct 8, 2025; California law): "You also may not make your Account available to anyone else." "You may not share your Account login information … with anyone else."
- **Anthropic Usage Policy** (effective Nov 12, 2026): "Resell, proxy, or otherwise provide access to Claude through unauthorized means, including services that route requests through consumer subscriptions or misrepresent the product or client being used."
- **OpenAI Terms of Use:** you may not share account credentials or make your account available to anyone else. **Sign in with ChatGPT terms** (Sep 29, 2026): no "rotating accounts", no "pooling … ChatGPT plan usage", no "using one user's subscription to fulfill another user's requests".

| Shape | Inside the carve-out? |
|---|---|
| Ann's TODO runs Claude Code on the mini under Ann's own subscription, unmodified CLI | **Yes.** An end user signed in to the unmodified binary, hosted by a platform. |
| Ann's TODO runs under Will's subscription | **No.** That makes Will's account available to someone else, and serves another person's request. |
| Rotating across accounts when one hits its limit (claude-rr, codex-rr, lanes' failover) | **No.** Named in the Usage Policy and the OpenAI terms. |
| A 24/7 factory on one person's subscription | **Unclear.** It strains "ordinary, individual usage". |

**Recommendation (85%):** route each person's TODOs only to that person's own login on the mini, with no failover to anyone else's account; give a person without a subscription the API-key `smithers` backend. The code enforces this: a runner serves only the people its config lists, each to their own home. The 15% is "ordinary, individual usage" for a factory, which only Anthropic can settle.

### 4.2 Durability exception (DUR-1)

With a harness backend, the model calls inside Claude Code's loop are journaled per session, not one by one: a crash resumes the vendor session (`--resume`), and each tool call is its own durable run, but a tool call in flight at the crash can run twice. The `smithers` backend keeps today's per-call journaling and stays the default. **Recommendation (75%): accept it for the `coding` role only**, because 0005 already chose "the job is their durable unit" for CLI agents.

## 5. Build plan (now: product-generic and terms-neutral only)

| # | Piece | Where |
|---|---|---|
| 1 | `HarnessCli`: argv, parse and limit classification for claude-code and codex; Claude locked to MCP-only tools; Codex adapter present, runner refuses it | `@smthrs/agent` |
| 2 | `ExternalAgent`: a typed step over `ExternalJob.make`, an `AgentJobs` port, and the runner protocol's schemas and HTTP client | `@smthrs/agent` |
| 3 | `McpServer`: Streamable HTTP server over Effect's `HttpServerRequest`, tools from `FlowBinding`s | `@smthrs/mcp` |
| 4 | Migration: `agent_backends` (+ changes), `agent_runners`, `agent_jobs`; flows `admin/SetAgentBackend`, `admin/AddRunner`; routes `/api/runners/{claim,heartbeat,settle}` and `/api/agent-jobs/<key>/mcp` (each tool call a `sandbox/Call` run); the Postgres `AgentJobs` | `apps/mvp` |
| 5 | `smthrs runner`: claims, routes person → home, spawns the CLI in a scoped process group with a scrubbed environment, heartbeats, settles; refuses Codex | `@smthrs/cli` |
| 6 | `todo/Implement` dispatch on the `coding` backend, default `smithers` | `apps/mvp`, after the lead clears it with the prod-flows builder |
| 7 | Local e2e: the runner on the MacBook under Will's own login against a dev stack, one TODO to a pull request; GIF | `apps/mvp/e2e` |

Not now, until Will answers §4: deploying a runner against production, any person's TODO on another person's subscription, the mini's logins, the lanes service, and Codex.

## 6. The e2e that proves it

Local: an admin sets `coding` to `{harness:"claude-code", runner:"local"}`; `smthrs runner` runs on the MacBook with Will's own home mapped to Will; Will commits a README TODO on the test repository. Pass: the run card names the harness, sandbox calls appear, the PR diff is the README line, `agent_jobs` settles `done`, and no `agent` model spend is recorded for the attempt. Then kill the runner after the first tool call: the job goes `Lost`, generation 2 resumes the same session, and one PR has the line once. Faults (limited, no claim, cancel) by injected `AgentJobs` in integration tests.
