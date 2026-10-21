---
title: A terminal in an iframe on the branch's sandbox
status: done
area: infra
owner: branch workspace clarity builder
updated: 2026-10-20
links: [review-round-4.md, ../decisions/0013-branch-workspace.md, conversations-and-history.md, branch-sharing.md, sandboxes.md, sandbox-budgets.md, ssh-into-a-branch.md, web-page-flow.md, connect-agents-sandboxes-forge.md, roles-and-labels.md, infrastructure-as-code.md, old-app-feature-gaps.md, decisions-for-will.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0007-roles-and-tags.md, ../proposals/mvp-gaps.md, docs-check-flow-outcome.md, land-to-main.md, dev-stack-hygiene.md, ../rulings.md, chaptered-review-videos.md, branch-workspace-clarity.md]
---

## Current specification — 2026-10-20, 17:44 PDT

**What:** Offer a shared branch terminal with server-enforced access.

**Why:** Editors need the same branch machine; viewers must remain read-only.

**Current state:** At 17:13 the lead reported branch terminal and sharing tests passing, including raw-connection viewer refusal and immediate revocation. The earlier in-progress status is stale. Workspace clarity and new co-editing remain separate active work.

**Next step:** Retain terminal access/revocation regressions and complete the requested collaboration/security code review.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Show branch conversation, sandbox terminal and views clearly.

**Why:** Will rejected the revised workspace demo as an empty screen.

**Current state:** The 17:13 backend/access and branch-view test completion remains evidence. The 17:30 queue rejection reopens the page presentation; the lead assigned a product fix as well as recording repair.

**Next step:** Complete branch-workspace-clarity.md, retain access/terminal regressions and rerecord the corrected page.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:14 PDT

**What:** Provide the branch conversation, persistent terminal and views with enforced sharing access.

**Why:** Branch work must survive reload and remain usable when switching.

**Current state:** The 17:13 completion supersedes the failing branch-views receipt: all reported branch-sharing/view tests pass. The empty-conversation flash is fixed with a test failing on the old code. Revocation closes the terminal immediately; viewers cannot write even through a raw connection.

**Next step:** Retain passing terminal/reload evidence and the fresh chaptered branch recordings for review; broader sandbox and secrets work remains separately tracked.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:04 PDT

**What:** Provide a branch conversation, persistent terminal and views.

**Why:** Branch work needs usable tools and a stable conversation when switching branches.

**Current state:** Docker recovered at 15:17. Later replacements were reported, but at 16:02 the lead found the branch-views browser test failing and an empty-conversation flash of about a tenth of a second on branch switches. The branch builder is fixing the flicker with a regression test. At 16:03 the branch-workspace review was withdrawn pending passing evidence. No new terminal failure was specifically reported.

**Next step:** Fix branch views and the switch flicker, rerun branch/terminal/reload tests and return passing chaptered recordings.

**Open questions for Will:** None.

Evidence: user-typed messages and lead text replies extracted with a script from session 6253ecf2 for the latest two hours through 23:03:42 UTC; rulings, queue answers, shared briefs/designs and current decisions, proposals, TODOs and rules. Reported receipts only; this tracker ran no product tests. Later rulings supersede older proposals.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:24 PDT

**What:** Provide a persistent real shell and conversation for each branch.

**Why:** Branch work needs working tools and reliable review evidence.

**Current state:** Earlier four-browser-test completion remains recorded below. The Docker outage blocker cleared at 15:17:27: containers start, Postgres/Electric are up and waiting agents were told to rerun. A fresh terminal/reload rerun and the replacement branch recording are not reported.

**Next step:** Rerun terminal startup and shell reconnection after reload, then return a valid chaptered video to Will.

**Open questions for Will:** None.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** One conversation and persistent shell per branch.

**Why:** Branch work needs a usable terminal and reviewable evidence.

**Current state:** Four browser tests passed at 13:43, but at 14:53 the lead reports Docker unable to start containers, blocking terminals and sandboxes. Will rejected the glitching recording at 14:28. Earlier feature completion is retained below.

