const std = @import("std");
const box = @import("../components/box.zig");

// ============================================================================
// BorderStyle Tests
// ============================================================================

test "BorderStyle.chars returns correct chars for none" {
    const chars = box.BorderStyle.none.chars();
    try std.testing.expectEqualStrings(" ", chars.tl);
    try std.testing.expectEqualStrings(" ", chars.tr);
    try std.testing.expectEqualStrings(" ", chars.bl);
    try std.testing.expectEqualStrings(" ", chars.br);
    try std.testing.expectEqualStrings(" ", chars.h);
    try std.testing.expectEqualStrings(" ", chars.v);
}

test "BorderStyle.chars returns correct chars for single" {
    const chars = box.BorderStyle.single.chars();
    try std.testing.expectEqualStrings("┌", chars.tl);
    try std.testing.expectEqualStrings("┐", chars.tr);
    try std.testing.expectEqualStrings("└", chars.bl);
    try std.testing.expectEqualStrings("┘", chars.br);
    try std.testing.expectEqualStrings("─", chars.h);
    try std.testing.expectEqualStrings("│", chars.v);
}

test "BorderStyle.chars returns correct chars for double" {
    const chars = box.BorderStyle.double.chars();
    try std.testing.expectEqualStrings("╔", chars.tl);
    try std.testing.expectEqualStrings("╗", chars.tr);
    try std.testing.expectEqualStrings("╚", chars.bl);
    try std.testing.expectEqualStrings("╝", chars.br);
    try std.testing.expectEqualStrings("═", chars.h);
    try std.testing.expectEqualStrings("║", chars.v);
}

test "BorderStyle.chars returns correct chars for rounded" {
    const chars = box.BorderStyle.rounded.chars();
    try std.testing.expectEqualStrings("╭", chars.tl);
    try std.testing.expectEqualStrings("╮", chars.tr);
    try std.testing.expectEqualStrings("╰", chars.bl);
    try std.testing.expectEqualStrings("╯", chars.br);
    try std.testing.expectEqualStrings("─", chars.h);
    try std.testing.expectEqualStrings("│", chars.v);
}

test "BorderStyle.chars returns correct chars for heavy" {
    const chars = box.BorderStyle.heavy.chars();
    try std.testing.expectEqualStrings("┏", chars.tl);
    try std.testing.expectEqualStrings("┓", chars.tr);
    try std.testing.expectEqualStrings("┗", chars.bl);
    try std.testing.expectEqualStrings("┛", chars.br);
    try std.testing.expectEqualStrings("━", chars.h);
    try std.testing.expectEqualStrings("┃", chars.v);
}

test "BorderStyle.chars returns correct chars for ascii" {
    const chars = box.BorderStyle.ascii.chars();
    try std.testing.expectEqualStrings("+", chars.tl);
    try std.testing.expectEqualStrings("+", chars.tr);
    try std.testing.expectEqualStrings("+", chars.bl);
    try std.testing.expectEqualStrings("+", chars.br);
    try std.testing.expectEqualStrings("-", chars.h);
    try std.testing.expectEqualStrings("|", chars.v);
}

test "BorderStyle enum has all expected variants" {
    const styles = [_]box.BorderStyle{
        .none,
        .single,
        .double,
        .rounded,
        .heavy,
        .ascii,
    };
    try std.testing.expectEqual(@as(usize, 6), styles.len);
}

// ============================================================================
// BorderChars Tests
// ============================================================================

test "BorderChars struct has all required fields" {
    const chars = box.BorderChars{
        .tl = "A",
        .tr = "B",
        .bl = "C",
        .br = "D",
        .h = "E",
        .v = "F",
    };
    try std.testing.expectEqualStrings("A", chars.tl);
    try std.testing.expectEqualStrings("B", chars.tr);
    try std.testing.expectEqualStrings("C", chars.bl);
    try std.testing.expectEqualStrings("D", chars.br);
    try std.testing.expectEqualStrings("E", chars.h);
    try std.testing.expectEqualStrings("F", chars.v);
}

// ============================================================================
// BoxStyle Tests
// ============================================================================

test "BoxStyle default values" {
    const style = box.BoxStyle{};
    try std.testing.expectEqual(box.BorderStyle.single, style.border);
    try std.testing.expectEqual(@as(u8, 240), style.border_color);
    try std.testing.expectEqual(@as(u16, 0), style.padding_left);
    try std.testing.expectEqual(@as(u16, 0), style.padding_right);
    try std.testing.expectEqual(@as(u16, 0), style.padding_top);
    try std.testing.expectEqual(@as(u16, 0), style.padding_bottom);
    try std.testing.expect(style.title == null);
    try std.testing.expectEqual(@as(u8, 75), style.title_color);
}

