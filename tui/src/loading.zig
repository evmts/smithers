const std = @import("std");
const tool_executor_mod = @import("agent/tool_executor.zig");
const types = @import("agent/types.zig");

const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};
const clock_mod = @import("clock.zig");

pub const ThinkingLevel = types.ThinkingLevel;
pub const AgentEvent = types.AgentEvent;
pub const EventQueue = types.EventQueue(256);

pub const spinner_frames = [_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" };

pub const ToolResultInfo = struct {
    tool_id: []const u8,
    tool_name: []const u8,
    content: []const u8,
    success: bool,
    input_json: []const u8,
    /// Structured details (tool-specific metadata as JSON)
    details_json: ?[]const u8 = null,
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

        /// Event queue for agent → UI communication (lock-free SPSC ring buffer)
        events: EventQueue = .{},
        /// Turn counter for event tracking
        current_turn: u32 = 0,

        /// Steering queue: messages to inject mid-run, skip remaining tools
        steering_queue: std.ArrayListUnmanaged([]const u8) = .{},
        /// Follow-up queue: messages to process after agent completes
        followup_queue: std.ArrayListUnmanaged([]const u8) = .{},
        /// Steering mode: "all" sends all queued at once, "one" sends one per turn
        steering_mode: enum { all, one_at_a_time } = .one_at_a_time,
        /// Follow-up mode: "all" sends all queued at once, "one" sends one per turn
        followup_mode: enum { all, one_at_a_time } = .one_at_a_time,

        /// Thinking/reasoning mode level
        thinking_level: ThinkingLevel = .off,

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
            const has_work = self.pending_query != null or self.pending_continuation != null or
                self.steering_queue.items.len > 0 or self.followup_queue.items.len > 0;
            self.has_pending_work_atomic.store(has_work, .release);
        }

        /// Set thinking/reasoning level
        pub fn setThinkingLevel(self: *Self, level: ThinkingLevel) void {
            self.thinking_level = level;
        }

        /// Get current thinking level
        pub fn getThinkingLevel(self: *const Self) ThinkingLevel {
            return self.thinking_level;
        }

        /// Queue a steering message to interrupt the agent mid-run.
        /// Delivered after current tool execution, skips remaining tools.
        pub fn steer(self: *Self, alloc: std.mem.Allocator, message: []const u8) !void {
            const duped = try alloc.dupe(u8, message);
            try self.steering_queue.append(alloc, duped);
            self.has_pending_work_atomic.store(true, .release);
        }

        /// Queue a follow-up message to be processed after the agent finishes.
        /// Delivered only when agent has no more tool calls or steering messages.
        pub fn followUp(self: *Self, alloc: std.mem.Allocator, message: []const u8) !void {
            const duped = try alloc.dupe(u8, message);
            try self.followup_queue.append(alloc, duped);
            self.has_pending_work_atomic.store(true, .release);
        }

        /// Drain and return steering messages based on steering_mode.
        /// Caller owns returned slice and individual strings.
        pub fn getSteeringMessages(self: *Self, alloc: std.mem.Allocator) ![][]const u8 {
            if (self.steering_queue.items.len == 0) return &[_][]const u8{};

            const count: usize = switch (self.steering_mode) {
                .all => self.steering_queue.items.len,
                .one_at_a_time => 1,
            };

            const result = try alloc.alloc([]const u8, count);
            for (0..count) |i| {
                result[i] = self.steering_queue.orderedRemove(0);
            }
            self.updatePendingWorkFlag();
            return result;
        }

        /// Drain and return follow-up messages based on followup_mode.
        /// Caller owns returned slice and individual strings.
        pub fn getFollowUpMessages(self: *Self, alloc: std.mem.Allocator) ![][]const u8 {
            if (self.followup_queue.items.len == 0) return &[_][]const u8{};

            const count: usize = switch (self.followup_mode) {
                .all => self.followup_queue.items.len,
                .one_at_a_time => 1,
            };

            const result = try alloc.alloc([]const u8, count);
            for (0..count) |i| {
                result[i] = self.followup_queue.orderedRemove(0);
            }
            self.updatePendingWorkFlag();
            return result;
        }

        /// Check if there are pending steering messages
        pub fn hasSteeringMessages(self: *const Self) bool {
            return self.steering_queue.items.len > 0;
        }

        /// Check if there are pending follow-up messages
        pub fn hasFollowUpMessages(self: *const Self) bool {
            return self.followup_queue.items.len > 0;
        }

        /// Clear all steering messages
        pub fn clearSteeringQueue(self: *Self, alloc: std.mem.Allocator) void {
            for (self.steering_queue.items) |msg| alloc.free(msg);
            self.steering_queue.deinit(alloc);
            self.steering_queue = .{};
            self.updatePendingWorkFlag();
        }

        /// Clear all follow-up messages
        pub fn clearFollowUpQueue(self: *Self, alloc: std.mem.Allocator) void {
            for (self.followup_queue.items) |msg| alloc.free(msg);
            self.followup_queue.deinit(alloc);
            self.followup_queue = .{};
            self.updatePendingWorkFlag();
        }

        /// Clear both steering and follow-up queues
        pub fn clearAllQueues(self: *Self, alloc: std.mem.Allocator) void {
            self.clearSteeringQueue(alloc);
            self.clearFollowUpQueue(alloc);
        }

        pub fn tick(self: *Self) void {
            if (self.is_loading_atomic.load(.acquire)) {
                self.spinner_frame = (self.spinner_frame + 1) % spinner_frames.len;
            }
        }

        // ---- Event emission methods (called from agent thread) ----

        pub fn emitAgentStart(self: *Self) void {
            _ = self.events.push(.agent_start);
            self.current_turn = 0;
        }

        pub fn emitTurnStart(self: *Self) void {
            self.current_turn += 1;
            _ = self.events.push(.{ .turn_start = self.current_turn });
        }

        pub fn emitMessageStart(self: *Self, message_id: ?i64) void {
            _ = self.events.push(.{ .message_start = .{ .message_id = message_id } });
        }

        pub fn emitMessageUpdate(self: *Self, message_id: ?i64, delta: []const u8, accumulated: []const u8) void {
            _ = self.events.push(.{ .message_update = .{
                .message_id = message_id,
                .delta = delta,
                .accumulated = accumulated,
            } });
        }

        pub fn emitMessageEnd(self: *Self, message_id: ?i64, content: []const u8) void {
            _ = self.events.push(.{ .message_end = .{ .message_id = message_id, .content = content } });
        }

        pub fn emitToolStart(self: *Self, tool_call_id: []const u8, tool_name: []const u8, args_json: []const u8) void {
            _ = self.events.push(.{ .tool_start = .{
                .tool_call_id = tool_call_id,
                .tool_name = tool_name,
                .args_json = args_json,
            } });
        }

        pub fn emitToolUpdate(self: *Self, tool_call_id: []const u8, tool_name: []const u8, partial_result: []const u8) void {
            _ = self.events.push(.{ .tool_update = .{
                .tool_call_id = tool_call_id,
                .tool_name = tool_name,
                .partial_result = partial_result,
            } });
        }

        pub fn emitToolEnd(self: *Self, tool_call_id: []const u8, tool_name: []const u8, result: []const u8, is_error: bool) void {
            _ = self.events.push(.{ .tool_end = .{
                .tool_call_id = tool_call_id,
                .tool_name = tool_name,
                .result = result,
                .is_error = is_error,
            } });
        }

        pub fn emitTurnEnd(self: *Self, has_tool_calls: bool) void {
            _ = self.events.push(.{ .turn_end = .{
                .turn = self.current_turn,
                .has_tool_calls = has_tool_calls,
            } });
        }

        pub fn emitAgentEnd(self: *Self) void {
            _ = self.events.push(.agent_end);
        }

        pub fn emitAgentError(self: *Self, message: []const u8) void {
            _ = self.events.push(.{ .agent_error = message });
        }

        // ---- Event polling methods (called from main thread) ----

        /// Poll a single event from the queue (non-blocking)
        pub fn pollEvent(self: *Self) ?AgentEvent {
            return self.events.pop();
        }

        /// Check if there are events to process
        pub fn hasEvents(self: *const Self) bool {
            return !self.events.isEmpty();
        }

        /// Get number of pending events
        pub fn eventCount(self: *const Self) usize {
            return self.events.len();
        }

        /// Drain events into a buffer, returns count of events drained
        pub fn drainEvents(self: *Self, buffer: []AgentEvent) usize {
            return self.events.drainInto(buffer);
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
                if (tr.details_json) |dj| alloc.free(dj);
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
            for (self.steering_queue.items) |msg| alloc.free(msg);
            self.steering_queue.deinit(alloc);
            self.steering_queue = .{};
            for (self.followup_queue.items) |msg| alloc.free(msg);
            self.followup_queue.deinit(alloc);
            self.followup_queue = .{};
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
