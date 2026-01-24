const std = @import("std");
const clipboard_mod = @import("../clipboard.zig");

const MockClipboard = clipboard_mod.MockClipboard;
const Clipboard = clipboard_mod.Clipboard;

test "MockClipboard initial state" {
    MockClipboard.reset();

    try std.testing.expectEqual(@as(?[]const u8, null), MockClipboard.getLastCopied());
    try std.testing.expectEqual(@as(usize, 0), MockClipboard.getCopyCount());
}

test "MockClipboard copy stores text" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    try TestClipboard.copy(std.testing.allocator, "hello world");

    try std.testing.expectEqualStrings("hello world", MockClipboard.getLastCopied().?);
}

test "MockClipboard copy count increments" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    try TestClipboard.copy(std.testing.allocator, "first");
    try std.testing.expectEqual(@as(usize, 1), MockClipboard.getCopyCount());

    try TestClipboard.copy(std.testing.allocator, "second");
    try std.testing.expectEqual(@as(usize, 2), MockClipboard.getCopyCount());

    try TestClipboard.copy(std.testing.allocator, "third");
    try std.testing.expectEqual(@as(usize, 3), MockClipboard.getCopyCount());
}

test "MockClipboard reset clears state" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    try TestClipboard.copy(std.testing.allocator, "some text");
    try std.testing.expectEqual(@as(usize, 1), MockClipboard.getCopyCount());
    try std.testing.expect(MockClipboard.getLastCopied() != null);

    MockClipboard.reset();

    try std.testing.expectEqual(@as(?[]const u8, null), MockClipboard.getLastCopied());
    try std.testing.expectEqual(@as(usize, 0), MockClipboard.getCopyCount());
}

test "MockClipboard copy empty text" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    try TestClipboard.copy(std.testing.allocator, "");

    try std.testing.expectEqualStrings("", MockClipboard.getLastCopied().?);
    try std.testing.expectEqual(@as(usize, 1), MockClipboard.getCopyCount());
}

test "MockClipboard overwrites previous copy" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    try TestClipboard.copy(std.testing.allocator, "first value");
    try std.testing.expectEqualStrings("first value", MockClipboard.getLastCopied().?);

    try TestClipboard.copy(std.testing.allocator, "second value");
    try std.testing.expectEqualStrings("second value", MockClipboard.getLastCopied().?);
}

test "Clipboard DI interface works" {
    const CustomImpl = struct {
        var was_called: bool = false;
        var received_text: []const u8 = "";

        pub fn copy(_: std.mem.Allocator, text: []const u8) !void {
            was_called = true;
            received_text = text;
        }
    };

    const CustomClipboard = Clipboard(CustomImpl);

    try CustomClipboard.copy(std.testing.allocator, "custom test");

    try std.testing.expect(CustomImpl.was_called);
    try std.testing.expectEqualStrings("custom test", CustomImpl.received_text);
}

test "Clipboard DI with error-returning impl" {
    const ErrorImpl = struct {
        pub fn copy(_: std.mem.Allocator, _: []const u8) !void {
            return error.TestError;
        }
    };

    const ErrorClipboard = Clipboard(ErrorImpl);

    const result = ErrorClipboard.copy(std.testing.allocator, "should fail");
    try std.testing.expectError(error.TestError, result);
}

test "MockClipboard copy with special characters" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    const special_text = "hello\nworld\ttab\"quotes'single";
    try TestClipboard.copy(std.testing.allocator, special_text);

    try std.testing.expectEqualStrings(special_text, MockClipboard.getLastCopied().?);
}

test "MockClipboard copy with unicode" {
    MockClipboard.reset();
    const TestClipboard = Clipboard(MockClipboard);

    const unicode_text = "こんにちは 🎉 émojis";
    try TestClipboard.copy(std.testing.allocator, unicode_text);

    try std.testing.expectEqualStrings(unicode_text, MockClipboard.getLastCopied().?);
}
