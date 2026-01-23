# SmithersHub PRD

## Glossary

| Term | Definition |
|------|------------|
| SmithersHub | The web app for developing Smithers |
| Smithers | The offline React executor (background automation) |
| Chat | The user-facing interface (Cloudflare Durable Object) |
| Queue | The boundary between Chat and Smithers |
| Frames | Snapshots of the React tree at each tick |
| Tick | One iteration of the Smithers render loop |
| Costume | A Smithers persona for a specific workflow |
| Repro | Minimal reproduction (for bugs) |
| Prototype | Code example (for feature requests) |
| Vibe | The experimental branch maintainers can merge to |

## Vision

Self-improving open source project where all code changes flow through Smithers. roninjin10 as BDFL, humans and AI agents as contributors with tiered permissions.

**Scope: Single-tenant. This is the UI for developing Smithers itself—one repo, one project.** Future: recipes for others to build their own, not a multi-tenant platform.

## Core Concept

```
┌─────────────────────────────────────────────────────────────────┐
│  All changes → Smithers → Approved by human → Merged           │
│  No direct commits. Every update is a Smithers-orchestrated run │
│  Repo: github.com/evmts/smithers (the only repo)               │
└─────────────────────────────────────────────────────────────────┘
```

## Auth & Permissions

Sign-In With Ethereum (SIWE). Auto-create in-browser wallets for anonymous users.

| Tier | Branch Access | Model Access |
|------|---------------|--------------|
| Admin | main (merge), vibe | Opus |
| Maintainer | vibe (merge freely), main (open PRs only) | Opus |
| Contributor/Reader | Requires approval | Cheap/fast |

## Permissions Matrix

| Action | Admin | Maintainer | Contributor/Reader |
|--------|-------|------------|-------------------|
| Ask code questions | ✅ | ✅ | ✅ |
| Create issue | ✅ | ✅ | ✅ (needs repro) |
| Respond in issue thread | ✅ | ✅ | ✅ (needs approval) |
| Approve user answers | ✅ | ✅ | ❌ |
| Approve queue injection | ✅ | ✅ | ❌ |
| Run smart model | ✅ | ✅ | ❌ |
| `/gh` read commands | ✅ | ✅ | ✅ |
| `/gh` write commands | ✅ | ✅ | ❌ |
| Merge to vibe | ✅ | ✅ | ❌ |
| Merge to main | ✅ | ❌ | ❌ |

**Two branches:**
- `main` — only admin can merge. Maintainers can open PRs to it.
- `vibe` — maintainers and robots merge freely. Experimental/WIP.

**Promotion flow:**
1. Admin cherry-picks from vibe → main
2. Rebase vibe on top of main
3. CI/CD gates both branches (hard to break even vibe)

**The robot:** One Smithers process runs continuously, event-driven (like GitHub Actions).

**Events that trigger Smithers:**
- User sends a chat message
- Issue created/updated
- CI failure
- Scheduled tasks
- Any webhook-able event

**Two systems:**

| System | Location | Purpose |
|--------|----------|---------|
| Chat | Cloudflare Durable Object | Interactive, user-facing interface |
| Smithers | Container, offline | Background executor (like GitHub Actions) |

- **Chat** = the interface (what users interact with)
- **Smithers** = the automation (offline, isolated, never directly accessed)
- **Queue** = hard security boundary between them
- Context injection into Smithers requires approval
- Users never talk directly to Smithers—they talk to Chat

## Per-Tier Apps

Each tier gets a specialized frontend. Backend/API is the same (or subset).

| Tier | What's Different |
|------|------------------|
| Admin | Sees everything, approval queues, destructive actions |
| Maintainer | Approval queue for their scope, vibe branch access |
| Contributor/Reader | Simplified view, issue creation, code browsing |

All look like a chat app. The difference is what's surfaced in the UI, not backend capabilities.

Anonymous users get scoped-down permissions. Cannot access main compute—sandboxed via Cloudflare.

## Features

### Chat Interface
- ChatGPT/T3-style UI
- Vim mode enabled by default
- Skills: LLM can invoke skills to render rich UI (forms, widgets, etc.)

