const std = @import("std");
const paste_mod = @import("../keys/paste.zig");

const PasteHandler = paste_mod.PasteHandler;

// ============================================================================
// Initialization Tests
// ============================================================================

test "PasteHandler init with default config" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    try std.testing.expectEqual(@as(usize, 10), handler.config.max_lines);
    try std.testing.expectEqual(@as(usize, 1000), handler.config.max_chars);
    try std.testing.expect(handler.config.collapse_large);
    try std.testing.expectEqual(@as(u32, 1), handler.next_id);
}

test "PasteHandler init with custom config" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{
        .max_lines = 5,
        .max_chars = 500,
        .collapse_large = false,
    });
    defer handler.deinit();

    try std.testing.expectEqual(@as(usize, 5), handler.config.max_lines);
    try std.testing.expectEqual(@as(usize, 500), handler.config.max_chars);
    try std.testing.expect(!handler.config.collapse_large);
}

// ============================================================================
// isLargePaste Detection Tests
// ============================================================================

test "isLargePaste empty string" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 3, .max_chars = 50 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste(""));
}

test "isLargePaste exactly at char limit" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 10 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste("1234567890")); // exactly 10
    try std.testing.expect(handler.isLargePaste("12345678901")); // 11
}

test "isLargePaste exactly at line limit" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 3, .max_chars = 1000 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste("a\nb\nc")); // 3 lines
    try std.testing.expect(handler.isLargePaste("a\nb\nc\nd")); // 4 lines
}

test "isLargePaste single line no newlines" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 1, .max_chars = 1000 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste("single line content"));
}

test "isLargePaste trailing newline counts" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 2, .max_chars = 1000 });
    defer handler.deinit();

    try std.testing.expect(!handler.isLargePaste("line1\n")); // 2 lines (empty after newline)
    try std.testing.expect(handler.isLargePaste("line1\nline2\n")); // 3 lines
}

test "isLargePaste multiple newlines in a row" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 3, .max_chars = 1000 });
    defer handler.deinit();

    try std.testing.expect(handler.isLargePaste("\n\n\n\n")); // 5 lines
}

test "isLargePaste prioritizes char limit" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 100, .max_chars = 10 });
    defer handler.deinit();

    try std.testing.expect(handler.isLargePaste("12345678901")); // over char limit, under line limit
}

// ============================================================================
// handlePaste Tests - Small Pastes
// ============================================================================

test "handlePaste small content passthrough" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    const content = "small paste";
    const result = try handler.handlePaste(content);

    try std.testing.expectEqualStrings(content, result.text);
    try std.testing.expect(!result.is_placeholder);
    try std.testing.expect(result.id == null);
}

test "handlePaste empty content passthrough" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    const result = try handler.handlePaste("");

    try std.testing.expectEqualStrings("", result.text);
    try std.testing.expect(!result.is_placeholder);
    try std.testing.expect(result.id == null);
}

test "handlePaste with unicode passthrough" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    const content = "こんにちは 🎉 émojis";
    const result = try handler.handlePaste(content);

    try std.testing.expectEqualStrings(content, result.text);
    try std.testing.expect(!result.is_placeholder);
}

// ============================================================================
// handlePaste Tests - Large Pastes (Collapsed)
// ============================================================================

test "handlePaste large by chars creates placeholder" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 10 });
    defer handler.deinit();

    const content = "this exceeds ten chars";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(result.id != null);
    try std.testing.expectEqual(@as(u32, 1), result.id.?);
}

test "handlePaste large by lines creates placeholder" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 2, .max_chars = 10000 });
    defer handler.deinit();

    const content = "line1\nline2\nline3";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(result.id != null);
}

test "handlePaste placeholder text format" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = "line one\nline two";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(std.mem.indexOf(u8, result.text, "Paste #1") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "2 lines") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "17 chars") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "Ctrl+E to expand") != null);
}

test "handlePaste increments id for each large paste" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const result1 = try handler.handlePaste("first large paste");
    defer if (result1.is_placeholder) allocator.free(result1.text);

    const result2 = try handler.handlePaste("second large paste");
    defer if (result2.is_placeholder) allocator.free(result2.text);

    const result3 = try handler.handlePaste("third large paste");
    defer if (result3.is_placeholder) allocator.free(result3.text);

    try std.testing.expectEqual(@as(u32, 1), result1.id.?);
    try std.testing.expectEqual(@as(u32, 2), result2.id.?);
    try std.testing.expectEqual(@as(u32, 3), result3.id.?);
}

test "handlePaste stores content for expansion" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = "original content to store";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    const stored = handler.expandPlaceholder(result.id.?);
    try std.testing.expect(stored != null);
    try std.testing.expectEqualStrings(content, stored.?);
}

// ============================================================================
// handlePaste Tests - collapse_large = false
// ============================================================================

test "handlePaste collapse_large false passes all content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5, .collapse_large = false });
    defer handler.deinit();

    const content = "this would be collapsed if collapse_large was true";
    const result = try handler.handlePaste(content);

    try std.testing.expect(!result.is_placeholder);
    try std.testing.expect(result.id == null);
    try std.testing.expectEqualStrings(content, result.text);
}

test "handlePaste collapse_large false no storage" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5, .collapse_large = false });
    defer handler.deinit();

    _ = try handler.handlePaste("large paste content");

    try std.testing.expectEqual(@as(usize, 0), handler.stored_pastes.count());
}

// ============================================================================
// expandPlaceholder Tests
// ============================================================================

test "expandPlaceholder returns stored content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = "stored paste content";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    const expanded = handler.expandPlaceholder(result.id.?);
    try std.testing.expect(expanded != null);
    try std.testing.expectEqualStrings(content, expanded.?);
}

