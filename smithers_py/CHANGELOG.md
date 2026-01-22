# Changelog

All notable changes to smithers-py will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-21

### Added

- **Core Runtime**
  - 7-phase tick loop (snapshot → render → reconcile → commit → execute → effects → flush)
  - SQLite-backed durable state with transitions audit log
  - Volatile in-memory state with batching semantics
  - Frame coalescing (250ms throttle) with immediate triggers for task completion

- **Node System**
  - Base nodes: TextNode, FragmentNode
  - Structural nodes: IfNode, EachNode
  - Control nodes: PhaseNode, StepNode, WhileNode, RalphNode
  - Agent nodes: ClaudeNode, SmithersNode with event handlers (on_finished, on_error, on_progress)
  - Effect nodes: EffectNode, StopNode, EndNode
  - JSX runtime returning Pydantic node objects

- **Agent Runtime**
  - PydanticAI-based Claude executor with streaming support
  - Tool call tracking and persistence
  - Session persistence and resumability (continue/restart/fail modes)
  - Rate limit coordination with global backoff
  - Retry with exponential backoff and jitter

- **Reliability Features**
  - Deterministic SHA256 node identity (not Python's salted hash)
  - Task lease management for crash safety
  - Orphan recovery on startup
  - Cancellation handler with proper cleanup
  - Frame storm prevention with loop detection
  - Render purity enforcement (no writes during render phase)
  - Handler atomicity with transaction rollback

- **State & Signals**
  - Signal and Computed primitives
  - Dependency tracking for reactive reads
  - ActionQueue with deterministic ordering
  - Conflict resolution (last write wins, reducers for updates)

- **MCP Server**
  - Transport-agnostic core with JSON-RPC handling
  - Stdio transport for CLI integration
  - Streamable HTTP transport with SSE
  - Security: localhost binding, Origin validation, Bearer auth
  - Session management with event resumability
  - Resources: executions, frames, nodes, artifacts, approvals
  - Tools: execution control, node control, state control, approval handling

- **Additional Features**
  - VCS/Worktree integration (Git, JJ) with graceful degradation
  - NDJSON logging with summarization
  - Artifacts API (markdown, table, progress, link, image)
  - Approval system with pending queue
  - Loop/Phase registries with persistence
  - FileSystem context with operation tracking and hashing

- **CLI**
  - `smithers-py run script.py` - Execute orchestration scripts
  - `smithers-py serve --port 8080` - Start MCP HTTP server
  - Support for `.px` (Python JSX) files via python-jsx transpiler

### Dependencies

- pydantic >= 2.0
- pydantic-ai >= 0.1.0
- aiosqlite >= 0.20.0
- python-jsx (optional, for .px file support)

[Unreleased]: https://github.com/evmts/smithers/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/evmts/smithers/releases/tag/v1.0.0
