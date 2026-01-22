// Component System per God-TUI spec §4
// Type-erased component interface with focus management

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

/// Type-erased component interface
pub const Component = struct {
    ptr: *anyopaque,
    vtable: *const VTable,

    pub const VTable = struct {
        render: *const fn (ptr: *anyopaque, width: u16, allocator: Allocator) RenderError![][]const u8,
        invalidate: *const fn (ptr: *anyopaque) void,
        handleInput: ?*const fn (ptr: *anyopaque, data: []const u8) void = null,
        wantsKeyRelease: bool = false,
        deinit: ?*const fn (ptr: *anyopaque, allocator: Allocator) void = null,
    };

    pub const RenderError = error{OutOfMemory};

    pub fn render(self: Component, width: u16, allocator: Allocator) RenderError![][]const u8 {
        return self.vtable.render(self.ptr, width, allocator);
    }

    pub fn invalidate(self: Component) void {
        self.vtable.invalidate(self.ptr);
    }

    pub fn handleInput(self: Component, data: []const u8) void {
        if (self.vtable.handleInput) |handler| {
            handler(self.ptr, data);
        }
    }

    pub fn wantsKeyRelease(self: Component) bool {
        return self.vtable.wantsKeyRelease;
    }

    pub fn deinit(self: Component, allocator: Allocator) void {
        if (self.vtable.deinit) |deinit_fn| {
            deinit_fn(self.ptr, allocator);
        }
    }
};

/// Focusable component wrapper
pub const Focusable = struct {
    component: Component,
    focused: bool = false,

    pub fn setFocused(self: *Focusable, focused: bool) void {
        self.focused = focused;
    }

    pub fn isFocused(self: *const Focusable) bool {
        return self.focused;
    }

    pub fn render(self: *const Focusable, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        return self.component.render(width, allocator);
    }

    pub fn handleInput(self: *const Focusable, data: []const u8) void {
        self.component.handleInput(data);
    }
};

/// Container for child components
pub const Container = struct {
    children: ArrayListUnmanaged(Component),
    allocator: Allocator,
    cached_lines: ?[][]const u8 = null,
    cached_width: u16 = 0,
    valid: bool = false,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .children = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
        for (self.children.items) |child| {
            child.deinit(self.allocator);
        }
        self.children.deinit(self.allocator);
    }

    pub fn addChild(self: *Self, child: Component) !void {
        try self.children.append(self.allocator, child);
        self.invalidate();
    }

    pub fn removeChild(self: *Self, child: Component) void {
        for (self.children.items, 0..) |c, i| {
            if (c.ptr == child.ptr) {
                _ = self.children.orderedRemove(i);
                self.invalidate();
                return;
            }
        }
    }

    pub fn clear(self: *Self) void {
        for (self.children.items) |child| {
            child.deinit(self.allocator);
        }
        self.children.clearRetainingCapacity();
        self.invalidate();
    }

    pub fn invalidate(self: *Self) void {
        self.valid = false;
        self.clearCache();
    }

    fn clearCache(self: *Self) void {
        if (self.cached_lines) |lines| {
            for (lines) |line| {
                self.allocator.free(line);
            }
            self.allocator.free(lines);
            self.cached_lines = null;
        }
    }

    pub fn render(self: *Self, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        // Invalidate if width changed
        if (self.cached_width != width) {
            self.valid = false;
        }

        if (self.valid) {
            if (self.cached_lines) |lines| {
                // Return copy of cached lines
                const result = try allocator.alloc([]const u8, lines.len);
                for (lines, 0..) |line, i| {
                    result[i] = try allocator.dupe(u8, line);
                }
                return result;
            }
        }

        var all_lines = ArrayListUnmanaged([]const u8){};
        errdefer {
            for (all_lines.items) |line| allocator.free(@constCast(line));
            all_lines.deinit(allocator);
        }

        for (self.children.items) |child| {
            const child_lines = try child.render(width, allocator);
            defer allocator.free(child_lines);
            for (child_lines) |line| {
                try all_lines.append(allocator, line);
            }
        }

        const result = try all_lines.toOwnedSlice(allocator);

        // Cache result
        self.clearCache();
        self.cached_lines = try self.allocator.alloc([]const u8, result.len);
        for (result, 0..) |line, i| {
            self.cached_lines.?[i] = try self.allocator.dupe(u8, line);
        }
        self.cached_width = width;
        self.valid = true;

        return result;
    }

    pub fn childCount(self: *const Self) usize {
        return self.children.items.len;
    }

    /// Convert to Component interface
    pub fn component(self: *Self) Component {
        return .{
            .ptr = self,
            .vtable = &vtable,
        };
    }

    const vtable = Component.VTable{
        .render = renderVtable,
        .invalidate = invalidateVtable,
    };

    fn renderVtable(ptr: *anyopaque, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        const self: *Self = @ptrCast(@alignCast(ptr));
        return self.render(width, allocator);
    }

    fn invalidateVtable(ptr: *anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.invalidate();
    }
};

