// Width calculation using libvaxis
// Delegates to vaxis.gwidth for accurate Unicode width handling

const std = @import("std");
const vaxis = @import("vaxis");

/// Width calculation method (re-exported from vaxis)
pub const Method = vaxis.gwidth.Method;

/// Calculate visible width of text using vaxis gwidth
/// Returns width in terminal columns
pub fn gwidth(str: []const u8, method: Method) u16 {
    return vaxis.gwidth.gwidth(str, method);
}

/// Calculate visible width using unicode method (default)
pub fn visibleWidth(text: []const u8) u16 {
    return gwidth(text, .unicode);
}

/// Calculate visible width using wcwidth method
pub fn visibleWidthWcwidth(text: []const u8) u16 {
    return gwidth(text, .wcwidth);
}

/// Calculate width without ZWJ sequences
pub fn visibleWidthNoZwj(text: []const u8) u16 {
    return gwidth(text, .no_zwj);
}

// ============ Tests ============

test "gwidth ASCII" {
    const width = gwidth("Hello, World!", .unicode);
    try std.testing.expectEqual(@as(u16, 13), width);
}

test "gwidth empty" {
    const width = gwidth("", .unicode);
    try std.testing.expectEqual(@as(u16, 0), width);
}

test "gwidth single char" {
    try std.testing.expectEqual(@as(u16, 1), gwidth("a", .unicode));
    try std.testing.expectEqual(@as(u16, 1), gwidth("a", .wcwidth));
}

test "visibleWidth convenience" {
    const width = visibleWidth("Hello");
    try std.testing.expectEqual(@as(u16, 5), width);
}

test "visibleWidthWcwidth convenience" {
    const width = visibleWidthWcwidth("Hello");
    try std.testing.expectEqual(@as(u16, 5), width);
}

test "gwidth emoji with ZWJ" {
    // Test emoji width (astronaut woman)
    const width_unicode = gwidth("\xF0\x9F\x91\xA9\xE2\x80\x8D\xF0\x9F\x9A\x80", .unicode);
    const width_wcwidth = gwidth("\xF0\x9F\x91\xA9\xE2\x80\x8D\xF0\x9F\x9A\x80", .wcwidth);
    const width_no_zwj = gwidth("\xF0\x9F\x91\xA9\xE2\x80\x8D\xF0\x9F\x9A\x80", .no_zwj);
    // Unicode mode should treat ZWJ sequence as single grapheme
    try std.testing.expectEqual(@as(u16, 2), width_unicode);
    // wcwidth counts each codepoint
    try std.testing.expectEqual(@as(u16, 4), width_wcwidth);
    // no_zwj splits on ZWJ
    try std.testing.expectEqual(@as(u16, 4), width_no_zwj);
}

test "gwidth emoji with VS16 selector" {
    // Heart with emoji variation selector
    const width = gwidth("\xE2\x9D\xA4\xEF\xB8\x8F", .unicode);
    try std.testing.expectEqual(@as(u16, 2), width);
}

test "gwidth zero-width space" {
    const width = gwidth("\u{200B}", .unicode);
    try std.testing.expectEqual(@as(u16, 0), width);
}

test "gwidth combining marks" {
    // 'a' + combining acute accent (NFD form) should be width 1
    const width = gwidth("a\u{0301}", .unicode);
    try std.testing.expectEqual(@as(u16, 1), width);
}

test "gwidth flag emoji" {
    // US flag should be width 2
    const width = gwidth("\xF0\x9F\x87\xBA\xF0\x9F\x87\xB8", .unicode);
    try std.testing.expectEqual(@as(u16, 2), width);
}

test "method enum values" {
    // Ensure method enum is accessible
    try std.testing.expect(Method.unicode != Method.wcwidth);
    try std.testing.expect(Method.wcwidth != Method.no_zwj);
}
