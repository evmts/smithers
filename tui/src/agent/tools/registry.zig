const std = @import("std");
const Allocator = std.mem.Allocator;
pub const truncate = @import("truncate.zig");

/// Tool execution result with metadata
pub const ToolResult = struct {
    success: bool,
    content: []const u8,
    error_message: ?[]const u8 = null,
    /// Was output truncated?
    truncated: bool = false,
    /// Path to full output if truncated
    full_output_path: ?[]const u8 = null,

    pub fn ok(content: []const u8) ToolResult {
        return .{ .success = true, .content = content };
    }

    pub fn okTruncated(content: []const u8, full_path: ?[]const u8) ToolResult {
        return .{
            .success = true,
            .content = content,
            .truncated = true,
            .full_output_path = full_path,
        };
    }

    pub fn err(message: []const u8) ToolResult {
        return .{ .success = false, .content = "", .error_message = message };
    }
};

/// Callback for streaming partial output updates
pub const OnUpdateFn = *const fn (partial: []const u8, ctx: ?*anyopaque) void;

/// Tool execution context with cancel support and streaming
pub const ToolContext = struct {
    allocator: Allocator,
    args: std.json.Value,
    /// Atomic flag for cancellation - check periodically in long-running tools
    cancelled: *std.atomic.Value(bool),
    /// Optional callback for streaming partial results
    on_update: ?OnUpdateFn = null,
    on_update_ctx: ?*anyopaque = null,
    /// Working directory for file operations
    cwd: []const u8 = ".",

    pub fn getString(self: ToolContext, key: []const u8) ?[]const u8 {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .string) val.string else null;
    }

    pub fn getInt(self: ToolContext, key: []const u8) ?i64 {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .integer) val.integer else null;
    }

    pub fn getBool(self: ToolContext, key: []const u8) ?bool {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .bool) val.bool else null;
    }

    /// Check if execution was cancelled
    pub fn isCancelled(self: ToolContext) bool {
        return self.cancelled.load(.acquire);
    }

    /// Send partial update to callback
    pub fn update(self: ToolContext, partial: []const u8) void {
        if (self.on_update) |cb| {
            cb(partial, self.on_update_ctx);
        }
    }
};

/// Legacy params for backwards compatibility
pub const ToolParams = struct {
    allocator: Allocator,
    args: std.json.Value,

    pub fn getString(self: ToolParams, key: []const u8) ?[]const u8 {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .string) val.string else null;
    }

    pub fn getInt(self: ToolParams, key: []const u8) ?i64 {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .integer) val.integer else null;
    }

    pub fn getBool(self: ToolParams, key: []const u8) ?bool {
        if (self.args != .object) return null;
        const val = self.args.object.get(key) orelse return null;
        return if (val == .bool) val.bool else null;
    }
};

/// New-style execute function with full context
pub const ToolExecuteCtxFn = *const fn (ctx: ToolContext) ToolResult;

/// Legacy execute function (still supported)
pub const ToolExecuteFn = *const fn (params: ToolParams) ToolResult;

pub const Tool = struct {
    name: []const u8,
    description: []const u8,
    /// New-style execute with context (preferred)
    execute_ctx: ?ToolExecuteCtxFn = null,
    /// Legacy execute (backwards compat)
    execute: ?ToolExecuteFn = null,
};

