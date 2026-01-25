const std = @import("std");
const paste = @import("paste.zig");

const PasteHandler = paste.PasteHandler;

test "small paste passthrough" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    const content = "hello world";
    const result = try handler.handlePaste(content);

    try std.testing.expectEqualStrings("hello world", result.text);
    try std.testing.expect(!result.is_placeholder);
    try std.testing.expect(result.id == null);
}

test "large paste by char count becomes placeholder" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 20 });
    defer handler.deinit();

    const content = "this is a very long paste that exceeds the limit";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(result.id != null);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "Paste #1") != null);
}

test "large paste by line count becomes placeholder" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 2 });
    defer handler.deinit();

    const content = "line1\nline2\nline3\nline4";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(result.id != null);
}

test "expand placeholder returns original content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 10 });
    defer handler.deinit();

    const content = "this is the original pasted content";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.id != null);

    const expanded = handler.expandPlaceholder(result.id.?);
    try std.testing.expect(expanded != null);
    try std.testing.expectEqualStrings(content, expanded.?);
}

test "isLargePaste detection" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 3, .max_chars = 50 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste("small"));
    try std.testing.expect(!handler.isLargePaste("line1\nline2"));
    try std.testing.expect(handler.isLargePaste("line1\nline2\nline3\nline4"));
    try std.testing.expect(handler.isLargePaste("a" ** 51));
}

test "collapse_large false passes through all pastes" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5, .collapse_large = false });
    defer handler.deinit();

    const content = "this would normally be collapsed";
    const result = try handler.handlePaste(content);

    try std.testing.expect(!result.is_placeholder);
    try std.testing.expectEqualStrings(content, result.text);
}
