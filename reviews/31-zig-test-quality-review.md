# Zig Test Quality Review

**Date:** 2026-01-24
**Scope:** tui/src/tests/ - Test file quality and correctness
**Status:** Action items identified

---

## TL;DR

Test structure is generally sound, but there are **compile errors**, **ownership contract bugs**, **platform portability issues**, and **semantic inconsistencies** that need fixing. Priority: fix compile errors → fix ownership bugs → add platform guards.

---

## P0: Compile Errors (Fix Immediately)

### 1) `width` tests - Invalid slice on integer

```zig
// BROKEN - calculateWidth returns u32, not sliceable
try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("[]{}<>")[0..5].len);

// FIX - Either test full width:
try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("[]{}<>"));

// Or slice the input string:
try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("[]{}<>"[0..5]));
```

### 2) `git` tests - Type mismatch in expectEqual

```zig
// RISKY - comparing union value to tag
const func_info = @typeInfo(@TypeOf(git.runGitDiff));
try std.testing.expectEqual(.@"fn", func_info);

// FIX - use expect with equality
try std.testing.expect(func_info == .@"fn");
```

---

## P1: Ownership Contract Bugs (Memory Leaks/UB)

### Truncate tests - Inconsistent ownership

```zig
// These tests DON'T free result.content:
const result = truncate.truncateTail(allocator, "", .{});
try std.testing.expectEqualStrings("", result.content);

// But these tests DO free:
const result = truncate.truncateTail(allocator, "hello", .{});
defer allocator.free(result.content);
```

**Problem:** Non-uniform ownership. Either:
- Always allocate (even for empty) so callers always free
- Return `owned: bool` flag alongside content
- Return `content: []const u8` and `owned_buffer: ?[]u8`

**Action:** Fix truncate API to have uniform ownership, then update all tests.

---

## P2: Platform Portability

### POSIX/Linux-only code

| Issue | Location | Fix |
|-------|----------|-----|
| `std.posix.geteuid()` | write_file tests | Guard with `builtin.os.tag` |
| `/proc/...` paths | write_file tests | Linux-only, add OS guard |
| `/tmp/...` hardcoded | Multiple tests | Use `std.testing.tmpDir()` |

```zig
const builtin = @import("builtin");
if (builtin.os.tag != .linux) return error.SkipZigTest;
```

### Replace hardcoded `/tmp` paths

```zig
// BEFORE - collision prone, not portable
const test_path = "/tmp/write_file_test/test.txt";

// AFTER - isolated, portable
var tmp = std.testing.tmpDir(.{});
defer tmp.cleanup();
const test_path = try tmp.dir.realpathAlloc(allocator, "test.txt");
```

---

## P3: Test Quality Improvements

### A) Missing content verification

| Test | Issue |
|------|-------|
| `write_file with newlines in content` | Only checks `success`, not actual file content |
| `wrapTextWithAnsi style reset mid-wrap` | Only checks line count, not line content |

### B) Brittle size/alignment assertions

```zig
// These break on any field addition:
try std.testing.expectEqual(@as(usize, 48), @sizeOf(types.ToolCallInfo));
try std.testing.expect(@sizeOf(types.Message) <= 128);
```

**Keep only if:** enforcing ABI stability for FFI/serialization.
**Otherwise:** Remove or change to generous upper bounds.

### C) Tab width semantics unclear

Tests imply **fixed tab width = 3**:
- `"\t"` => 3
- `"a\tb"` => 5

But this test seems inconsistent:
```zig
try std.testing.expectEqual(@as(u32, 13), width.calculateWidth("a你😀\t\nb"));
// Expected breakdown: a=1, 你=2, 😀=2, \t=3, \n=0, b=1 → 9, not 13
```

**Action:** Reconcile tab/newline handling and document in `width.zig`.

### D) Arabic/Hebrew/Thai width expectations suspect

```zig
try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("مرحبا")); // 5 letters
try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("שלום"));  // 4 letters
try std.testing.expectEqual(@as(u32, 10), width.calculateWidth("สวัสดี")); // Thai marks usually 0-width
```

