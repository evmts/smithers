const std = @import("std");
const streaming = @import("streaming.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");
const clock_mod = @import("clock.zig");

pub const spinner_frames = [_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" };

pub const ToolResultInfo = struct {
    tool_id: []const u8,
    tool_name: []const u8,
    content: []const u8,
    success: bool,
    input_json: []const u8,
};

/// LoadingState generic over Clock implementation
pub fn LoadingState(comptime Clk: type) type {
    return struct {
        is_loading: bool = false,
        start_time: i64 = 0,
        spinner_frame: usize = 0,
        pending_query: ?[]const u8 = null,
        streaming: ?streaming.StreamingState = null,
        pending_continuation: ?[]const u8 = null,

        tool_executor: ?tool_executor_mod.DefaultToolExecutor = null,
        pending_tools: std.ArrayListUnmanaged(streaming.ToolCallInfo) = .{},
        current_tool_idx: usize = 0,
        tool_results: std.ArrayListUnmanaged(ToolResultInfo) = .{},
        assistant_content_json: ?[]const u8 = null,

        const Self = @This();

        pub fn startLoading(self: *Self) void {
            self.is_loading = true;
            self.start_time = Clk.milliTimestamp();
            self.spinner_frame = 0;
        }

        pub fn tick(self: *Self) void {
            if (self.is_loading) {
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
            if (self.streaming) |*s| s.cleanup();
            self.streaming = null;
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
            self.pending_tools.deinit(alloc);
            self.pending_tools = .{};
            self.current_tool_idx = 0;
            if (self.assistant_content_json) |a| alloc.free(a);
            self.assistant_content_json = null;
            self.is_loading = false;
        }

        /// Get current timestamp via injected clock
        pub fn now() i64 {
            return Clk.milliTimestamp();
        }
    };
}

/// Default LoadingState using system clock
pub const DefaultLoadingState = LoadingState(clock_mod.DefaultClock);
