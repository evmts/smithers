const std = @import("std");
const overlay = @import("../overlay/overlay.zig");

// ============ SizeValue tests ============

test "SizeValue absolute resolves to value" {
    const size = overlay.SizeValue{ .absolute = 100 };
    try std.testing.expectEqual(@as(u16, 100), size.resolve(500));
    try std.testing.expectEqual(@as(u16, 100), size.resolve(50));
}

test "SizeValue percent resolves correctly" {
    const size = overlay.SizeValue{ .percent = 50 };
    try std.testing.expectEqual(@as(u16, 50), size.resolve(100));
    try std.testing.expectEqual(@as(u16, 100), size.resolve(200));
}

test "SizeValue percent 100 gives full size" {
    const size = overlay.SizeValue{ .percent = 100 };
    try std.testing.expectEqual(@as(u16, 80), size.resolve(80));
}

test "SizeValue percent 0 gives zero" {
    const size = overlay.SizeValue{ .percent = 0 };
    try std.testing.expectEqual(@as(u16, 0), size.resolve(100));
}

test "SizeValue percent rounds down" {
    const size = overlay.SizeValue{ .percent = 33 };
    try std.testing.expectEqual(@as(u16, 33), size.resolve(100));
    try std.testing.expectEqual(@as(u16, 16), size.resolve(50));
}

// ============ Anchor tests ============

test "Anchor center resolves row" {
    const row = overlay.Anchor.center.resolveRow(20, 100, 5);
    try std.testing.expectEqual(@as(u16, 45), row); // 5 + (100 - 20) / 2
}

test "Anchor center resolves col" {
    const col = overlay.Anchor.center.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 40), col); // 10 + (100 - 40) / 2
}

test "Anchor top_left resolves to margins" {
    const row = overlay.Anchor.top_left.resolveRow(20, 100, 5);
    const col = overlay.Anchor.top_left.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 5), row);
    try std.testing.expectEqual(@as(u16, 10), col);
}

test "Anchor bottom_right resolves correctly" {
    const row = overlay.Anchor.bottom_right.resolveRow(20, 100, 5);
    const col = overlay.Anchor.bottom_right.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 85), row); // 5 + 100 - 20
    try std.testing.expectEqual(@as(u16, 70), col); // 10 + 100 - 40
}

test "Anchor top_center resolves correctly" {
    const row = overlay.Anchor.top_center.resolveRow(20, 100, 5);
    const col = overlay.Anchor.top_center.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 5), row);
    try std.testing.expectEqual(@as(u16, 40), col);
}

test "Anchor bottom_center resolves correctly" {
    const row = overlay.Anchor.bottom_center.resolveRow(20, 100, 5);
    const col = overlay.Anchor.bottom_center.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 85), row);
    try std.testing.expectEqual(@as(u16, 40), col);
}

test "Anchor left_center resolves correctly" {
    const row = overlay.Anchor.left_center.resolveRow(20, 100, 5);
    const col = overlay.Anchor.left_center.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 45), row);
    try std.testing.expectEqual(@as(u16, 10), col);
}

test "Anchor right_center resolves correctly" {
    const row = overlay.Anchor.right_center.resolveRow(20, 100, 5);
    const col = overlay.Anchor.right_center.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 45), row);
    try std.testing.expectEqual(@as(u16, 70), col);
}

test "Anchor cursor returns margin" {
    const row = overlay.Anchor.cursor.resolveRow(20, 100, 5);
    const col = overlay.Anchor.cursor.resolveCol(40, 100, 10);
    try std.testing.expectEqual(@as(u16, 5), row);
    try std.testing.expectEqual(@as(u16, 10), col);
}

test "Anchor resolves when overlay larger than available" {
    // When overlay is larger than available space, don't go negative
    const row = overlay.Anchor.bottom_right.resolveRow(200, 100, 0);
    try std.testing.expectEqual(@as(u16, 0), row);
}

// ============ Margin tests ============

test "Margin default values" {
    const margin = overlay.Margin{};
    try std.testing.expectEqual(@as(u16, 0), margin.top);
    try std.testing.expectEqual(@as(u16, 0), margin.right);
    try std.testing.expectEqual(@as(u16, 0), margin.bottom);
    try std.testing.expectEqual(@as(u16, 0), margin.left);
}

test "Margin uniform creates equal values" {
    const margin = overlay.Margin.uniform(10);
    try std.testing.expectEqual(@as(u16, 10), margin.top);
    try std.testing.expectEqual(@as(u16, 10), margin.right);
    try std.testing.expectEqual(@as(u16, 10), margin.bottom);
    try std.testing.expectEqual(@as(u16, 10), margin.left);
}

test "Margin individual values" {
    const margin = overlay.Margin{
        .top = 1,
        .right = 2,
        .bottom = 3,
        .left = 4,
    };
    try std.testing.expectEqual(@as(u16, 1), margin.top);
    try std.testing.expectEqual(@as(u16, 2), margin.right);
    try std.testing.expectEqual(@as(u16, 3), margin.bottom);
    try std.testing.expectEqual(@as(u16, 4), margin.left);
}

test "Margin uniform zero" {
    const margin = overlay.Margin.uniform(0);
    try std.testing.expectEqual(@as(u16, 0), margin.top);
}

// ============ Size checks ============

test "SizeValue size is reasonable" {
    try std.testing.expect(@sizeOf(overlay.SizeValue) <= 8);
}

test "Anchor size is minimal" {
    try std.testing.expect(@sizeOf(overlay.Anchor) <= 2);
}

test "Margin size is reasonable" {
    try std.testing.expect(@sizeOf(overlay.Margin) <= 16);
}

// ============ Anchor all variants ============

test "Anchor enum has expected variants" {
    const anchors = [_]overlay.Anchor{
        .center,
        .top_left,
        .top_right,
        .bottom_left,
        .bottom_right,
        .top_center,
        .bottom_center,
        .left_center,
        .right_center,
        .cursor,
    };
    try std.testing.expectEqual(@as(usize, 10), anchors.len);
}
