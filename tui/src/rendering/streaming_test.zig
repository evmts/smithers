const std = @import("std");
const streaming = @import("streaming.zig");

const StreamingText = streaming.StreamingText;

test "StreamingText: append accumulates text" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Hello");
    try std.testing.expectEqualStrings("Hello", stream.getText());

    try stream.append(" World");
    try std.testing.expectEqualStrings("Hello World", stream.getText());

    try stream.append("!");
    try std.testing.expectEqualStrings("Hello World!", stream.getText());
}

test "StreamingText: completion state" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try std.testing.expect(!stream.isComplete());

    stream.complete();
    try std.testing.expect(stream.isComplete());
}

test "StreamingText: clear resets state" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Hello");
    stream.complete();

    stream.clear();
    try std.testing.expectEqualStrings("", stream.getText());
    try std.testing.expect(!stream.isComplete());
}

test "StreamingText: line wrapping at width" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("ABCDEFGHIJ");
    stream.complete();

    const lines = try stream.getDisplayLines(std.testing.allocator, 5);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 2), lines.len);
    try std.testing.expectEqualStrings("ABCDE", lines[0].text);
    try std.testing.expectEqualStrings("FGHIJ", lines[1].text);
}

test "StreamingText: newline handling" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Line1\nLine2\nLine3");
    stream.complete();

    const lines = try stream.getDisplayLines(std.testing.allocator, 80);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 3), lines.len);
    try std.testing.expectEqualStrings("Line1", lines[0].text);
    try std.testing.expectEqualStrings("Line2", lines[1].text);
    try std.testing.expectEqualStrings("Line3", lines[2].text);
}

test "StreamingText: shimmer on last chars when not complete" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Hello World!");

    const lines = try stream.getDisplayLines(std.testing.allocator, 80);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expectEqual(@as(usize, 4), lines[0].shimmer_start.?);
}

test "StreamingText: no shimmer when complete" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Hello World!");
    stream.complete();

    const lines = try stream.getDisplayLines(std.testing.allocator, 80);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(lines[0].shimmer_start == null);
}

test "StreamingText: tick advances animation" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    const initial_frame = stream.animation_frame;
    stream.tick();
    try std.testing.expectEqual(initial_frame + 1, stream.animation_frame);

    stream.animation_frame = 7;
    stream.tick();
    try std.testing.expectEqual(@as(u8, 0), stream.animation_frame);
}

test "StreamingText: tick does nothing when complete" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    stream.complete();
    const initial_frame = stream.animation_frame;
    stream.tick();
    try std.testing.expectEqual(initial_frame, stream.animation_frame);
}

test "StreamingText: empty text returns empty lines" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    const lines = try stream.getDisplayLines(std.testing.allocator, 80);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "StreamingText: zero width returns empty lines" {
    var stream = StreamingText.init(std.testing.allocator);
    defer stream.deinit();

    try stream.append("Hello");

    const lines = try stream.getDisplayLines(std.testing.allocator, 0);
    defer StreamingText.freeDisplayLines(std.testing.allocator, lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}