**Next step:** Recover Docker, rerun real terminal/reload checks, and queue a valid chaptered recording.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: branch workspace builder, finished at 13:42:00 on 2026-10-20 (4 e2e tests pass against `alchemy dev` with a real container; its review findings fixed); uncommitted, lands in round 3. Until 13:46: branch workspace builder; told at 13:13 on 2026-10-20 to rerun its live-model tests on the restarted dev server; unreported by 13:17. Until 13:13: branch workspace builder, resumed by the lead at 11:42:48 on 2026-10-20 after the second weekly limit stopped it; running its first e2e from 11:49 (2 tests red at 11:55:02); unreported by 11:55. Until 11:42: branch workspace builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: branch workspace builder, 0013's first slice from 07:20:40 on 2026-10-20 (`infra/sandbox/Dockerfile` and `tmux.conf` on disk by 07:25, a Miniflare and Docker container spike in scratchpad `spike/` by 07:27); unreported. Panel B reported 0013 at 07:20:20. Until 07:20: Panel B; decision 0013 written 07:03:40 on 2026-10-20 (status: proposed); no builder yet. Until 07:03: Panel B (Opus merges into decision 0013; started 06:42:01 on 2026-10-20). Sol's design done 06:45; Opus's independent design written 06:55:57


## What

Open a shell on the branch's machine inside the app, in an iframe. The machine is decision 0005's per-branch sandbox on Cloudflare Containers, which isn't built yet.

```
app tab ── app/web/open embed (sandboxed iframe, isolated domain)
             └─ @smthrs/ui Terminal (xterm)
                   │ WebSocket, one-use ticket
                   ▼
           trusted gateway Worker ── authorizes, strips reader input
                   │ PTY: container.exec(argv, { pty }) into a tmux session
                   ▼
           branch SandboxObject (Durable Object) ── Cloudflare Container, /workspace
```

**Decided in 0013 (07:03, proposed), decisions 4 to 7:**
- **Our `@smthrs/ui` `Terminal` inside an iframe.** The frame is opaque-origin (`sandbox="allow-scripts"`, `srcdoc`), as `GeneratedView` already is. The page holds a same-origin WebSocket, authenticated by the session cookie, and passes bytes to the frame through a transferred `MessagePort`. Ruled out: ttyd, a second domain, and a ticket in a URL.
- **One terminal per person per branch,** each a tmux session in the branch's container, attached with `exec(argv, { pty })`. The owner attaches read-write; every other viewer attaches read-only (`-r`) and the server drops their input. Readers never start a shell or wake a machine.
- **Opening is a durable flow; the bytes are not.** `terminal/Open` admits, wakes, creates the session and records it on the Cloudflare host. Keystrokes and output are never replayed, logged, traced or counted by content.
- **Survives reloads and dropped connections, ends with its machine.** `sandbox/Sleep` stores each session's last screen and ends it. `sandbox/Keep` judges idleness from what the box is doing, so an idle tab never keeps a container awake.
- **Spike S0 (half a day):** a `durable_object` Container from a Dockerfile; `exec(["tmux", …], { pty })` bridged to a WebSocket through ChatApi; xterm in a `srcdoc` frame over a `MessagePort`; a clone through `interceptOutboundHttp` with no token in any byte; whether an idle attached tmux keeps the container awake. Fallback: the separate preview domain 0008 reserves.
- **Walking skeleton S1, track B:** `infra/sandbox/Dockerfile`, `infra/BranchSandbox.ts` (`Cloudflare.Container`, `schedulingPolicy: "durable_object"`) and `SandboxObject`, forge-only egress, `terminal/Open`, a minimal `sandbox/Wake`, the socket route and `TerminalFrame`. Proof: open the fixture's branch, open its terminal in the frame, run `git log`, reload, same shell; another branch has its own terminal.

Why not Opus's first draft (06:55:57), which proposed a native panel instead of an iframe ("an iframe needs a second domain, a token in the URL, and loses ⌘K and Vim keys while focused"): the merge keeps Will's iframe with an opaque `srcdoc` frame and a `MessagePort`, which avoids the second domain and the URL ticket.

