const std = @import("std");
const registry = @import("tools/registry.zig");

/// Generic ToolExecutor over a RegistryFactory that provides tool execution
/// This allows injecting mock registries for testing
pub fn ToolExecutor(comptime RegistryFactory: type) type {
    return struct {
        allocator: std.mem.Allocator,
        thread: ?std.Thread = null,
        result: ?ThreadResult = null,
        mutex: std.Thread.Mutex = .{},

        const Self = @This();
        const ToolResult = registry.ToolResult;
        const ToolRegistry = registry.ToolRegistry;

        /// Tool execution context passed to thread
        const ThreadContext = struct {
            allocator: std.mem.Allocator,
            tool_name: []const u8,
            tool_id: []const u8,
            input_json: []const u8,
            executor: *Self,
        };

        /// Result from thread execution
        pub const ThreadResult = struct {
            tool_id: []const u8,
            tool_name: []const u8,
            result: ToolResult,
            input_value: ?std.json.Value = null,
        };

        pub fn init(allocator: std.mem.Allocator) Self {
            return .{ .allocator = allocator };
        }

        pub fn deinit(self: *Self) void {
            if (self.thread) |t| {
                t.join();
            }
            self.thread = null;
        }

        /// Check if a tool is currently executing or has a pending result
        pub fn isRunning(self: *Self) bool {
            // Running if thread exists, OR if result is pending (not yet polled)
            return self.thread != null or self.result != null;
        }

        /// Poll for completion - returns result if done, null if still running
        pub fn poll(self: *Self) ?ThreadResult {
            self.mutex.lock();
            defer self.mutex.unlock();

            if (self.result) |r| {
                if (self.thread) |t| {
                    t.join();
                    self.thread = null;
                }
                self.result = null;
                return r;
            }
            return null;
        }

        /// Start executing a tool in background
        pub fn execute(
            self: *Self,
            tool_id: []const u8,
            tool_name: []const u8,
            input_json: []const u8,
        ) !void {
            if (self.isRunning()) return error.AlreadyRunning;

            const id_copy = try self.allocator.dupe(u8, tool_id);
            const name_copy = try self.allocator.dupe(u8, tool_name);
            const input_copy = try self.allocator.dupe(u8, input_json);

            const ctx = ThreadContext{
                .allocator = self.allocator,
                .tool_name = name_copy,
                .tool_id = id_copy,
                .input_json = input_copy,
                .executor = self,
            };

            self.result = null;
            self.thread = try std.Thread.spawn(.{}, threadFn, .{ctx});
        }

        fn threadFn(ctx: ThreadContext) void {
            // Use injected registry factory
            var tool_registry = RegistryFactory.create(ctx.allocator);
            defer tool_registry.deinit();

            const maybe_parsed = std.json.parseFromSlice(
                std.json.Value,
                ctx.allocator,
                ctx.input_json,
                .{},
            ) catch null;
            defer if (maybe_parsed) |p| p.deinit();

            const input_value = if (maybe_parsed) |p| p.value else std.json.Value.null;

            const result = tool_registry.execute(ctx.tool_name, input_value);

            {
                ctx.executor.mutex.lock();
                defer ctx.executor.mutex.unlock();

                ctx.executor.result = .{
                    .tool_id = ctx.tool_id,
                    .tool_name = ctx.tool_name,
                    .result = result,
                };
            }

            ctx.allocator.free(ctx.input_json);
        }
    };
}

/// Production registry factory using builtin tools
pub const BuiltinRegistryFactory = struct {
    pub fn create(allocator: std.mem.Allocator) registry.ToolRegistry {
        return registry.ToolRegistry.initBuiltin(allocator);
    }
};



/// Mock registry factory for testing - returns empty registry
pub const MockRegistryFactory = struct {
    pub var mock_result: ?registry.ToolResult = null;

    pub fn create(allocator: std.mem.Allocator) registry.ToolRegistry {
        var reg = registry.ToolRegistry.init(allocator);
        reg.register(.{
            .name = "mock_tool",
            .description = "Mock tool for testing",
            .execute = struct {
                fn exec(_: registry.ToolParams) registry.ToolResult {
                    return mock_result orelse registry.ToolResult.ok("mock result");
                }
            }.exec,
        });
        return reg;
    }

    pub fn setResult(result: registry.ToolResult) void {
        mock_result = result;
    }

    pub fn reset() void {
        mock_result = null;
    }
};