pub const ToolRegistry = struct {
    tools: std.StringHashMap(Tool),
    allocator: Allocator,
    /// Shared cancel flag for all tool executions
    cancel_flag: std.atomic.Value(bool),

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .tools = std.StringHashMap(Tool).init(allocator),
            .allocator = allocator,
            .cancel_flag = std.atomic.Value(bool).init(false),
        };
    }

    pub fn initBuiltin(allocator: Allocator) Self {
        const read_file = @import("read_file.zig");
        const write_file = @import("write_file.zig");
        const edit_file = @import("edit_file.zig");
        const bash = @import("bash.zig");
        const glob = @import("glob.zig");
        const grep = @import("grep.zig");
        const list_dir = @import("list_dir.zig");

        var self = Self.init(allocator);
        self.register(read_file.tool);
        self.register(write_file.tool);
        self.register(edit_file.tool);
        self.register(bash.tool);
        self.register(glob.tool);
        self.register(grep.tool);
        self.register(list_dir.tool);
        return self;
    }

    pub fn deinit(self: *Self) void {
        self.tools.deinit();
    }

    pub fn register(self: *Self, t: Tool) void {
        self.tools.put(t.name, t) catch {};
    }

    pub fn get(self: *Self, name: []const u8) ?Tool {
        return self.tools.get(name);
    }

    /// Cancel any running tool execution
    pub fn cancel(self: *Self) void {
        self.cancel_flag.store(true, .release);
    }

    /// Reset cancel flag (call before starting new execution)
    pub fn resetCancel(self: *Self) void {
        self.cancel_flag.store(false, .release);
    }

    /// Execute with full context (streaming + cancel support)
    pub fn executeWithContext(
        self: *Self,
        name: []const u8,
        args: std.json.Value,
        on_update: ?OnUpdateFn,
        on_update_ctx: ?*anyopaque,
    ) ToolResult {
        const t = self.tools.get(name) orelse {
            return ToolResult.err("Unknown tool");
        };

        // Prefer new-style execute_ctx if available
        if (t.execute_ctx) |exec_fn| {
            return exec_fn(.{
                .allocator = self.allocator,
                .args = args,
                .cancelled = &self.cancel_flag,
                .on_update = on_update,
                .on_update_ctx = on_update_ctx,
            });
        }

        // Fall back to legacy execute
        if (t.execute) |exec_fn| {
            return exec_fn(.{
                .allocator = self.allocator,
                .args = args,
            });
        }

        return ToolResult.err("Tool has no execute function");
    }

    /// Legacy execute (backwards compat)
    pub fn execute(self: *Self, name: []const u8, args: std.json.Value) ToolResult {
        return self.executeWithContext(name, args, null, null);
    }

    pub fn count(self: *Self) usize {
        return self.tools.count();
    }

    /// Get all tool names for API
    pub fn names(self: *Self, alloc: Allocator) [][]const u8 {
        var result = std.ArrayListUnmanaged([]const u8){};
        var iter = self.tools.keyIterator();
        while (iter.next()) |key| {
            result.append(alloc, key.*) catch {};
        }
        return result.toOwnedSlice(alloc) catch &.{};
    }
};

test "ToolRegistry init and register" {
    const allocator = std.testing.allocator;
    var registry = ToolRegistry.init(allocator);
    defer registry.deinit();

    try std.testing.expectEqual(@as(usize, 0), registry.count());

    registry.register(.{
        .name = "test_tool",
        .description = "A test tool",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("test result");
            }
        }.exec,
    });

    try std.testing.expectEqual(@as(usize, 1), registry.count());
    try std.testing.expect(registry.get("test_tool") != null);
    try std.testing.expect(registry.get("nonexistent") == null);
}

test "ToolRegistry execute with context" {
    const allocator = std.testing.allocator;
    var registry = ToolRegistry.init(allocator);
    defer registry.deinit();

    registry.register(.{
        .name = "echo",
        .description = "Echo tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Cancelled");
                }
                ctx.update("partial...");
                return ToolResult.ok("done");
            }
        }.exec,
    });

    const result = registry.execute("echo", .null);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("done", result.content);
}

test "ToolRegistry cancel" {
    const allocator = std.testing.allocator;
    var registry = ToolRegistry.init(allocator);
    defer registry.deinit();

    registry.register(.{
        .name = "cancellable",
        .description = "Cancellable tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Cancelled");
                }
                return ToolResult.ok("completed");
            }
        }.exec,
    });

    registry.cancel();
    const result = registry.execute("cancellable", .null);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);

    registry.resetCancel();
    const result2 = registry.execute("cancellable", .null);
    try std.testing.expect(result2.success);
}