The best guess before 0013, from Sol's design (scratchpad `final/panel-b-sol.md`):
- **Our own terminal in an isolated iframe.** The `app/web/open` embed gains a first-party terminal template that composes `@smthrs/ui`'s `Terminal`. A trusted Worker, not a web server the repository controls, authenticates and carries the PTY traffic. No ttyd and no second xterm frontend.
- **One shared session per branch at first.** One writer has control at a time; readers see the same output with no input. Viewers never create shells or wake a sleeping machine.
- **Who may open one:** opening a shell is a write (0005): Member and above on an open branch, or a named writer on a restricted branch ([branch sharing](branch-sharing.md)). Protected branches refuse.
- **Flows:** `terminal/Open`, `terminal/Connect` (read or control), `terminal/TakeControl`, `terminal/ReleaseControl` and `terminal/Close`, as durable steps on Cloudflare. The flow owns the session's lifecycle; the injected host owns the live byte stream. Typed input is never journaled or replayed on reconnect.
- **Durability:** a reload reattaches to the same tmux session while the machine is awake. Sleep checkpoints files and ends shell processes. An attached terminal keeps the machine awake.
- **Secrets stay out:** the image holds no credentials, and the environment is allowlisted.

**Walking skeleton (the brief requires a real shell in a real sandbox):** create a branch, open the iframe, wake a real Cloudflare machine, run `pwd` and echo a marker, reload and reattach. Prove branch B can't see branch A's terminal.

**Infrastructure it needs (Sol):**
- In the existing Alchemy stack (`apps/mvp/alchemy.run.ts`): a branch `SandboxObject` namespace, container scheduling, a digest-pinned linux/amd64 image, a binding from ChatApi, and a terminal gateway Worker on an isolated domain with its route, DNS and TLS. If Alchemy can't emit the Containers 1.0 configuration, extend the provider; no separate Wrangler deploy.
- The image: Node 24 on Debian trixie slim, plus bash, tmux and CA certificates, with a non-root user.
- A PTY seam in `@smthrs/sandbox` and its Cloudflare implementation in `@smthrs/platform-cloudflare`. Today's provider is shaped for SDK 0.x and has no PTY (`packages/smithers/flows/sandbox/src/CloudflareSandbox/Sdk.ts:39`); it is replaced, not kept beside.

**Cost (Sol's estimate from Cloudflare's published rates, not an observed bill):** `standard-1` (0.5 vCPU, 4 GiB, 8 GB disk) at about $0.047 an hour at 25% CPU and $0.074 at full CPU. 240 awake hours cost about $11.30 to $17.80, plus the $5 a month Workers plan and storage and network charges.

## Why

Will, 06:39:05 on 2026-10-20: "ability to open terminal in an iframe is important."

The old app had a branch terminal (`apps/app/src/mainview/cards/TerminalCard.tsx`, `flows/entries/shell.ts`). `mvp-gaps.md` items 14 and 15 planned an interactive branch terminal and outside CLI agents, and 0005 §5 a job panel. The [web page flow](web-page-flow.md) already gives an iframe embed to build on.

## State

- 06:39:05 on 2026-10-20: Will's priority. 06:40: `launch-panels.py` started Sol's runs. 06:42:01: the lead started Panel B's Opus member and merger, with the terminal as item 2.
- 06:45: Sol's design finished (exit 0) as decisions 3 and 4 plus the infrastructure list above. It names no question for Will.
- By 06:55: Opus's design (`panel-b-opus.md`) and decision `0013-branch-workspace.md` aren't written.
- 06:55:57: Opus's design written, with two draft questions: a native panel instead of a literal iframe (recommended), and who sees a public repository's live branch.
- **07:03:40: decision 0013 written (status: proposed).** It keeps the iframe, so only the visibility question goes to Will.
- **07:20:20 on 2026-10-20: Panel B reported.** It merged Opus's and Sol's designs into decision 0013 (status: proposed) with a comparison appendix. Its decisions:
  - **Conversation:** one per branch, for the branch's life, with id `uuidv5(branch)`. Archive only hides it from your own list; a fresh topic means a new branch.
  - **Terminal:** the `@smthrs/ui` xterm inside an opaque-origin iframe, the frame pattern generated views already use. The page keeps the cookie-authenticated socket. One tmux session per person: the owner types, everyone else watches read-only, and the server drops their input.
  - **Sharing:** by person or link, read or write, never beyond the person's GitHub permission (write needs GitHub write). It never sends a GitHub invitation, and revoking closes the person's sockets (code 1008). Presence and cursors go through one hibernating room object per branch. Branch creation is left to 0012.
  - **First slice:** open a fixture repository's existing branch, ask in its conversation, open its terminal and run `git log` in a real Cloudflare container. Reloading keeps the same shell, and a second branch has its own conversation and terminal. The clone goes through a forge proxy that adds a read token outside the box. The same test runs locally (Docker) and live.
  - **Infrastructure and cost:** one Durable Object-scheduled container application (Debian with git and tmux), two Durable Object classes and one egress entrypoint, all in `alchemy.run.ts`; no new domain or npm dependency. The account already runs Containers for Electric. About $0.047 per awake branch-hour, about $11 a month at 8 hours a day; development under $2 a month.
  - Its `pnpm docs:check` exited 0 on the second run; the first stopped with "All fibers interrupted without error" ([docs check outcome](docs-check-flow-outcome.md)).
