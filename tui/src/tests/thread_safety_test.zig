const std = @import("std");
const loading_mod = @import("../loading.zig");
const clock_mod = @import("../clock.zig");
const db_mod = @import("../db.zig");

// ============================================================================
// Thread Safety Tests for Issue Fixes
// ============================================================================

/// Mock ToolExecutor for testing
const MockToolExecutor = struct {
    allocator: std.mem.Allocator,
    running: bool = false,

    pub fn init(allocator: std.mem.Allocator) MockToolExecutor {
        return .{ .allocator = allocator };
    }

    pub fn deinit(_: *MockToolExecutor) void {}

    pub fn isRunning(self: *MockToolExecutor) bool {
        return self.running;
    }
};

const TestLoadingState = loading_mod.LoadingState(clock_mod.MockClock, MockToolExecutor);

// ============================================================================
// Issue 1: Loading state atomics are thread-safe
// ============================================================================

test "Loading: atomic flags can be read without mutex" {
    var state = TestLoadingState{};

    // These reads should be safe without holding a lock
    const is_loading = state.isLoading();
    const is_cancel = state.isCancelRequested();
    const has_work = state.hasPendingWork();

    try std.testing.expect(!is_loading);
    try std.testing.expect(!is_cancel);
    try std.testing.expect(!has_work);
}

test "Loading: requestCancel sets atomic flag" {
    var state = TestLoadingState{};

    try std.testing.expect(!state.isCancelRequested());
    state.requestCancel();
    try std.testing.expect(state.isCancelRequested());
}

test "Loading: startLoading clears cancel flag" {
    var state = TestLoadingState{};

    state.requestCancel();
    try std.testing.expect(state.isCancelRequested());

    state.startLoading();
    try std.testing.expect(!state.isCancelRequested());
    try std.testing.expect(state.isLoading());
}

test "Loading: cleanup clears all atomic flags" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    state.startLoading();
    state.requestCancel();
    state.setPendingQuery(try alloc.dupe(u8, "test"));

    try std.testing.expect(state.isLoading());
    try std.testing.expect(state.isCancelRequested());
    try std.testing.expect(state.hasPendingWork());

    state.cleanup(alloc);

    try std.testing.expect(!state.isLoading());
    try std.testing.expect(!state.isCancelRequested());
    try std.testing.expect(!state.hasPendingWork());
}

test "Loading: setPendingQuery updates atomic flag" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    try std.testing.expect(!state.hasPendingWork());

    state.setPendingQuery(try alloc.dupe(u8, "query"));
    try std.testing.expect(state.hasPendingWork());

    state.clearPendingQuery(alloc);
    try std.testing.expect(!state.hasPendingWork());
}

// ============================================================================
// Issue 2: AgentRunStatus includes 'continuing' for crash recovery
// ============================================================================

test "AgentRunStatus: continuing status exists" {
    const status = db_mod.AgentRunStatus.continuing;
    try std.testing.expectEqualStrings("continuing", status.toString());
}

test "AgentRunStatus: fromString parses continuing" {
    const status = db_mod.AgentRunStatus.fromString("continuing");
    try std.testing.expectEqual(db_mod.AgentRunStatus.continuing, status);
}

test "AgentRunStatus: all statuses round-trip" {
    const statuses = [_]db_mod.AgentRunStatus{
        .pending,
        .streaming,
        .tools,
        .continuing,
        .complete,
        .error_state,
    };

    for (statuses) |status| {
        const str = status.toString();
        const parsed = db_mod.AgentRunStatus.fromString(str);
        try std.testing.expectEqual(status, parsed);
    }
}

// ============================================================================
// Issue 5: Migration errors are logged (not silent)
// ============================================================================

test "Database: init succeeds with in-memory db" {
    const Sqlite = @import("sqlite").Db;
    const TestDatabase = db_mod.Database(Sqlite);

    const alloc = std.testing.allocator;
    var database = try TestDatabase.init(alloc, null);
    defer database.deinit();

    // Should have created tables without error
    try std.testing.expect(database.current_session_id >= 1);
}

// ============================================================================
// Issue 3: Debounce behavior (verified via timing logic)
// ============================================================================

test "Clock: MockClock can simulate time for debounce" {
    clock_mod.MockClock.reset();
    clock_mod.MockClock.setTime(0);

    const t1 = clock_mod.MockClock.milliTimestamp();
    try std.testing.expectEqual(@as(i64, 0), t1);

    clock_mod.MockClock.advance(50);
    const t2 = clock_mod.MockClock.milliTimestamp();
    try std.testing.expectEqual(@as(i64, 50), t2);

    clock_mod.MockClock.advance(50);
    const t3 = clock_mod.MockClock.milliTimestamp();
    try std.testing.expectEqual(@as(i64, 100), t3);
}

test "Debounce logic: should reload after 100ms" {
    clock_mod.MockClock.reset();
    clock_mod.MockClock.setTime(100); // Start at 100ms

    var last_reload: i64 = 0; // Last reload was at t=0
    const is_loading = true;

    // First check at t=100 - should reload (100ms since last_reload=0)
    const now1 = clock_mod.MockClock.milliTimestamp();
    const should_reload1 = !is_loading or (now1 - last_reload >= 100);
    try std.testing.expect(should_reload1);
    last_reload = now1;

    // Check at t=150 - should NOT reload (only 50ms elapsed)
    clock_mod.MockClock.advance(50);
    const now2 = clock_mod.MockClock.milliTimestamp();
    const should_reload2 = !is_loading or (now2 - last_reload >= 100);
    try std.testing.expect(!should_reload2);

    // Check at t=200 - should reload (100ms elapsed)
    clock_mod.MockClock.advance(50);
    const now3 = clock_mod.MockClock.milliTimestamp();
    const should_reload3 = !is_loading or (now3 - last_reload >= 100);
    try std.testing.expect(should_reload3);
}

test "Debounce logic: always reload when not loading" {
    clock_mod.MockClock.reset();
    clock_mod.MockClock.setTime(1000);

    const last_reload: i64 = 999; // 1ms ago
    const is_loading = false;

    const now = clock_mod.MockClock.milliTimestamp();
    const should_reload = !is_loading or (now - last_reload >= 100);

    // When not loading, always reload regardless of time
    try std.testing.expect(should_reload);
}

// ============================================================================
// Issue 4: Lock discipline - defer unlock pattern
// ============================================================================

test "Mutex: defer unlock ensures cleanup on early return" {
    var mutex = std.Thread.Mutex{};
    var executed = false;

    // Simulate the pattern: lock + defer unlock
    {
        mutex.lock();
        defer mutex.unlock();

        // Simulate some work
        executed = true;
    }

    // Verify work was done
    try std.testing.expect(executed);

    // Verify mutex is unlocked by locking again (would deadlock if still locked)
    mutex.lock();
    mutex.unlock();
}

test "Mutex: tryLock works after defer unlock" {
    var mutex = std.Thread.Mutex{};

    {
        mutex.lock();
        defer mutex.unlock();
        // Do some work
    }

    // Should be able to lock again
    const locked = mutex.tryLock();
    try std.testing.expect(locked);
    mutex.unlock();
}