test "BoxStyle with custom values" {
    const style = box.BoxStyle{
        .border = .rounded,
        .border_color = 100,
        .padding_left = 2,
        .padding_right = 3,
        .padding_top = 1,
        .padding_bottom = 1,
        .title = "Test Box",
        .title_color = 200,
    };
    try std.testing.expectEqual(box.BorderStyle.rounded, style.border);
    try std.testing.expectEqual(@as(u8, 100), style.border_color);
    try std.testing.expectEqual(@as(u16, 2), style.padding_left);
    try std.testing.expectEqual(@as(u16, 3), style.padding_right);
    try std.testing.expectEqual(@as(u16, 1), style.padding_top);
    try std.testing.expectEqual(@as(u16, 1), style.padding_bottom);
    try std.testing.expectEqualStrings("Test Box", style.title.?);
    try std.testing.expectEqual(@as(u8, 200), style.title_color);
}

test "BoxStyle border_color in valid ANSI 256 range" {
    const style = box.BoxStyle{};
    try std.testing.expect(style.border_color <= 255);
}

test "BoxStyle title_color in valid ANSI 256 range" {
    const style = box.BoxStyle{};
    try std.testing.expect(style.title_color <= 255);
}

// ============================================================================
// Mock Renderer for Box Tests
// ============================================================================

const MockBackend = struct {
    pub const Window = struct {};
    pub const Color = union(enum) {
        index: u8,
        rgb: struct { u8, u8, u8 },
    };
    pub const Style = struct {
        fg: ?Color = null,
        bg: ?Color = null,
        bold: bool = false,
    };
    pub const Key = struct {};
    pub const Mouse = struct {};
    pub const Winsize = struct {};
};

const MockRenderer = struct {
    pub const Style = MockBackend.Style;

    w: u16,
    h: u16,
    cells_drawn: usize = 0,
    text_drawn: usize = 0,

    pub fn width(self: *const MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: *const MockRenderer) u16 {
        return self.h;
    }

    pub fn drawCell(self: *MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {
        self.cells_drawn += 1;
    }

    pub fn drawText(self: *MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {
        self.text_drawn += 1;
    }

    pub fn subRegion(self: *const MockRenderer, x: u16, y: u16, w: u16, h: u16) MockRenderer {
        _ = x;
        _ = y;
        return .{ .w = w, .h = h };
    }
};

const TestBox = box.Box(MockRenderer);

// ============================================================================
// Box Init Tests
// ============================================================================

test "Box.init creates box with default style" {
    const b = TestBox.init();
    try std.testing.expectEqual(box.BorderStyle.single, b.style.border);
    try std.testing.expectEqual(@as(u8, 240), b.style.border_color);
    try std.testing.expect(b.style.title == null);
}

test "Box.initWithStyle creates box with custom style" {
    const style = box.BoxStyle{
        .border = .double,
        .title = "Custom",
    };
    const b = TestBox.initWithStyle(style);
    try std.testing.expectEqual(box.BorderStyle.double, b.style.border);
    try std.testing.expectEqualStrings("Custom", b.style.title.?);
}

test "Box.setStyle updates style" {
    var b = TestBox.init();
    try std.testing.expectEqual(box.BorderStyle.single, b.style.border);

    b.setStyle(.{ .border = .heavy });
    try std.testing.expectEqual(box.BorderStyle.heavy, b.style.border);
}

test "Box.setTitle updates title" {
    var b = TestBox.init();
    try std.testing.expect(b.style.title == null);

    b.setTitle("New Title");
    try std.testing.expectEqualStrings("New Title", b.style.title.?);

    b.setTitle(null);
    try std.testing.expect(b.style.title == null);
}

// ============================================================================
// Box contentRegion Tests
// ============================================================================

test "Box.contentRegion with border reduces dimensions by 2" {
    const b = TestBox.init();
    var renderer = MockRenderer{ .w = 20, .h = 10 };
    const content = b.contentRegion(&renderer);

    try std.testing.expectEqual(@as(u16, 18), content.w);
    try std.testing.expectEqual(@as(u16, 8), content.h);
}

test "Box.contentRegion with no border uses full dimensions" {
    const b = TestBox.initWithStyle(.{ .border = .none });
    var renderer = MockRenderer{ .w = 20, .h = 10 };
    const content = b.contentRegion(&renderer);

    try std.testing.expectEqual(@as(u16, 20), content.w);
    try std.testing.expectEqual(@as(u16, 10), content.h);
}

test "Box.contentRegion with padding reduces dimensions" {
    const b = TestBox.initWithStyle(.{
        .border = .single,
        .padding_left = 2,
        .padding_right = 3,
        .padding_top = 1,
        .padding_bottom = 1,
    });
    var renderer = MockRenderer{ .w = 30, .h = 20 };
    const content = b.contentRegion(&renderer);

    // 30 - 2 (border) - 2 (left) - 3 (right) = 23
    try std.testing.expectEqual(@as(u16, 23), content.w);
    // 20 - 2 (border) - 1 (top) - 1 (bottom) = 16
    try std.testing.expectEqual(@as(u16, 16), content.h);
}

test "Box.contentRegion with no border but padding" {
    const b = TestBox.initWithStyle(.{
        .border = .none,
        .padding_left = 5,
        .padding_right = 5,
        .padding_top = 2,
        .padding_bottom = 2,
    });
    var renderer = MockRenderer{ .w = 40, .h = 30 };
    const content = b.contentRegion(&renderer);

    // 40 - 0 (border) - 5 - 5 = 30
    try std.testing.expectEqual(@as(u16, 30), content.w);
    // 30 - 0 (border) - 2 - 2 = 26
    try std.testing.expectEqual(@as(u16, 26), content.h);
}

test "Box.contentRegion minimum dimension is 1" {
    const b = TestBox.initWithStyle(.{
        .border = .single,
        .padding_left = 100,
        .padding_right = 100,
    });
    var renderer = MockRenderer{ .w = 10, .h = 10 };
    const content = b.contentRegion(&renderer);

    // Should clamp to minimum 1
    try std.testing.expectEqual(@as(u16, 1), content.w);
}

// ============================================================================
// Box draw Tests
// ============================================================================

test "Box.draw with none border does nothing" {
    const b = TestBox.initWithStyle(.{ .border = .none });
    var renderer = MockRenderer{ .w = 20, .h = 10 };
    b.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 0), renderer.cells_drawn);
}