test "expandPlaceholder invalid id returns null" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    try std.testing.expect(handler.expandPlaceholder(999) == null);
    try std.testing.expect(handler.expandPlaceholder(0) == null);
}

test "expandPlaceholder multiple stored pastes" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content1 = "first paste content";
    const content2 = "second paste content";
    const content3 = "third paste content";

    const result1 = try handler.handlePaste(content1);
    defer if (result1.is_placeholder) allocator.free(result1.text);

    const result2 = try handler.handlePaste(content2);
    defer if (result2.is_placeholder) allocator.free(result2.text);

    const result3 = try handler.handlePaste(content3);
    defer if (result3.is_placeholder) allocator.free(result3.text);

    try std.testing.expectEqualStrings(content1, handler.expandPlaceholder(result1.id.?).?);
    try std.testing.expectEqualStrings(content2, handler.expandPlaceholder(result2.id.?).?);
    try std.testing.expectEqualStrings(content3, handler.expandPlaceholder(result3.id.?).?);
}

// ============================================================================
// getPlaceholder Tests
// ============================================================================

test "getPlaceholder returns formatted text" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = "line1\nline2\nline3";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    const placeholder = handler.getPlaceholder(result.id.?);
    defer if (placeholder) |p| allocator.free(p);

    try std.testing.expect(placeholder != null);
    try std.testing.expect(std.mem.indexOf(u8, placeholder.?, "Paste #1") != null);
    try std.testing.expect(std.mem.indexOf(u8, placeholder.?, "3 lines") != null);
}

test "getPlaceholder invalid id returns null" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    try std.testing.expect(handler.getPlaceholder(999) == null);
}

// ============================================================================
// freePlaceholder Tests
// ============================================================================

test "freePlaceholder removes stored content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const result = try handler.handlePaste("content to free");
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(handler.expandPlaceholder(result.id.?) != null);

    handler.freePlaceholder(result.id.?);

    try std.testing.expect(handler.expandPlaceholder(result.id.?) == null);
}

test "freePlaceholder invalid id is safe" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{});
    defer handler.deinit();

    handler.freePlaceholder(999);
    handler.freePlaceholder(0);
}

test "freePlaceholder only removes specified id" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const result1 = try handler.handlePaste("first");
    defer if (result1.is_placeholder) allocator.free(result1.text);

    const result2 = try handler.handlePaste("second");
    defer if (result2.is_placeholder) allocator.free(result2.text);

    handler.freePlaceholder(result1.id.?);

    try std.testing.expect(handler.expandPlaceholder(result1.id.?) == null);
    try std.testing.expect(handler.expandPlaceholder(result2.id.?) != null);
}

test "freePlaceholder double free is safe" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const result = try handler.handlePaste("content");
    defer if (result.is_placeholder) allocator.free(result.text);

    handler.freePlaceholder(result.id.?);
    handler.freePlaceholder(result.id.?);
}

// ============================================================================
// Edge Cases and Buffer Management
// ============================================================================

test "deinit frees all stored pastes" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });

    const result1 = try handler.handlePaste("paste one");
    if (result1.is_placeholder) allocator.free(result1.text);

    const result2 = try handler.handlePaste("paste two");
    if (result2.is_placeholder) allocator.free(result2.text);

    const result3 = try handler.handlePaste("paste three");
    if (result3.is_placeholder) allocator.free(result3.text);

    handler.deinit();
}

test "handle very long single line" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 100 });
    defer handler.deinit();

    const long_line = "a" ** 150;
    const result = try handler.handlePaste(long_line);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "1 lines") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "150 chars") != null);
}

test "handle many lines small content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_lines = 5, .max_chars = 10000 });
    defer handler.deinit();

    const many_lines = "a\nb\nc\nd\ne\nf\ng\nh";
    const result = try handler.handlePaste(many_lines);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);
    try std.testing.expect(std.mem.indexOf(u8, result.text, "8 lines") != null);
}

test "handle content with special characters" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = "tab\there\nnewline\r\nwindows\x00null";
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);

    const expanded = handler.expandPlaceholder(result.id.?);
    try std.testing.expectEqualStrings(content, expanded.?);
}

test "handle binary-like content" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 5 });
    defer handler.deinit();

    const content = &[_]u8{ 0x00, 0x01, 0x02, 0xFF, 0xFE, 0x0A, 0x0D, 0x7F };
    const result = try handler.handlePaste(content);
    defer if (result.is_placeholder) allocator.free(result.text);

    try std.testing.expect(result.is_placeholder);

    const expanded = handler.expandPlaceholder(result.id.?);
    try std.testing.expectEqualSlices(u8, content, expanded.?);
}

test "id counter persists across mixed paste sizes" {
    const allocator = std.testing.allocator;
    var handler = PasteHandler.init(allocator, .{ .max_chars = 10 });
    defer handler.deinit();

    _ = try handler.handlePaste("small");
    try std.testing.expectEqual(@as(u32, 1), handler.next_id);

    const result1 = try handler.handlePaste("this is large paste");
    defer if (result1.is_placeholder) allocator.free(result1.text);
    try std.testing.expectEqual(@as(u32, 1), result1.id.?);
    try std.testing.expectEqual(@as(u32, 2), handler.next_id);

    _ = try handler.handlePaste("tiny");
    try std.testing.expectEqual(@as(u32, 2), handler.next_id);

    const result2 = try handler.handlePaste("another large one");
    defer if (result2.is_placeholder) allocator.free(result2.text);
    try std.testing.expectEqual(@as(u32, 2), result2.id.?);
    try std.testing.expectEqual(@as(u32, 3), handler.next_id);
}
