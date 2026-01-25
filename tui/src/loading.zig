const std = @import("std");
const tool_executor_mod = @import("agent/tool_executor.zig");

const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};
const clock_mod = @import("clock.zig");

pub const spinner_frames = [_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" };

pub const ToolResultInfo = struct {
    tool_id: []const u8,
    tool_name: []const u8,
    content: []const u8,
    success: bool,
    input_json: []const u8,
};

/// LoadingState generic over Clock and ToolExecutor
/// Thread-safety: is_loading and has_pending_work are atomic for safe cross-thread reads.
/// Other fields should only be accessed under mutex (via AgentThread).
/// Tool execution state is persisted to SQLite agent_runs table for crash recovery.
pub fn LoadingState(comptime Clk: type, comptime ToolExec: type) type {
    return struct {
        /// Atomic for thread-safe reads from main thread
        is_loading_atomic: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
        /// Atomic cancel flag - main thread sets, agent thread reads and cleans up
        cancel_requested: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
        /// Atomic flag for pending work - safe for main thread to check without mutex
        has_pending_work_atomic: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
        start_time: i64 = 0,
        spinner_frame: usize = 0,
        pending_query: ?[]const u8 = null,
        pending_continuation: ?[]const u8 = null,

        tool_executor: ?ToolExec = null,
        pending_tools: std.ArrayListUnmanaged(ToolCallInfo) = .{},
        current_tool_idx: usize = 0,
        tool_results: std.ArrayListUnmanaged(ToolResultInfo) = .{},
        assistant_content_json: ?[]const u8 = null,

        /// SQLite agent_run ID for crash recovery (null if no active run)
        agent_run_id: ?i64 = null,

        const Self = @This();

        /// Thread-safe read of is_loading
        pub fn isLoading(self: *const Self) bool {
            return self.is_loading_atomic.load(.acquire);
        }

        pub fn startLoading(self: *Self) void {
            self.is_loading_atomic.store(true, .release);
            self.cancel_requested.store(false, .release);
            self.start_time = Clk.milliTimestamp();
            self.spinner_frame = 0;
        }

        /// Request cancellation (thread-safe, called from main thread)
        pub fn requestCancel(self: *Self) void {
            self.cancel_requested.store(true, .release);
        }

        /// Check if cancel was requested (called from agent thread)
        pub fn isCancelRequested(self: *const Self) bool {
            return self.cancel_requested.load(.acquire);
        }

        /// Thread-safe check for pending work (safe for main thread without mutex)
        pub fn hasPendingWork(self: *const Self) bool {
            return self.has_pending_work_atomic.load(.acquire);
        }

        /// Set pending query atomically (updates both field and atomic flag)
        pub fn setPendingQuery(self: *Self, query: []const u8) void {
            self.pending_query = query;
            self.has_pending_work_atomic.store(true, .release);
        }

        /// Clear pending query atomically
        pub fn clearPendingQuery(self: *Self, alloc: std.mem.Allocator) void {
            if (self.pending_query) |q| alloc.free(q);
            self.pending_query = null;
            self.updatePendingWorkFlag();
        }

        /// Set pending continuation atomically (updates both field and atomic flag)
        pub fn setPendingContinuation(self: *Self, continuation: []const u8) void {
            self.pending_continuation = continuation;
            self.has_pending_work_atomic.store(true, .release);
        }

        /// Clear pending continuation atomically
        pub fn clearPendingContinuation(self: *Self, alloc: std.mem.Allocator) void {
            if (self.pending_continuation) |c| alloc.free(c);
            self.pending_continuation = null;
            self.updatePendingWorkFlag();
        }

        /// Update atomic flag based on current state
        fn updatePendingWorkFlag(self: *Self) void {
            const has_work = self.pending_query != null or self.pending_continuation != null;
            self.has_pending_work_atomic.store(has_work, .release);
        }

        pub fn tick(self: *Self) void {
            if (self.is_loading_atomic.load(.acquire)) {
                self.spinner_frame = (self.spinner_frame + 1) % spinner_frames.len;
            }
        }

        pub fn getSpinner(self: *Self) []const u8 {
            return spinner_frames[self.spinner_frame];
        }

        pub fn hasToolsToExecute(self: *Self) bool {
            return self.pending_tools.items.len > 0 and self.current_tool_idx < self.pending_tools.items.len;
        }

        pub fn isExecutingTool(self: *Self) bool {
            if (self.tool_executor) |*exec| {
                return exec.isRunning();
            }
            return false;
        }

        pub fn cleanup(self: *Self, alloc: std.mem.Allocator) void {
            if (self.pending_query) |q| alloc.free(q);
            self.pending_query = null;
            if (self.pending_continuation) |c| alloc.free(c);
            self.pending_continuation = null;
            if (self.tool_executor) |*exec| exec.deinit();
            self.tool_executor = null;
            for (self.tool_results.items) |tr| {
                alloc.free(tr.tool_id);
                alloc.free(tr.tool_name);
                alloc.free(tr.content);
                alloc.free(tr.input_json);
            }
            self.tool_results.deinit(alloc);
            self.tool_results = .{};
            for (self.pending_tools.items) |pt| {
                alloc.free(pt.id);
                alloc.free(pt.name);
                alloc.free(pt.input_json);
            }
            self.pending_tools.deinit(alloc);
            self.pending_tools = .{};
            self.current_tool_idx = 0;
            if (self.assistant_content_json) |a| alloc.free(a);
            self.assistant_content_json = null;
            self.agent_run_id = null;
            self.is_loading_atomic.store(false, .release);
            self.cancel_requested.store(false, .release);
            self.has_pending_work_atomic.store(false, .release);
        }

        pub fn now() i64 {
            return Clk.milliTimestamp();
        }

        /// Create a new tool executor instance
        pub fn createToolExecutor(alloc: std.mem.Allocator) ToolExec {
            return ToolExec.init(alloc);
        }
    };
}

/// Production LoadingState wiring
pub const ProductionLoadingState = LoadingState(
    clock_mod.StdClock,
    tool_executor_mod.ToolExecutor(tool_executor_mod.BuiltinRegistryFactory),
);
