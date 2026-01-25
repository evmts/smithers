# Zig TUI Implementation Review

**Date:** 2026-01-24
**Scope:** tui/src/ - Full Zig TUI codebase review
**Status:** Action items identified

---

## TL;DR

Strong architecture (DI, renderer abstraction, comptime generics, scratch arena usage), but **serious correctness risks around ownership/lifetimes and concurrency**. Also **high-impact performance traps** (markdown parsing per frame). Fix P0 items before any feature work.

---

## P0: Critical Bugs (Fix Immediately)

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| Double-deinit of agent_thread | `App.deinit()` + `App.run()` both call `agent_thread.deinit()` | HIGH | Remove defer from `run()` or make deinit idempotent with `started` flag |
| Dangling pointers in context | `agent.zig` - tool call strings freed while still referenced in `self.context` | HIGH | Deep-copy tool call fields when adding to context |
| Thread-unsafe SQLite | DB pointer shared between main + agent threads | HIGH | Use separate connections per thread + WAL mode |
| Unstable renderer reference | `ChatHistory.last_renderer` may reference invalid buffers | MEDIUM | Store stable handle or capture data during render |

### Details

#### 1. Double-Deinit Bug

```zig
// App.deinit() always calls:
self.agent_thread.deinit();

// App.run() also does:
defer self.agent_thread.deinit();

// main() defers app.deinit() after run()
// Result: double free / thread join twice / UB
```

**Fix:** Remove `defer self.agent_thread.deinit()` from `run()`, or add idempotent guard.

#### 2. Dangling Pointers in Agent Context

In `runLoop()`:
- `response.addToolCall()` deep-copies `id/name/arguments` into response allocator
- `dupe(types.ToolCallInfo, tc_infos.items)` only copies structs, not strings
- `Message.assistantWithToolCalls(..., tc_slice)` appended to `self.context.messages`
- When `response.deinit()` called, strings freed → **dangling pointers in context**

Same issue in `executeTools()` where `Message.toolResult(tc.id, ...)` stores `tc.id`.

**Fix:** Deep-copy tool call fields into context-owned memory when appending messages.

#### 3. Thread-Unsafe SQLite

```zig
// App.run() gives agent thread &self.database
// Main thread also uses self.database in key handling
// SQLite connections NOT safe for concurrent access
```

**Fix:** 
- Use separate SQLite connections per thread
- Enable WAL mode
- Add busy timeout/retry

#### 4. Unstable Renderer Reference

`ChatHistory` stores `last_renderer: ?R` and later calls `renderer.window.readCell`. If underlying buffers are ephemeral, this references invalid state.

**Fix:** Store only stable handles, or extract data immediately during render.

---

## P1: Architecture & API Consistency (High Impact)

| Issue | Impact | Effort |
|-------|--------|--------|
| Duplicate provider abstractions | Cognitive load, rot risk | L |
| Hardcoded DB type in AgentLoop | Breaks DI pattern | S |
| Silent error swallowing | Hard to debug | M |

### Duplicate Provider Abstractions

Two parallel stacks:
- `agent.zig` + `provider.zig` (vtable `ProviderInterface`)
- `agent/loop.zig` using different interface

**Action:** Pick one provider abstraction. Make `agent` module depend only on that interface.

### Hardcoded DB Type

```zig
// loop.zig does:
const Database = db.Database(@import("sqlite").Db);
// Breaks the DI pattern used elsewhere
```

**Action:** Make `AgentLoop` generic over `Db`.

### Silent Error Swallowing

Many places do:
```zig
database.addMessage(...) catch {};
chat_history.reload(...) catch {};
tool_executor.execute(...) catch {};
```

**Action:** Log at minimum `.warn` level. Show system message for user-relevant failures.

---

## P2: Memory Management (Medium Impact)

| Issue | Risk | Fix |
|-------|------|-----|
| Ambiguous allocator ownership | Use-after-free | Document conventions, use arena naming |
| No leak checks in tests | Undetected leaks | Check `gpa.deinit()` result |

### Allocator Ownership Convention

`serializePendingTools()` returns `buf.items` without `toOwnedSlice()`. Safe only if allocator is arena reset soon.

**Action:** Adopt clear convention:
- `fn foo(alloc) ![]u8` → caller owns, must free
- `fn foo(arena) ![]const u8` → arena-backed, document lifetime
- Consider naming: `scratch_alloc`, `arena_alloc`

### Leak Detection

```zig
// In main.zig debug builds:
const result = gpa.deinit();
if (result == .leak) {
    std.debug.print("Memory leak detected!\n", .{});
    return error.MemoryLeak;
}
```

---

## P3: Performance (Optimize After Correctness)

| Issue | Impact | Fix |
|-------|--------|-----|
| Markdown parsed twice per message per frame | High CPU | Cache parsed output + heights |
| Allocations in hot path | GC pressure | Use `getFirstLine()` not `getText()` |
| Width uses bytes not cells | Layout bugs | Add cell width helper for UTF-8 |

### Markdown Parsing Hotspot

```zig
// ChatHistory calls both per frame:
getMessageHeight()    // parses markdown
drawMarkdownMessage() // parses again
```

**Fix:** Cache per message:
- Parsed markdown lines
- Computed height
- Wrapped layout for current width

Invalidate on width change or content change.

### Hot Path Allocations

```zig
// Input.getAutocomplete() allocates every frame:
getAutocomplete() → getText() → allocates
drawInWindow() → getAutocomplete() // every frame!
```

**Fix:** Use `getFirstLine()` to match prefixes without allocating.

### Width Calculation

Renderer methods size regions with `text.len` (bytes), not displayed cell width (UTF-8 graphemes, double-width chars).

**Fix:** Add cell width helper in rendering layer. Even conservative fallback better than misalignment.

---

## Effort Estimates

| Priority | Items | Effort |
|----------|-------|--------|
| P0 | 4 critical bugs | M-L (1-2 days) |
| P1 | 3 architecture fixes | L (1-2 days) |
| P2 | 2 memory items | S-M (few hours) |
| P3 | 3 performance items | M-L (varies) |

---

## Guardrails

- **Concurrency:** Switching to multiple sqlite connections requires WAL mode + busy timeouts
- **Ownership refactor:** Changing who owns tool call strings ripples through APIs. Pick one rule ("context owns everything it stores")
- **Caching:** Must invalidate on resize and message updates. Add debug asserts for cache hits/misses

---

## Related Issues

- Thread safety and DB concerns overlap with [issues/002-control-plane-tests.md](../issues/002-control-plane-tests.md)
- Test coverage for Zig code not yet audited (separate from TypeScript audit in [10-test-coverage-audit.md](./10-test-coverage-audit.md))
