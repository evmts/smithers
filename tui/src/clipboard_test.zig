const std = @import("std");
const clipboard = @import("clipboard.zig");

const Clipboard = clipboard.Clipboard;
const MockClipboard = clipboard.MockClipboard;

test "MockClipboard" {
    const TestClipboard = Clipboard(MockClipboard);
    MockClipboard.reset();

    try TestClipboard.copy(std.testing.allocator, "test");
    try std.testing.expectEqualStrings("test", MockClipboard.getLastCopied().?);
    try std.testing.expectEqual(@as(usize, 1), MockClipboard.getCopyCount());
}
