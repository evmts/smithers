// Component System Tests per God-TUI spec §4
// Aggregate test module for all component tests

const std = @import("std");

// Import all component modules to run their tests
pub const component = @import("component.zig");
pub const text = @import("text.zig");
pub const box = @import("box.zig");
pub const loader = @import("loader.zig");
pub const select_list = @import("select_list.zig");

test {
    std.testing.refAllDecls(@This());
}

// ============ Integration Tests ============

test "Component composition: Box with Text" {
    const allocator = std.testing.allocator;

    var text_comp = text.Text.init(allocator, "Hello World");
    var box_comp = box.Box.init(allocator);
    defer box_comp.deinit();

    box_comp.setChild(text_comp.component());

    const lines = try box_comp.render(30, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Top border + content + bottom border
    try std.testing.expectEqual(@as(usize, 3), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[1], "Hello World") != null);
}

test "Container with multiple components" {
    const allocator = std.testing.allocator;

    var container = component.Container.init(allocator);
    defer container.deinit();

    var text1 = text.Text.init(allocator, "Line 1");
    var text2 = text.Text.init(allocator, "Line 2");
    var loader_comp = loader.Loader.initWithLabel(allocator, "Loading");

    try container.addChild(text1.component());
    try container.addChild(text2.component());
    try container.addChild(loader_comp.component());

    const lines = try container.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 3), lines.len);
}

test "Focusable SelectList" {
    const allocator = std.testing.allocator;

    var list = try select_list.SelectList.initWithItems(allocator, &.{ "Option A", "Option B", "Option C" });
    defer list.deinit();

    var focusable = list.focusable();
    try std.testing.expect(!focusable.isFocused());

    list.setFocused(true);
    try std.testing.expect(list.focused);

    // Render with focus
    const lines = try list.render(40, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Should have bold style (focused)
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "\x1b[1m") != null);
}

test "Box with SelectList" {
    const allocator = std.testing.allocator;

    var list = try select_list.SelectList.initWithItems(allocator, &.{ "A", "B" });
    var box_comp = box.Box.initWithStyle(allocator, .{
        .border = .rounded,
        .padding_top = 1,
        .padding_bottom = 1,
    });
    defer box_comp.deinit();

    box_comp.setChild(list.component());

    const lines = try box_comp.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Top border + top pad + 2 items + bottom pad + bottom border
    try std.testing.expectEqual(@as(usize, 6), lines.len);
    // Check rounded corners
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "╭") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[5], "╰") != null);
}

test "Nested boxes" {
    const allocator = std.testing.allocator;

    var inner_text = text.Text.init(allocator, "Inner");
    var inner_box = box.Box.initWithStyle(allocator, .{ .border = .single });
    inner_box.setChild(inner_text.component());

    var outer_box = box.Box.initWithStyle(allocator, .{ .border = .double });
    defer outer_box.deinit();
    outer_box.setChild(inner_box.component());

    const lines = try outer_box.render(30, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Outer top + inner top + content + inner bottom + outer bottom
    try std.testing.expectEqual(@as(usize, 5), lines.len);
    // Check double border on outer
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "╔") != null);
    // Check single border on inner
    try std.testing.expect(std.mem.indexOf(u8, lines[1], "┌") != null);
}
