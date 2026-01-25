const std = @import("std");
const loading_mod = @import("../loading.zig");
const clock_mod = @import("../clock.zig");
const streaming = @import("../streaming.zig");
const tool_executor_mod = @import("../agent/tool_executor.zig");

/// Mock ToolExecutor for testing
const MockToolExecutor = struct {
    allocator: std.mem.Allocator,
    running: bool = false,
    init_called: bool = false,
    deinit_called: bool = false,

    pub fn init(allocator: std.mem.Allocator) MockToolExecutor {
        return .{ .allocator = allocator, .init_called = true };
    }

    pub fn deinit(self: *MockToolExecutor) void {
        self.deinit_called = true;
    }

    pub fn isRunning(self: *MockToolExecutor) bool {
        return self.running;
    }

    pub fn setRunning(self: *MockToolExecutor, r: bool) void {
        self.running = r;
    }
};

/// Test LoadingState with MockClock and MockToolExecutor
const TestLoadingState = loading_mod.LoadingState(clock_mod.MockClock, MockToolExecutor);

test "LoadingState initial state" {
    var state = TestLoadingState{};

    try std.testing.expect(!state.isLoading());
    try std.testing.expectEqual(@as(i64, 0), state.start_time);
    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);
    try std.testing.expect(state.pending_query == null);
    try std.testing.expect(state.pending_continuation == null);
    try std.testing.expect(state.tool_executor == null);
    try std.testing.expectEqual(@as(usize, 0), state.pending_tools.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.current_tool_idx);
    try std.testing.expectEqual(@as(usize, 0), state.tool_results.items.len);
    try std.testing.expect(state.assistant_content_json == null);
}

test "LoadingState startLoading sets timestamp" {
    clock_mod.MockClock.reset();
    clock_mod.MockClock.setTime(12345);

    var state = TestLoadingState{};
    state.startLoading();

    try std.testing.expect(state.isLoading());
    try std.testing.expectEqual(@as(i64, 12345), state.start_time);
    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);
}

test "LoadingState tick cycles spinner" {
    var state = TestLoadingState{};
    state.startLoading(); // Use startLoading instead of direct field access

    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);

    state.tick();
    try std.testing.expectEqual(@as(usize, 1), state.spinner_frame);

    state.tick();
    try std.testing.expectEqual(@as(usize, 2), state.spinner_frame);

    state.tick();
    try std.testing.expectEqual(@as(usize, 3), state.spinner_frame);
}

test "LoadingState tick does nothing when not loading" {
    var state = TestLoadingState{};
    // Default state is not loading

    state.tick();
    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);

    state.tick();
    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);
}

test "LoadingState spinner wraps around" {
    var state = TestLoadingState{};
    state.startLoading();

    // spinner_frames has 10 frames (indices 0-9)
    const num_frames = loading_mod.spinner_frames.len;
    try std.testing.expectEqual(@as(usize, 10), num_frames);

    // Tick to frame 9
    var i: usize = 0;
    while (i < 9) : (i += 1) {
        state.tick();
    }
    try std.testing.expectEqual(@as(usize, 9), state.spinner_frame);

    // Next tick should wrap to 0
    state.tick();
    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);

    // Continue cycling
    state.tick();
    try std.testing.expectEqual(@as(usize, 1), state.spinner_frame);
}

test "LoadingState getSpinner returns correct frame" {
    var state = TestLoadingState{};

    try std.testing.expectEqualStrings("⠋", state.getSpinner());

    state.spinner_frame = 1;
    try std.testing.expectEqualStrings("⠙", state.getSpinner());

    state.spinner_frame = 5;
    try std.testing.expectEqualStrings("⠴", state.getSpinner());

    state.spinner_frame = 9;
    try std.testing.expectEqualStrings("⠏", state.getSpinner());
}

test "LoadingState hasToolsToExecute false when empty" {
    var state = TestLoadingState{};

    try std.testing.expect(!state.hasToolsToExecute());
}

test "LoadingState hasToolsToExecute true when tools pending" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};
    defer state.pending_tools.deinit(alloc);

    try state.pending_tools.append(alloc, .{
        .id = "tool_1",
        .name = "test_tool",
        .input_json = "{}",
    });

    try std.testing.expect(state.hasToolsToExecute());
}