// ============ Tests ============

test "Component basic interface" {
    const TestComponent = struct {
        value: u32,

        fn render(ptr: *anyopaque, _: u16, allocator: Allocator) Component.RenderError![][]const u8 {
            const self: *@This() = @ptrCast(@alignCast(ptr));
            const lines = try allocator.alloc([]const u8, 1);
            lines[0] = try std.fmt.allocPrint(allocator, "Value: {d}", .{self.value});
            return lines;
        }

        fn invalidate(_: *anyopaque) void {}
    };

    var tc = TestComponent{ .value = 42 };
    const vtable = Component.VTable{
        .render = TestComponent.render,
        .invalidate = TestComponent.invalidate,
    };
    const comp = Component{ .ptr = &tc, .vtable = &vtable };

    const allocator = std.testing.allocator;
    const lines = try comp.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expectEqualStrings("Value: 42", lines[0]);
}

test "Focusable focus state" {
    const DummyComponent = struct {
        fn render(_: *anyopaque, _: u16, allocator: Allocator) Component.RenderError![][]const u8 {
            return try allocator.alloc([]const u8, 0);
        }
        fn invalidate(_: *anyopaque) void {}
    };

    var dummy: u8 = 0;
    const vtable = Component.VTable{
        .render = DummyComponent.render,
        .invalidate = DummyComponent.invalidate,
    };
    var focusable = Focusable{
        .component = .{ .ptr = &dummy, .vtable = &vtable },
    };

    try std.testing.expect(!focusable.isFocused());
    focusable.setFocused(true);
    try std.testing.expect(focusable.isFocused());
    focusable.setFocused(false);
    try std.testing.expect(!focusable.isFocused());
}

test "Container add/remove/clear" {
    const allocator = std.testing.allocator;
    var container = Container.init(allocator);
    defer container.deinit();

    const DummyVTable = Component.VTable{
        .render = struct {
            fn f(_: *anyopaque, _: u16, alloc: Allocator) Component.RenderError![][]const u8 {
                return try alloc.alloc([]const u8, 0);
            }
        }.f,
        .invalidate = struct {
            fn f(_: *anyopaque) void {}
        }.f,
    };

    var d1: u8 = 1;
    var d2: u8 = 2;
    const c1 = Component{ .ptr = &d1, .vtable = &DummyVTable };
    const c2 = Component{ .ptr = &d2, .vtable = &DummyVTable };

    try container.addChild(c1);
    try std.testing.expectEqual(@as(usize, 1), container.childCount());

    try container.addChild(c2);
    try std.testing.expectEqual(@as(usize, 2), container.childCount());

    container.removeChild(c1);
    try std.testing.expectEqual(@as(usize, 1), container.childCount());

    container.clear();
    try std.testing.expectEqual(@as(usize, 0), container.childCount());
}

test "Container render concatenation" {
    const allocator = std.testing.allocator;
    var container = Container.init(allocator);
    defer container.deinit();

    const LineComponent = struct {
        line: []const u8,

        fn render(ptr: *anyopaque, _: u16, alloc: Allocator) Component.RenderError![][]const u8 {
            const self: *@This() = @ptrCast(@alignCast(ptr));
            const lines = try alloc.alloc([]const u8, 1);
            lines[0] = try alloc.dupe(u8, self.line);
            return lines;
        }

        fn invalidate(_: *anyopaque) void {}

        const vtable = Component.VTable{
            .render = render,
            .invalidate = invalidate,
        };
    };

    var lc1 = LineComponent{ .line = "Line 1" };
    var lc2 = LineComponent{ .line = "Line 2" };

    try container.addChild(.{ .ptr = &lc1, .vtable = &LineComponent.vtable });
    try container.addChild(.{ .ptr = &lc2, .vtable = &LineComponent.vtable });

    const lines = try container.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 2), lines.len);
    try std.testing.expectEqualStrings("Line 1", lines[0]);
    try std.testing.expectEqualStrings("Line 2", lines[1]);
}