- **07:20:40 on 2026-10-20, the lead to Will:** "The branch workspace design is done (decision 0013), and building its first slice has started." And the one question: "on a public repository, should the live branch (conversation, terminals, presence, live edits) be visible only to Members and the people it's shared with? I recommend yes; the code itself stays public." The build uses the recommended answer until Will changes it.
- 07:23:41 to 07:25:38 on 2026-10-20, on disk: `apps/mvp/infra/sandbox/tmux.conf` and `apps/mvp/infra/sandbox/Dockerfile`, the first slice's branch machine. No report.
- **Status moved from designing to in-progress** at the lead's 07:20:40 start of the first slice.
- 07:26:04 to 07:27:06 on 2026-10-20, scratchpad `spike/`, best guess spike S0: `run.mjs` starts Miniflare with a local Docker container engine, a `Sandbox` Durable Object on the image `smithers-branch-sandbox:spike`, and an `Egress` worker. It runs `id`, clones `octocat/Spoon-Knife` through `http://forge.smithers.internal`, prints `git log --oneline -3`, and prints `.git/config`, best guess to show no token is stored. No output on record by 07:37.
- The `Dockerfile` (07:25:38) names the forge proxy `worker/branch/Egress.ts`, which adds the read token outside the box. It isn't on disk by 07:37.
- 07:27:39, the lead to Will: "the branch terminal and per-branch conversations are in progress."
- 07:42:44 on 2026-10-20, on disk: migration `0014_branch_workspace.ts`, the first slice's tables (decision 0013 §1): `branches` (an immutable id; tracked by `branch/Track` from GitHub's refs), `conversations` (one per branch, id the version 5 UUID of the branch's id, so a device knows it offline), `conversation_id` on `messages` and `views`, and `terminal_sessions` (status and machine generation, never bytes). Rows written before it join the conversation of `GITHUB_REPOSITORY`'s `main`, so Will's history stays readable. It imports `src/features/branch/contract.ts`.
- 07:44:54 to 08:05:51 on 2026-10-20, on disk, unreported:
  - `worker/branch/` (07:44 to 07:51): `Access`, `Forge`, `Conversations`, `Branches`, `Sandboxes`, `BranchApi` and `Terminals`.
  - `@smthrs/ui`: `item-conversation/` (07:53:21, changeset `ui-item-conversation`) and `browser/terminal-frame.browser.test.ts` (07:58:22).
  - `src/features/branch/` with the `branch/track` flow (08:00 to 08:03), and `src/features/terminal/` with `terminal/open` (08:02:15).
  - `@smthrs/platform-cloudflare` `ContainerTerminal.ts` (08:01:52), with unit and workerd tests and the guide `attach-a-terminal-to-a-container.md` (08:05:46).
  - `@smthrs/platform-browser` `TerminalSocket.ts` and its test (08:05:51).
- No e2e, GIF or report by 08:07. Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:06 to 08:13 on 2026-10-20, on disk, unreported: `src/features/terminal/` `actions.ts`, `store.ts` and `terminal.ts` (08:09 to 08:10); `infra/BranchSandbox.ts` (08:12:34), `worker/branch/Checkout.ts` (08:12:44) and `src/features/branch/contract.ts` (08:12:57); changesets `platform-cloudflare-container-terminal` (08:06:13), `platform-browser-terminal-socket` and `ui-terminal-frame` (08:13:11).
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the builder** ("Build 0013 first slice: branch convo + terminal", 15:13:32Z) with every other Claude agent, unreported. The limit reset at 10:40.
- **10:42: the lead resumed it** from where it stopped ("the branch workspace"). 10:42:55: `worker/BranchSandboxes.ts` changed. No e2e, GIF or report by 10:44.

- **11:01 to 11:05 on 2026-10-20: [review round 4](review-round-4.md)'s findings on this slice, a light pass on unfinished work. Unrouted by 11:07.**
  - **R4-10 (P1, Fable S-P1-1, reproduced): every clone through `GitProxy` breaks on a compressed upstream.** `packages/effect-code-storage/src/GitProxy.ts:69` forwards `content-encoding` onto a body its `HttpClient` already decoded (`:143-148`); Node's and workerd's `fetch` decode and keep the header, and GitHub compresses `info/refs`. So the branch machine's checkout (`worker/branch/Checkout.ts:14-19` through `worker/BranchSandboxes.ts:138-144`) fails on its first real clone through GitHub. `GitProxy.test.ts` uses a scripted `Response`, which is never decoded. Fix: forward only `content-type` and `cache-control`; test against a real gzip server.
  - **R4-16 (P2, Opus P2-4): every terminal on a branch runs as one Unix user on one tmux server** (`worker/BranchSandboxes.ts:103,110,129`, `SANDBOX_USER`). A Member can `tmux send-keys -t =<other id>` into another person's shell, with that person's tool logins in the shared home. Contradicts 0013 ("each person's terminal runs as that person"). Fix: one Unix user and home per person, or at least a 0700 `tmux -S` socket per person.
  - **R4-18 (P2, Opus P2-7): a Member can track a branch of any repository.** `worker/branch/Branches.ts:54` hard-codes `mayWatch(actor, "public")` and doesn't limit `owner/name` to the deployment's repository; `branch/Forge.ts:39,50` reads with `GITHUB_TOKEN` when Code Storage isn't configured, so a self-hoster's personal token reaches private repositories, and any public repository wakes a container per branch with no cap. Fix: restrict tracking to `GITHUB_REPOSITORY` and check visibility before attaching a credential.
  - **R4-19 (P2, Opus P2-8): a terminal stuck in `opening` locks its person out of that branch** (`worker/branch/Terminals.ts:89-101`, `:178`, `:242`). If the first `terminal/Open` start fails `503`, every later open returns the stuck id and nothing restarts its flow. Fix: start `openExecutionId(row id)` idempotently whenever the row is `opening`; `connect` marks a dead `opening` row lost.
  - **P3s:** the terminal pump runs under a bare `state.waitUntil` (`BranchSandboxes.ts:128`; Fable P3-6, Opus P3-9), which the root rule bans and the import-rules gate already flags; fix with the Durable Object's own WebSocket lifecycle, or write the exception into 0013 and the rule. Opus P3-12: a failed default-branch read records the branch `open`, not `locked`; an attached write socket survives sign-out and a role downgrade; stale file references in `infra/sandbox/Dockerfile:2` and `worker/branch/Sandboxes.ts:6`. Opus P3-10: `TerminalProtocol` caps text frames by characters, not bytes. Fable S-P3-1: `GitProxy` counts a 2xx as `ok` before the pack streams; S-P3-5: `GitProxy` names `forge.smithers.internal` in a library package.
  - Opus's light review: egress is closed (`enableInternet: false`, `GitProxy` limited to upload-pack, the credential added outside the box); "per-person isolation and repository scoping are missing."
- 11:08 to 11:43 on 2026-10-20, on disk, unreported:
  - `worker/branch/`: `Sandboxes.ts` 11:08:29, the new `Users.ts` 11:08:53 (best guess R4-16's per-person user), `Checkout.ts` 11:10:06 and `Forge.ts` 11:10:21;
  - `infra/BranchSandbox.ts` and `infra/sandbox/Dockerfile` 11:16:49;
  - tests `Access`, `Checkout` and `Users` 11:17:16, `Branches` 11:25:38, `Terminals` 11:29:01, `Conversations` and `Forge` 11:42:17;
  - `src/features/terminal/` `actions.ts` 11:12:49 and `components/TerminalPanel.tsx` 11:20:08; `branch/flows.ts` and `terminal/flows.ts` 11:43:03.
  - R4-18, R4-19 and the terminal pump's fixes are tracked in [review round 4](review-round-4.md).
- About 11:35 the second account's weekly limit stopped the builder; the lead resumed it at 11:42:48 ("the branch workspace").
- **11:49 to 11:55 on 2026-10-20: the first e2e runs.** `e2e/branch-workspace.spec.ts` changed at 11:49:13 and 11:55:39. The run that ended 11:55:02 (`apps/mvp/test-results/.last-run.json`) failed 2 tests:
  - "branch terminal: Open terminal runs git log on the branch's machine in a frame, and a reload keeps the shell": the `Terminal` iframe never appeared in 150 s; the page still shows the "Open terminal" button.
  - "branch view … from there and from its URL": the Conversation region shows 2 views where 1 is expected.
  - "branch's conversation only" (11:50:11) and "second branch … machine checkout and shell" (11:53:56) left no error.
- No passing e2e, GIF or report by 11:55.

- 2026-10-20: S1 built locally ([branch-workspace.md](../features/branch-workspace.md)): `0014_branch_workspace`, `branch/track`, conversations per branch, `terminal/open` and the remote `terminal/Open`, `SandboxObject` and its container, the forge proxy (`GitProxy`), `TerminalFrame` and `TerminalSocket`, and `e2e/branch-workspace.spec.ts` against `alchemy dev` with Docker. Not deployed: the live half waits for Will.
- 12:14 on 2026-10-20: status `building` is not a tracker status; set to `in-progress`. 11:58 (the lead to Will): the branch slice's first browser run failed two tests: the terminal never appeared, and a branch view showed twice. The agent is still on it; `e2e/branch-workspace.spec.ts` changed at 12:08:46 and `worker/branch/Terminals.ts` since 12:00; unreported by 12:14.
- 12:25 to 12:58 on 2026-10-20, on disk, unreported: `worker/branch/Sandboxes.ts` (12:25), `Forge.test.ts`, `Terminals.test.ts` and `Branches.test.ts` (12:27); `src/features/terminal/store.ts` (12:49:05) and `terminal.test.ts` (12:53:22); `src/features/branch/conversation.test.ts` (12:57:47). `e2e/branch-workspace.spec.ts` is unchanged since 12:08:46. No passing e2e or report by 12:59.
- 12:59:51 on 2026-10-20: `src/features/branch/conversation.test.ts` and `src/features/terminal/terminal.test.ts` changed.
- 13:06:34: the lander left the branch workspace out of round 2 and waits for this builder to stop before landing all of `apps/mvp` ([land to main](land-to-main.md)).
- 13:11:34, scratchpad `bw0013/full.log`: the builder's full app suite run, 17 failed of 1,234 tests in 10 files, none of them a branch or terminal file (7 in `issues/issues.test.ts`, others in triage, chat controls, agent, Jev, repo, `ShapeProxy` and `db/Database.test.ts`, all other builders' in-flight work). 13:13:43 to 13:15:08 (`bw0013/cov.log`): a two-file run, 70 passed with 8 unhandled errors.
- **13:13:57, the lead:** the dev server was restarted with a 10,000,000-token daily budget, and "I've told the message-controls and branch agents to rerun their live-model tests" ([dev stack hygiene](dev-stack-hygiene.md)). `e2e/branch-workspace.spec.ts` is unchanged since 12:08:46; no passing e2e or report by 13:17.
- **13:29:46 to 13:32:18 on 2026-10-20: `e2e/branch-workspace.spec.ts` passed, 4 tests in 2.5 min** (scratchpad `e2e-results/.last-run.json`): a branch's conversation only; the terminal, where a reload keeps the shell; branch views from there and from its URL; a second branch's own machine, checkout and shell. GIFs in `~/Desktop/smithers-mvp/gifs/branch-workspace/` (13:32:26 to 13:32:29): `branch-workspace-branch-conversation.gif`, `branch-workspace-branch-terminal.gif`, `branch-workspace-branch-views.gif`, `branch-workspace-second-branch-terminal.gif`.
- **13:42:00, the builder's report:** "The 0013 first slice is finished ... All the review findings are fixed and tested." Fixed this round: the `openTerminal` helper hung when a terminal was already open, and the reload test lost its last keystroke. New unit tests: `worker/flows/TerminalOpen.test.ts` and conversation tests in `ExecutionHost`, `Views`, `Chat` and `ShapeProxy`; `worker/branch/*.ts` and migration `0014` joined the coverage gate at 100%. The client-tests sub-agent fixed 6 bugs; the worst, a 365-day timer overflowed and closed the terminal panel about 1 ms after attach. Also fixed: Retry didn't restart branch shapes; a late answer could overwrite the next branch's page or terminal; `/web` let a person type `conversationId`.
- Still red outside the slice: `importRules` and the worker typecheck each fail once in `worker/ExecutionHost.test.ts`; the full unit suite has 11 failures in 8 files (Database 0019, a `chat/Expire` handoff test, chat, telemetry and boot). Known gaps: Retry doesn't reconnect a branch's views shape; a cut-short Electric live response can lose a row on a device ([the packages](effect-tanstack-db-and-effect-electric.md)).
- The builder also added an `allow` list to `rootImportsOnly` and allowed `@smthrs/ui/adapters/*` for `TerminalPanel.tsx` and `RepoPage.tsx`, which Will's 13:31 answer replaces ([repo-view package split](repo-view-package-split.md)).
- **13:43:30, the lead to Will:** "The branch workspace is finished. Each branch has its own conversation and a real shell in a terminal panel, and reloading the page brings back the same shell." To try it: open `http://localhost:1337/octocat/Spoon-Knife/tree/test-branch`, click Terminal, then Open terminal, run `git log` and reload; then open `/tree/change-the-title`. The lead started [branch sharing](branch-sharing.md), the [agent in the sandbox](connect-agents-sandboxes-forge.md), the sync bug and landing round 3.
- **Status moved from in-progress to done.** Nothing is deployed.

## Next

From 13:42 on 2026-10-20: lands in round 3 ([land to main](land-to-main.md)). Follow-ups: Retry reconnects the views shape (the [P3 cleanup](review-round-4-p3-cleanup.md)); the first deploy proves the container on Cloudflare.

Until 13:46 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: the first slice's report as before, and the lead's routing of round 4's R4-10, R4-16, R4-18 and R4-19 ([review round 4](review-round-4.md)). R4-10 breaks the first real clone through GitHub, so the slice's live test can't pass without it. Nothing is deployed.

Until 11:07 on 2026-10-20 the next step was, from 07:20 on 2026-10-20: the first slice's report: a branch's terminal in its iframe running `git log` in a real container, the same shell after a reload, and a second branch with its own terminal, tested locally on Docker. Nothing is deployed.

Until 07:20 on 2026-10-20 the next step was, from 07:03 on 2026-10-20: spike S0, then S1's terminal track. Will's answer to 0013's question decides the shapes' authorization.

Until 07:03 the next step was: Opus writes its design, waits for Sol's (done), and merges both into 0013 (status: proposed). The first build is the walking skeleton above. It is also the first real per-branch sandbox, so it starts [sandboxes](sandboxes.md) and needs the [sandbox budgets](sandbox-budgets.md) Will deferred until we ship.

## Questions for Will

- Q1 of 0013: on a public repository, is the live branch (its conversation and history, terminals, presence and live edits) visible only to Members and the people it's shared with? Recommended: yes. It narrows 0007's "watching a branch live: anyone if public"; the code stays public. The first slice's shape authorization depends on it; if no, every visitor can watch every terminal. (Asked by the lead at 07:20:40 on 2026-10-20; the first slice builds on yes until Will changes it.)

Until 07:03: None yet. Panel B sends at most 3 with 0013. Sol's recommended defaults: sleep ends shell processes, and Guests never type into a branch shell.