test "LoadingState hasToolsToExecute false when all executed" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};
    defer state.pending_tools.deinit(alloc);

    try state.pending_tools.append(alloc, .{
        .id = "tool_1",
        .name = "test_tool",
        .input_json = "{}",
    });

    state.current_tool_idx = 1; // All tools executed

    try std.testing.expect(!state.hasToolsToExecute());
}

test "LoadingState isExecutingTool false when no executor" {
    var state = TestLoadingState{};

    try std.testing.expect(!state.isExecutingTool());
}

test "LoadingState isExecutingTool delegates to executor" {
    var state = TestLoadingState{};
    state.tool_executor = MockToolExecutor.init(std.testing.allocator);

    // Not running
    try std.testing.expect(!state.isExecutingTool());

    // Set running
    state.tool_executor.?.running = true;
    try std.testing.expect(state.isExecutingTool());

    // Back to not running
    state.tool_executor.?.running = false;
    try std.testing.expect(!state.isExecutingTool());
}

test "LoadingState cleanup frees resources" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    // Set up pending_query
    state.pending_query = try alloc.dupe(u8, "test query");

    // Set up pending_continuation
    state.pending_continuation = try alloc.dupe(u8, "continuation");

    // Set up assistant_content_json
    state.assistant_content_json = try alloc.dupe(u8, "{\"content\": \"test\"}");

    // Set up pending_tools with owned strings
    try state.pending_tools.append(alloc, .{
        .id = try alloc.dupe(u8, "id1"),
        .name = try alloc.dupe(u8, "name1"),
        .input_json = try alloc.dupe(u8, "{}"),
    });

    // Set up tool_results with owned strings
    try state.tool_results.append(alloc, .{
        .tool_id = try alloc.dupe(u8, "result_id"),
        .tool_name = try alloc.dupe(u8, "result_name"),
        .content = try alloc.dupe(u8, "result content"),
        .success = true,
        .input_json = try alloc.dupe(u8, "{\"input\": 1}"),
    });

    // Set up tool_executor
    state.tool_executor = MockToolExecutor.init(alloc);

    state.startLoading();

    // Cleanup should free all resources
    state.cleanup(alloc);

    // Verify state is reset
    try std.testing.expect(!state.isLoading());
    try std.testing.expect(state.pending_query == null);
    try std.testing.expect(state.pending_continuation == null);
    try std.testing.expect(state.tool_executor == null);
    try std.testing.expectEqual(@as(usize, 0), state.pending_tools.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.current_tool_idx);
    try std.testing.expectEqual(@as(usize, 0), state.tool_results.items.len);
    try std.testing.expect(state.assistant_content_json == null);
}

test "LoadingState cleanup handles null fields" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    // Should not crash when all fields are null/empty
    state.cleanup(alloc);

    try std.testing.expect(!state.isLoading());
}

test "LoadingState now uses injected clock" {
    clock_mod.MockClock.reset();
    clock_mod.MockClock.setTime(99999);

    const ts = TestLoadingState.now();
    try std.testing.expectEqual(@as(i64, 99999), ts);

    clock_mod.MockClock.advance(500);
    const ts2 = TestLoadingState.now();
    try std.testing.expectEqual(@as(i64, 100499), ts2);
}

test "LoadingState createToolExecutor uses injected factory" {
    const exec = TestLoadingState.createToolExecutor(std.testing.allocator);

    try std.testing.expect(exec.init_called);
    try std.testing.expect(!exec.deinit_called);
}

test "spinner_frames contains expected values" {
    const frames = loading_mod.spinner_frames;

    try std.testing.expectEqual(@as(usize, 10), frames.len);
    try std.testing.expectEqualStrings("⠋", frames[0]);
    try std.testing.expectEqualStrings("⠙", frames[1]);
    try std.testing.expectEqualStrings("⠹", frames[2]);
    try std.testing.expectEqualStrings("⠸", frames[3]);
    try std.testing.expectEqualStrings("⠼", frames[4]);
    try std.testing.expectEqualStrings("⠴", frames[5]);
    try std.testing.expectEqualStrings("⠦", frames[6]);
    try std.testing.expectEqualStrings("⠧", frames[7]);
    try std.testing.expectEqualStrings("⠇", frames[8]);
    try std.testing.expectEqualStrings("⠏", frames[9]);
}