### Navigation
- Main view = chat (full screen, single focus)
- Other views (code, frames, issues) accessed via modal or bottom nav
- No always-visible tab bar cluttering the UI
- Chat is context-aware (knows what you're browsing)
- Desktop: keyboard shortcuts available but UI stays clean

### Search
- Backend data: ask the LLM (not investing heavily here)
- Frontend data (local): searchable
- Commands: searchable (slash command autocomplete)

### Slash Commands

**Session commands (from plue TUI):**
- `/new` — create new session
- `/sessions` — list sessions
- `/switch <id>` — switch session
- `/model [name]` — list/set model
- `/effort [level]` — set reasoning effort
- `/undo [n]` — undo turns
- `/mention <file>` — include file
- `/diff` — show diffs
- `/abort` — stop current task
- `/clear` — clear screen
- `/help` — show help
- `/quit` — exit

**SmithersHub-specific:**
- `/frames` — view Smithers execution frames
- `/issue` — create issue

**GitHub CLI proxy:**
Everything the GitHub app can do, available via `/gh`. Examples:
- `/gh issue list/view/create`
- `/gh pr list/view`
- `/gh repo view`
- `/gh search`
- `/gh browse`

Cached within reason. Isomorphic: same Zig code runs in CLI and browser (WASM).

**Security:** Commands that mutate auth/config/secrets are blocked.

### What Anonymous Users Can Do
- ✅ Ask questions about the code ("How does the reconciler work?")
- ✅ Open issues (bug reports, feature requests)
- ❌ Request code changes directly

### Bug Reports / Feature Requests

**Repro/Prototype requirement:**

| Type | External | Internal |
|------|----------|----------|
| Bug | Must provide StackBlitz repro + prompt | Auto-generated |
| Feature | Must provide prototype code + prompt | Auto-generated |

**Important:** We may not use your code directly. We regenerate from your prompt. Your code is context only.

**Issue States:**
```
Draft → Needs Repro/Prototype → Pending Approval → Active → Queued for Smithers → In Progress → Resolved
                                                        ↘ Stale Warning → Closed
```

**Opening an issue:**
1. Provide repro/prototype + prompt upfront → issue created (pending approval)
2. Internal users: Smithers generates repro/prototype automatically

**If Smithers builds reproduction:**
- Smithers asks clarifying questions
- Every user answer requires maintainer approval before Smithers sees it
- Async flow: user waits for maintainer
- This is a public thread—anyone can respond

**Rate limiting:**
- Per-account limit on issue creation rate
- Requests queued to prevent DOS

**Stale bot:**
- Part of the Smithers event loop (Ralph), not a separate scheduler
- Issues go into queue, processed on each tick
- Cheap model checks if issue is worth keeping open
- User gets one chance to respond and convince
- No response or unconvincing → auto-closed

### Approval Flow
- External issues require maintainer approval to become real issues
- On approval, can optionally run smart model for deeper analysis

### Smithers Costumes
Each workflow type gets its own Smithers persona:
- Different name
- Different personality
- Different system prompt
- Different model (cheap for external, Opus for internal)

Examples:
- Customer Service Smithers: terse, don't-waste-my-time attitude (bug triage)
- Stale Bot Smithers: challenges whether issues are worth keeping
- Code Smithers: helpful, thorough (for maintainers making changes)

Only share a costume if two workflows are exactly the same.

### Code Changes

**You cannot submit code directly. You can only prompt.**

Flow:
1. Contributor describes the change to Smithers (can paste code as part of prompt)
2. Smithers writes/applies the code
3. Maintainer reviews
4. Merge

No PRs in the traditional sense. You prompt, Smithers implements, maintainer approves.

**VCS:**
- JJ (Jujutsu) based, not git
- Treat changes as changesets

### Frames Viewer
- Looks like React DevTools
- Shows React tree at each tick
- Click into component (e.g., Claude) → see chat log
- Click further → see thinking, tool calls, etc.
- Perfect rewind/fast forward through history

**Snapshots:**
- JJ versions everything continuously
- SQLite snapshots on commits
- Can scrub through any point in time

### Code Browsing
- Full Monaco viewer (read-only)
- Syntax highlighting
- LSP support (Zig, Rust, TypeScript)
- Zig → WASM compilation in browser
- Local execution in browser

**No direct editing.** To change code, you chat with Smithers.

### Docs
- Astro static site at `/docs`
- `/docs` slash command for LLM-powered search

## Entry Points

Anonymous visitor has exactly two options:
1. **View README** — Landing page is the README (explains Smithers)
2. **Open Chat** — Click into the chat app, talk to Smithers

No other actions available until you're in the chat.

## Notifications

MVP: In-app only. No email or push notifications.

Users check back or stay connected to see updates.

## Scope Philosophy

**UI is free, full-stack is expensive.**

- UI elements: full scope (Monaco, LSP, syntax highlighting, etc.)
- Full-stack features: cut scope (LLM features, backend storage, verification)

**Non-hermetic operations (web search, etc.):**
- Must be cached
- Verification deferred post-MVP

## Success Metrics

- Onboarding at each level (reader → contributor → maintainer)
- Self-sustaining: more automation over time, less manual intervention
- Smithers improving itself

## Non-Goals (for now)
- Syncing between client and server (things live on one or the other)
- Non-crypto auth flows
- Direct code editing outside Smithers
- Email/push notifications
- Branch merging UI (admin does manually)
- Verification of cached non-hermetic data
- Tutorials or onboarding flows (just land in chat)