test "Box.draw with small dimensions does nothing" {
    const b = TestBox.init();
    var renderer = MockRenderer{ .w = 1, .h = 1 };
    b.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 0), renderer.cells_drawn);
}

test "Box.draw with valid dimensions draws border" {
    const b = TestBox.init();
    var renderer = MockRenderer{ .w = 10, .h = 5 };
    b.draw(&renderer);

    // Should draw corners + edges
    try std.testing.expect(renderer.cells_drawn > 0);
}

test "Box.draw with title draws title" {
    const b = TestBox.initWithStyle(.{ .title = "Test" });
    var renderer = MockRenderer{ .w = 20, .h = 10 };
    b.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 1), renderer.text_drawn);
}

test "Box.draw without title does not draw text" {
    const b = TestBox.init();
    var renderer = MockRenderer{ .w = 20, .h = 10 };
    b.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 0), renderer.text_drawn);
}

// ============================================================================
// Box Type Tests
// ============================================================================

test "Box can be instantiated with MockRenderer" {
    _ = TestBox;
}

// ============================================================================
// Edge Cases
// ============================================================================

test "BoxStyle with zero padding" {
    const style = box.BoxStyle{
        .padding_left = 0,
        .padding_right = 0,
        .padding_top = 0,
        .padding_bottom = 0,
    };
    try std.testing.expectEqual(@as(u16, 0), style.padding_left);
    try std.testing.expectEqual(@as(u16, 0), style.padding_right);
    try std.testing.expectEqual(@as(u16, 0), style.padding_top);
    try std.testing.expectEqual(@as(u16, 0), style.padding_bottom);
}

test "BoxStyle with max u16 padding" {
    const style = box.BoxStyle{
        .padding_left = 65535,
        .padding_right = 65535,
        .padding_top = 65535,
        .padding_bottom = 65535,
    };
    try std.testing.expectEqual(@as(u16, 65535), style.padding_left);
    try std.testing.expectEqual(@as(u16, 65535), style.padding_right);
    try std.testing.expectEqual(@as(u16, 65535), style.padding_top);
    try std.testing.expectEqual(@as(u16, 65535), style.padding_bottom);
}

test "BoxStyle with empty title string" {
    const style = box.BoxStyle{
        .title = "",
    };
    try std.testing.expectEqualStrings("", style.title.?);
}

test "BorderChars can store multi-byte unicode" {
    const chars = box.BorderChars{
        .tl = "╭",
        .tr = "╮",
        .bl = "╰",
        .br = "╯",
        .h = "─",
        .v = "│",
    };
    try std.testing.expect(chars.tl.len > 1);
    try std.testing.expect(chars.tr.len > 1);
    try std.testing.expect(chars.bl.len > 1);
    try std.testing.expect(chars.br.len > 1);
    try std.testing.expect(chars.h.len > 1);
    try std.testing.expect(chars.v.len > 1);
}

test "All BorderStyle variants produce non-empty chars" {
    inline for (@typeInfo(box.BorderStyle).@"enum".fields) |field| {
        const style = @field(box.BorderStyle, field.name);
        const chars = style.chars();
        try std.testing.expect(chars.tl.len > 0);
        try std.testing.expect(chars.tr.len > 0);
        try std.testing.expect(chars.bl.len > 0);
        try std.testing.expect(chars.br.len > 0);
        try std.testing.expect(chars.h.len > 0);
        try std.testing.expect(chars.v.len > 0);
    }
}