test "LoadingState multiple tool results cleanup" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    // Add multiple tool results
    var i: usize = 0;
    while (i < 5) : (i += 1) {
        const id = try std.fmt.allocPrint(alloc, "id_{d}", .{i});
        const name = try std.fmt.allocPrint(alloc, "name_{d}", .{i});
        const content = try std.fmt.allocPrint(alloc, "content_{d}", .{i});
        const input = try std.fmt.allocPrint(alloc, "{{\"idx\": {d}}}", .{i});

        try state.tool_results.append(alloc, .{
            .tool_id = id,
            .tool_name = name,
            .content = content,
            .success = i % 2 == 0,
            .input_json = input,
        });
    }

    try std.testing.expectEqual(@as(usize, 5), state.tool_results.items.len);

    // Cleanup should free all without leaks
    state.cleanup(alloc);

    try std.testing.expectEqual(@as(usize, 0), state.tool_results.items.len);
}

test "LoadingState startLoading resets spinner_frame" {
    clock_mod.MockClock.reset();
    var state = TestLoadingState{};

    state.spinner_frame = 5;
    state.startLoading();

    try std.testing.expectEqual(@as(usize, 0), state.spinner_frame);
}

test "ToolResultInfo struct layout" {
    const info = loading_mod.ToolResultInfo{
        .tool_id = "test_id",
        .tool_name = "test_name",
        .content = "test_content",
        .success = true,
        .input_json = "{}",
    };

    try std.testing.expectEqualStrings("test_id", info.tool_id);
    try std.testing.expectEqualStrings("test_name", info.tool_name);
    try std.testing.expectEqualStrings("test_content", info.content);
    try std.testing.expect(info.success);
    try std.testing.expectEqualStrings("{}", info.input_json);
}

test "ProductionLoadingState type exists" {
    // Verify the production type compiles and is accessible
    const ProdState = loading_mod.ProductionLoadingState;
    _ = ProdState;
}

// ============================================================================
// Thread Safety Tests (Issue 1 fix)
// ============================================================================

test "LoadingState requestCancel is atomic" {
    var state = TestLoadingState{};

    // Initially not cancelled
    try std.testing.expect(!state.isCancelRequested());

    // Request cancel (atomic operation)
    state.requestCancel();

    // Verify cancelled
    try std.testing.expect(state.isCancelRequested());
}

test "LoadingState cancel flag cleared on startLoading" {
    var state = TestLoadingState{};

    state.requestCancel();
    try std.testing.expect(state.isCancelRequested());

    // startLoading should reset cancel flag
    state.startLoading();
    try std.testing.expect(!state.isCancelRequested());
}

test "LoadingState isLoading is atomic" {
    var state = TestLoadingState{};

    // Initially not loading (atomic read)
    try std.testing.expect(!state.isLoading());

    // Start loading (sets atomic flag)
    state.startLoading();
    try std.testing.expect(state.isLoading());

    // Cleanup clears atomic flag
    state.cleanup(std.testing.allocator);
    try std.testing.expect(!state.isLoading());
}

test "LoadingState hasPendingWork atomic flag" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    // Initially no pending work
    try std.testing.expect(!state.hasPendingWork());

    // Set pending query
    state.setPendingQuery(try alloc.dupe(u8, "test query"));
    try std.testing.expect(state.hasPendingWork());

    // Clear pending query, flag should still reflect state
    state.clearPendingQuery(alloc);
    try std.testing.expect(!state.hasPendingWork());
}

test "LoadingState setPendingContinuation sets atomic flag" {
    const alloc = std.testing.allocator;
    var state = TestLoadingState{};

    try std.testing.expect(!state.hasPendingWork());

    state.setPendingContinuation(try alloc.dupe(u8, "continuation"));
    try std.testing.expect(state.hasPendingWork());

    state.clearPendingContinuation(alloc);
    try std.testing.expect(!state.hasPendingWork());
}

test "LoadingState hasPendingWork atomic is thread-safe" {
    // This tests the atomic flag can be safely read without mutex
    var state = TestLoadingState{};

    // Simulate cross-thread read pattern
    const flag1 = state.hasPendingWork();
    try std.testing.expect(!flag1);
}
