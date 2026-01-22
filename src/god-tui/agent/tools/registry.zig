const std = @import("std");
const Allocator = std.mem.Allocator;

pub const ToolResult = struct {
    success: bool,
    content: []const u8,
    error_message: ?[]const u8 = null,

    pub fn ok(content: []const u8) ToolResult {
        return .{ .success = true, .content = content };
    }

    pub fn err(message: []const u8) ToolResult {
        return .{ .success = false, .content = "", .error_message = message };
    }
};

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

pub const ToolExecuteFn = *const fn (params: ToolParams) ToolResult;

pub const Tool = struct {
    name: []const u8,
    description: []const u8,
    execute: ToolExecuteFn,
};

pub const ToolRegistry = struct {
    tools: std.StringHashMap(Tool),
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .tools = std.StringHashMap(Tool).init(allocator),
            .allocator = allocator,
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
        self.register(read_file.read_file_tool);
        self.register(write_file.write_file_tool);
        self.register(edit_file.edit_file_tool);
        self.register(bash.bash_tool);
        self.register(glob.glob_tool);
        self.register(grep.grep_tool);
        self.register(list_dir.list_dir_tool);
        return self;
    }

    pub fn deinit(self: *Self) void {
        self.tools.deinit();
    }

    pub fn register(self: *Self, tool: Tool) void {
        self.tools.put(tool.name, tool) catch {};
    }

    pub fn get(self: *Self, name: []const u8) ?Tool {
        return self.tools.get(name);
    }

    pub fn execute(self: *Self, name: []const u8, args: std.json.Value) ToolResult {
        const tool = self.tools.get(name) orelse {
            return ToolResult.err("Unknown tool");
        };
        return tool.execute(.{
            .allocator = self.allocator,
            .args = args,
        });
    }

    pub fn count(self: *Self) usize {
        return self.tools.count();
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

test "ToolRegistry execute" {
    const allocator = std.testing.allocator;
    var registry = ToolRegistry.init(allocator);
    defer registry.deinit();

    registry.register(.{
        .name = "echo",
        .description = "Echo tool",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("echoed");
            }
        }.exec,
    });

    const result = registry.execute("echo", .null);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("echoed", result.content);

    const unknown = registry.execute("unknown", .null);
    try std.testing.expect(!unknown.success);
}
