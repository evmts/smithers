# SmithersHub Engineering

## Architecture

**Three services:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. FRONTEND (Cloudflare)                                               │
│     ├── Astro static pages (docs, code browsing, per-tier apps)         │
│     └── SolidJS island (chat widget)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  2. CHAT SERVICE (Cloudflare)                                           │
│     ├── Vercel AI SDK                                                   │
│     ├── Durable Objects (owns model calls)                              │
│     └── Authenticated tool calls → Monolith                             │
├─────────────────────────────────────────────────────────────────────────┤
│  3. MONOLITH (Docker Container)                                         │
│     ├── Rust shell (HTTP server, filesystem, JJ, CLI)                   │
│     ├── Zig core (embedded via FFI)                                     │
│     ├── Bun (Smithers React runtime only)                               │
│     ├── SQLite (all durable state)                                      │
│     └── SuperSmithers (meta-agent, self-improvement)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Platforms:**
- Web only (Astro + SolidJS)
- CLI (Rust wrapper around Zig core)
- No native desktop/mobile app (cut from MVP)

**Per-tier apps:** Admin, Maintainer, Contributor/Reader each get their own app. May share components but designed separately. Building UI is cheap—don't force one-size-fits-all.

**CLI-first:** All logic lives in Zig core. CLI and web are thin wrappers. Every feature accessible via CLI.

## Key Constraints

1. **Single Docker container** — Predictable, reproducible. SQLite for all state.
2. **All model calls through our endpoint** — Control costs, permissions, rate limits.
3. **JJ required** — Changesets, not git branches. Need container for JJ.
4. **No syncing** — Data lives on client OR server, not both.

## Language Preferences

| Context | Language | Rationale |
|---------|----------|-----------|
| Core library | Zig | Portable, WASM-ready |
| External world (HTTP, filesystem, CLI, JJ) | Rust | System integration |
| Smithers runtime only | Bun | React execution |
| Cloudflare | Bun + Zig WASM | Edge compute |
| Frontend | TypeScript + Zig WASM | Browser |

**Layering:**
```
┌─────────────────────────────────────────┐
│  Rust (main executable)                 │
│  - HTTP server                          │
│  - CLI app                              │
│  - Filesystem, JJ integration           │
│  - Contains Bun for Smithers runtime    │
├─────────────────────────────────────────┤
│  Zig core library (embedded via FFI)    │
│  - Core logic, portable                 │
│  - WASM-compatible (no hard syscalls)   │
│  - Pluggable: filesystem, SQLite        │
├─────────────────────────────────────────┤
│  Bun (only for Smithers React runtime)  │
└─────────────────────────────────────────┘
```

**Rules:**
- Zig = core library, must be WASM-portable at all times
- Rust = external world, not portable, not core
- Bun = only for executing Smithers (React runtime)
- Zig core embedded in Rust apps via FFI
- Zig WASM embedded in Cloudflare/frontend

**Pluggability (for WASM compat):**
- Filesystem = pluggable
- SQLite = pluggable
- No hard dependencies on system calls

**Isomorphic slash commands:**
- Core logic in Zig
- Compiles to WASM for browser
- Thin platform wrappers (CLI vs browser)
- Same API, two execution contexts

## Storage

**SQLite everywhere.** Consistent storage layer across all tiers.

| Location | What | Tech |
|----------|------|------|
| Browser | User history, preferences, drafts | SQLite (OPFS) |
| Cloudflare | Global state, agent runs | D1 (SQLite) |
| Container | Repo files, Smithers frames, issues | SQLite |

## Versioning / Snapshots

- JJ versions everything continuously (React tree, file changes)
- SQLite snapshots on commits
- **Engineering concern:** Verify JJ can version SQLite properly. If not, store SQLite snapshots separately.

## Monolith Deployment

- **Single instance** — Zig scales to insane user counts, likely never need more
- **Platform:** Fly.io or Railway (simple, not overkill)
- **Infra:** Terraform
- **Not:** GCP, AWS (overkill for this)

## Auth Flow (User → Cloudflare)

1. Browser creates in-app Ethereum wallet (Porto SDK)
2. SIWE signature → Cloudflare verifies
3. Cloudflare issues JWT with permission tier
4. All requests include JWT
5. Model selection based on tier