**Action:** Verify against your Unicode width table. Add comment explaining ruleset.

### E) Glob semantics non-standard

```zig
try std.testing.expect(glob.matchesPattern("file.zigabc", "*.zig")); // matches!
```

Standard glob: `*.zig` means suffix `.zig`, so `file.zigabc` should NOT match.

**Action:** Decide if this is intentional substring matching and document.

---

## Module-Specific Notes

### truncate.zig tests

**Good:**
- Clear tail/head separation
- Line-count and byte-count truncation
- Trailing newline handling

**Missing:**
- MAX_LINE_LENGTH (300) never exercised
- UTF-8 safety for byte truncation (can split multi-byte sequences)
- Combined constraints precedence (max_lines + max_bytes both exceeded)

### agent/types.zig tests

**Good:**
- Convenience constructor coverage
- EventType enumeration

**Issue:**
```zig
// Brittle - will break on model updates
try std.testing.expectEqualStrings("claude-sonnet-4-20250514", config.model);
// Better: assert config.model.len > 0, or test against exported constant
```

### undo.zig tests

**Good:**
- Deinit leak/double-free coverage
- Snapshot coalescing behavior

**Missing:**
- Redo stack clearing after push-post-undo
- Coalescing boundaries around whitespace/newlines

### vim.zig tests

**Good:**
- Excellent key enumeration
- `pending_g` behavior and cancellation
- Mode preservation test

**Future:** Add count tests (`3j`) and operator-pending (`dw`) if implemented.

### width.zig tests

**Good:**
- ANSI stripping thorough
- `sliceByColumn` and wrapping coverage

**Fix:** Compile error, tab semantics reconciliation

**Missing:**
- ZWJ emoji cluster tests (family emoji, skin tones)

### write_file.zig tests

**Good:**
- Validation coverage (missing params, cancellation)
- Registry integration
- Access denied negative case

**Missing:**
- Content with quotes/backslashes (JSON escaping)
- Path points to existing directory
- Path with `..` segments

---

## Test Structure Recommendation

### Current issue
Multiple test sections with repeated `const std = @import("std");` will cause redeclaration errors if concatenated.

### Solution A: Separate files (recommended)

```
tui/src/tests/
├── db_test.zig
├── edit_file_test.zig
├── editor_core_test.zig
└── ... (one file per module)
```

Run via build.zig test step or aggregator:
```zig
// tests.zig
test "all tests" {
    _ = @import("db_test.zig");
    _ = @import("edit_file_test.zig");
    // ...
}
```

### Solution B: Namespace if single file required

```zig
const std = @import("std");

const db_tests = struct {
    const db = @import("../db.zig");
    test "Role toString" { /* ... */ }
};

const edit_file_tests = struct {
    const edit_file = @import("../agent/tools/edit_file.zig");
    test "edit creates file" { /* ... */ }
};
```

---

## Session delete test bug

```zig
// This is a no-op - switches to current session
database.switchSession(database.current_session_id);

// Should capture original first:
const original = database.getCurrentSessionId();
const session_to_delete = try database.createSession("temporary");
database.switchSession(session_to_delete);
// ...
database.switchSession(original);
try database.deleteSession(session_to_delete);
```

---

## External tool dependency (`rg`)

Grep tests accept success or "environment error" which is safe but not validating.

**Options:**
1. Guarantee `rg` in CI and assert stronger outputs
2. Detect `rg` at runtime and skip/soften expectations
3. Pure Zig fallback for deterministic testing

---

## Priority Order

1. **P0:** Fix width compile error, fix git type comparison
2. **P1:** Fix truncate ownership contract
3. **P2:** Add platform guards, use `std.testing.tmpDir()`
4. **P3:** Add missing content verification, reconcile tab semantics

---

## Related

- Main Zig review: [30-zig-tui-review.md](./30-zig-tui-review.md)
- Test coverage audit: [10-test-coverage-audit.md](./10-test-coverage-audit.md)