## Auth Flow (Cloudflare → Monolith)

1. Durable Object generates internal JWT containing:
   - User wallet address
   - Permission tier
   - Expiry
2. Signed with shared secret (Cloudflare secrets + monolith env)
3. Monolith verifies HMAC signature, extracts tier, authorizes
4. Future: add Cloudflare Access (Zero Trust) for defense in depth

## Agent Architecture

- Agents run as Durable Objects (Cloudflare)
- Durable Object owns the model call
- Results written to D1 or forwarded to container
- Trusted operations (JJ, file writes) require container

## GitHub CLI Parity

Slash commands map to `gh` CLI:
- `/gh repo view` → show repo info
- `/gh issue create` → create issue
- `/gh pr list` → list PRs

Proxy through GitHub CLI where possible. Cache responses within reason.

## Issue Reproductions

- Require GitHub repo that runs in StackBlitz
- LLM validates reasonableness (no automated execution for MVP)
- Maintainers create in org, external users on their own account

## Smithers Costumes

Each workflow type = different Smithers persona:
- Different system prompt
- Different model (cheap for external, Opus for internal)
- Same underlying API

Examples: Customer Service Smithers, Stale Bot Smithers, Code Smithers

## Rate Limiting

- Per-account limit on issue creation
- Requests queued to prevent DOS
- Handled by Cloudflare edge

## Chat Service Details

- Uses Vercel AI SDK
- One Durable Object per user
- Supports multiplayer (multiple users/agents in same chat)
- Makes authenticated tool calls to monolith
- Chat is aware of all open tabs
- Multiple chat instances can exist, all share context

## State Architecture (Flux)

- Single source of truth: Smithers (SQLite + repo)
- All events flow through Smithers
- Time-travelable and replayable
- Multiplayer = multiple participants in the event log
- No special sync logic—just SQLite

## Security Boundary: Chat → Queue → Smithers

```
┌─────────────────┐     ┌─────────┐     ┌─────────────────┐
│  Chat (Durable  │ ──► │  Queue  │ ──► │  Smithers       │
│  Object)        │     │ (CF Q)  │     │  (React, offline)│
└─────────────────┘     └─────────┘     └─────────────────┘
```

- Chat is the interface (user-facing)
- Queue is Cloudflare Queues (infrastructure as code)
- Smithers is the executor (completely offline/isolated)
- Context injection into Smithers requires approval
- No web search in Smithers without explicit approval
- This is like GitHub Actions: background automation, not interactive

## Queue Contract

- **Infrastructure:** Cloudflare Queues
- **Ordering:** Per-issue FIFO
- **Retries:** 3 attempts, exponential backoff
- **Dead-letter:** After 3 failures → manual review queue
- **Idempotency:** Event IDs prevent duplicate processing

## Service Communication

```
Frontend → Cloudflare (always) → Chat Durable Object → Monolith
                              ↘ Direct proxy for read-only data
```

- Frontend can only talk to Cloudflare
- Everything is proxied through Cloudflare edge
- Chat Durable Object handles stateful sessions
- Monolith accessed via authenticated tool calls from Durable Object

## API Protocol

**REST + OpenAPI/Swagger**

- Maps cleanly to CLI endpoints
- All service-to-service communication
- Cloudflare ↔ Monolith

**Future adapters:**
- MCP
- GraphQL

**Chat streaming:** Whatever Vercel AI SDK uses (SSE)

## Error Handling

- Type-safe errors (never surprised by unexpected errors)
- Handle each error case granularly
- No generic catch-all handlers
- Engineering goal: errors shouldn't happen

## Frontend Capabilities (no backend required)

- Monaco viewer (read-only) with LSP (Zig, Rust, TypeScript)
- Zig → WASM compilation in browser
- Local code execution in browser
- Local SQLite for user history/preferences
- Command search/autocomplete

## Reference Code

**Plue** (`/Users/williamcory/plue`) — reference only, not forking.

Use as reference for:
- SIWE auth (Porto SDK patterns)
- JJ FFI integration
- Zig TUI (chat UX patterns)
- Terraform structure

**Starting fresh.** Don't anchor to plue's architecture.
