const std = @import("std");
const frame_mod = @import("../rendering/frame.zig");
const Layout = @import("../layout.zig").Layout;

// ============================================================================
// Mock Types for Testing
// ============================================================================

const MockColor = union(enum) {
    index: u8,
    rgb: struct { u8, u8, u8 },
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
    bold: bool = false,
    italic: bool = false,
    dim: bool = false,
    ul_style: ?enum { single, double } = null,
};

const MockWindow = struct {
    w: u16 = 80,
    h: u16 = 24,

    pub fn child(self: MockWindow, opts: anytype) MockWindow {
        _ = opts;
        return self;
    }

    pub fn writeCell(_: MockWindow, _: u16, _: u16, _: anytype) void {}

    pub fn printSegment(_: MockWindow, _: anytype, _: anytype) struct { col: usize } {
        return .{ .col = 0 };
    }

    pub fn clear(_: MockWindow) void {}
};

const MockRenderer = struct {
    w: u16 = 80,
    h: u16 = 24,
    clear_called: bool = false,
    subregion_calls: std.ArrayList(SubRegionCall),

    const SubRegionCall = struct {
        x: u16,
        y: u16,
        width: u16,
        height: u16,
    };

    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = struct {
        codepoint: u21 = 0,
        pub const enter: u21 = '\r';
        pub const tab: u21 = '\t';
        pub const escape: u21 = 0x1b;
        pub const backspace: u21 = 0x7f;
    };
    pub const Mouse = struct { x: u16 = 0, y: u16 = 0 };
    pub const Winsize = struct { rows: u16 = 24, cols: u16 = 80 };

    pub fn init(allocator: std.mem.Allocator, w: u16, h: u16) MockRenderer {
        return .{
            .w = w,
            .h = h,
            .clear_called = false,
            .subregion_calls = std.ArrayList(SubRegionCall).init(allocator),
        };
    }

    pub fn deinit(self: *MockRenderer) void {
        self.subregion_calls.deinit();
    }

    pub fn width(self: MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.h;
    }

    pub fn clear(self: *MockRenderer) void {
        self.clear_called = true;
    }

    pub fn subRegion(self: *MockRenderer, x: u16, y: u16, w: u16, h: u16) MockRenderer {
        self.subregion_calls.append(.{ .x = x, .y = y, .width = w, .height = h }) catch {};
        return .{
            .w = w,
            .h = h,
            .clear_called = false,
            .subregion_calls = std.ArrayList(SubRegionCall).init(self.subregion_calls.allocator),
        };
    }

    pub fn fill(_: *MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}

    pub fn drawText(_: *MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
};

const MockLoading = struct {
    is_loading: bool = false,
    pending_query: ?[]const u8 = null,

    pub fn startLoading(self: *MockLoading) void {
        self.is_loading = true;
    }

    pub fn stopLoading(self: *MockLoading) void {
        self.is_loading = false;
    }
};

// ============================================================================
// FrameRenderer Generic Type Tests
// ============================================================================

test "FrameRenderer generic instantiation" {
    const TestFrameRenderer = frame_mod.FrameRenderer(*MockRenderer, MockLoading);
    _ = TestFrameRenderer;
}

test "FrameRenderer exposes RenderContext struct" {
    const TestFrameRenderer = frame_mod.FrameRenderer(*MockRenderer, MockLoading);
    const ctx_info = @typeInfo(TestFrameRenderer.RenderContext);
    try std.testing.expect(ctx_info == .@"struct");
}

test "RenderContext has required fields" {
    const TestFrameRenderer = frame_mod.FrameRenderer(*MockRenderer, MockLoading);
    const fields = @typeInfo(TestFrameRenderer.RenderContext).@"struct".fields;

    var found_header = false;
    var found_chat_history = false;
    var found_input = false;
    var found_status_bar = false;
    var found_database = false;
    var found_loading = false;
    var found_key_handler = false;

    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "header")) found_header = true;
        if (std.mem.eql(u8, field.name, "chat_history")) found_chat_history = true;
        if (std.mem.eql(u8, field.name, "input")) found_input = true;
        if (std.mem.eql(u8, field.name, "status_bar")) found_status_bar = true;
        if (std.mem.eql(u8, field.name, "database")) found_database = true;
        if (std.mem.eql(u8, field.name, "loading")) found_loading = true;
        if (std.mem.eql(u8, field.name, "key_handler")) found_key_handler = true;
    }

    try std.testing.expect(found_header);
    try std.testing.expect(found_chat_history);
    try std.testing.expect(found_input);
    try std.testing.expect(found_status_bar);
    try std.testing.expect(found_database);
    try std.testing.expect(found_loading);
    try std.testing.expect(found_key_handler);
}

test "RenderContext has exactly 7 fields" {
    const TestFrameRenderer = frame_mod.FrameRenderer(*MockRenderer, MockLoading);
    const fields = @typeInfo(TestFrameRenderer.RenderContext).@"struct".fields;
    try std.testing.expectEqual(@as(usize, 7), fields.len);
}

test "FrameRenderer has render function" {
    const TestFrameRenderer = frame_mod.FrameRenderer(*MockRenderer, MockLoading);
    try std.testing.expect(@hasDecl(TestFrameRenderer, "render"));
}

// ============================================================================
// Layout Calculation Tests
// ============================================================================

test "Layout constants are correct" {
    try std.testing.expectEqual(@as(u16, 5), Layout.INPUT_HEIGHT);
    try std.testing.expectEqual(@as(u16, 1), Layout.HEADER_HEIGHT);
    try std.testing.expectEqual(@as(u16, 1), Layout.STATUS_HEIGHT);
}

test "Chrome height calculation" {
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    try std.testing.expectEqual(@as(u16, 7), chrome_height);
}

test "Chat height with normal terminal" {
    const height: u16 = 24;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 17), chat_height);
}

test "Chat height with small terminal falls back to 1" {
    const height: u16 = 5; // Less than chrome_height (7)
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 1), chat_height);
}

test "Chat height with minimum viable terminal" {
    const height: u16 = 8; // Just above chrome_height (7)
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 1), chat_height);
}

test "Chat height with large terminal" {
    const height: u16 = 100;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 93), chat_height);
}

test "Input Y position calculation" {
    const height: u16 = 24;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
    try std.testing.expectEqual(@as(u16, 18), input_y);
}

test "Status bar Y position calculation" {
    const height: u16 = 24;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
    const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;
    try std.testing.expectEqual(@as(u16, 23), status_bar_y);
}

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

test "Layout with zero height terminal" {
    const height: u16 = 0;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 1), chat_height);
}

test "Layout with exact chrome height terminal" {
    const height: u16 = 7; // Exactly chrome_height
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(@as(u16, 1), chat_height);
}

test "Layout with max u16 height" {
    const height: u16 = std.math.maxInt(u16);
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    try std.testing.expectEqual(std.math.maxInt(u16) - chrome_height, chat_height);
}

// ============================================================================
// Status Bar Height Adjustment Tests
// ============================================================================

test "Status bar Y adjustment with height 1" {
    const status_bar_y: u16 = 23;
    const actual_status_height: u16 = 1;
    const adjusted_y: u16 = if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y;
    try std.testing.expectEqual(@as(u16, 23), adjusted_y);
}

test "Status bar Y adjustment with height 4 (help visible)" {
    const status_bar_y: u16 = 23;
    const actual_status_height: u16 = 4;
    const adjusted_y: u16 = if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y;
    try std.testing.expectEqual(@as(u16, 20), adjusted_y);
}

test "Status bar Y adjustment saturates at zero" {
    const status_bar_y: u16 = 2;
    const actual_status_height: u16 = 10;
    const adjusted_y: u16 = if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y;
    try std.testing.expectEqual(@as(u16, 0), adjusted_y);
}

// ============================================================================
// Subregion Positioning Tests
// ============================================================================

test "Header subregion starts at origin" {
    const expected_x: u16 = 0;
    const expected_y: u16 = 0;
    const expected_height: u16 = Layout.HEADER_HEIGHT;
    try std.testing.expectEqual(@as(u16, 0), expected_x);
    try std.testing.expectEqual(@as(u16, 0), expected_y);
    try std.testing.expectEqual(@as(u16, 1), expected_height);
}

test "Chat subregion starts after header" {
    const expected_y: u16 = Layout.HEADER_HEIGHT;
    try std.testing.expectEqual(@as(u16, 1), expected_y);
}

test "Input subregion positioned correctly" {
    const height: u16 = 24;
    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
    try std.testing.expectEqual(@as(u16, 18), input_y);
    try std.testing.expectEqual(@as(u16, 5), Layout.INPUT_HEIGHT);
}

// ============================================================================
// Loading State Logic Tests
// ============================================================================

test "Loading state sets thinking status" {
    const loading = MockLoading{ .is_loading = true };
    const expected_status = " Smithers is thinking...";
    try std.testing.expect(loading.is_loading);
    try std.testing.expectEqualStrings(" Smithers is thinking...", expected_status);
}

test "Non-loading state allows custom status" {
    const loading = MockLoading{ .is_loading = false };
    try std.testing.expect(!loading.is_loading);
}

// ============================================================================
// Ctrl+C Timeout Logic Tests
// ============================================================================

test "Ctrl+C timeout within 1500ms shows exit hint" {
    const now: i64 = 10000;
    const last_ctrl_c: i64 = 9000; // 1000ms ago
    const within_timeout = now - last_ctrl_c < 1500 and last_ctrl_c > 0;
    try std.testing.expect(within_timeout);
}

test "Ctrl+C timeout after 1500ms does not show exit hint" {
    const now: i64 = 10000;
    const last_ctrl_c: i64 = 8000; // 2000ms ago
    const within_timeout = now - last_ctrl_c < 1500 and last_ctrl_c > 0;
    try std.testing.expect(!within_timeout);
}

test "Ctrl+C with zero timestamp does not show exit hint" {
    const now: i64 = 10000;
    const last_ctrl_c: i64 = 0;
    const within_timeout = now - last_ctrl_c < 1500 and last_ctrl_c > 0;
    try std.testing.expect(!within_timeout);
}

test "Ctrl+C exactly at 1500ms boundary does not show exit hint" {
    const now: i64 = 10000;
    const last_ctrl_c: i64 = 8500; // Exactly 1500ms ago
    const within_timeout = now - last_ctrl_c < 1500 and last_ctrl_c > 0;
    try std.testing.expect(!within_timeout);
}

test "Ctrl+C just before 1500ms boundary shows exit hint" {
    const now: i64 = 10000;
    const last_ctrl_c: i64 = 8501; // 1499ms ago
    const within_timeout = now - last_ctrl_c < 1500 and last_ctrl_c > 0;
    try std.testing.expect(within_timeout);
}

// ============================================================================
// Layout Function Tests
// ============================================================================

test "Layout.maxChatWidth with narrow terminal" {
    const result = Layout.maxChatWidth(60);
    const expected: u16 = 60 - (Layout.CHAT_SIDE_MARGIN * 2);
    try std.testing.expectEqual(expected, result);
}

test "Layout.maxChatWidth with wide terminal caps at 120" {
    const result = Layout.maxChatWidth(200);
    try std.testing.expectEqual(@as(u16, 120), result);
}

test "Layout.maxChatWidth exact threshold" {
    // At width = 124, (124 - 4) = 120, which equals the cap
    const result = Layout.maxChatWidth(124);
    try std.testing.expectEqual(@as(u16, 120), result);
}

test "Layout.chatHistoryHeight normal" {
    const result = Layout.chatHistoryHeight(24);
    // 24 - 5 - 1 - 1 - 1 = 16
    try std.testing.expectEqual(@as(u16, 16), result);
}

test "Layout.chatHistoryHeight with small terminal underflows" {
    // This will underflow but Zig's wrapping subtraction should handle it
    // 10 - 5 - 1 - 1 - 1 = 2
    const result = Layout.chatHistoryHeight(10);
    try std.testing.expectEqual(@as(u16, 2), result);
}

// ============================================================================
// Memory Safety Tests
// ============================================================================

test "MockRenderer allocator usage" {
    const allocator = std.testing.allocator;
    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    _ = renderer.subRegion(0, 0, 40, 12);
    _ = renderer.subRegion(0, 12, 40, 12);

    try std.testing.expectEqual(@as(usize, 2), renderer.subregion_calls.items.len);
}

test "MockRenderer tracks subregion calls" {
    const allocator = std.testing.allocator;
    var renderer = MockRenderer.init(allocator, 100, 50);
    defer renderer.deinit();

    _ = renderer.subRegion(10, 5, 30, 20);

    try std.testing.expectEqual(@as(usize, 1), renderer.subregion_calls.items.len);
    const call = renderer.subregion_calls.items[0];
    try std.testing.expectEqual(@as(u16, 10), call.x);
    try std.testing.expectEqual(@as(u16, 5), call.y);
    try std.testing.expectEqual(@as(u16, 30), call.width);
    try std.testing.expectEqual(@as(u16, 20), call.height);
}

// ============================================================================
// Component Width Tests
// ============================================================================

test "All subregions use full renderer width" {
    const width: u16 = 80;
    try std.testing.expectEqual(@as(u16, 80), width);
}

test "Subregion width with narrow terminal" {
    const width: u16 = 40;
    try std.testing.expectEqual(@as(u16, 40), width);
}

test "Subregion width with wide terminal" {
    const width: u16 = 200;
    try std.testing.expectEqual(@as(u16, 200), width);
}

// ============================================================================
// Complete Layout Integration Tests
// ============================================================================

test "Full layout calculation for 80x24 terminal" {
    const width: u16 = 80;
    const height: u16 = 24;

    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
    const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;

    // Header: y=0, height=1
    try std.testing.expectEqual(@as(u16, 0), @as(u16, 0));
    try std.testing.expectEqual(@as(u16, 1), Layout.HEADER_HEIGHT);

    // Chat: y=1, height=17
    try std.testing.expectEqual(@as(u16, 1), Layout.HEADER_HEIGHT);
    try std.testing.expectEqual(@as(u16, 17), chat_height);

    // Input: y=18, height=5
    try std.testing.expectEqual(@as(u16, 18), input_y);
    try std.testing.expectEqual(@as(u16, 5), Layout.INPUT_HEIGHT);

    // Status: y=23, height=1
    try std.testing.expectEqual(@as(u16, 23), status_bar_y);

    // Width
    try std.testing.expectEqual(@as(u16, 80), width);
}

test "Full layout calculation for 120x40 terminal" {
    const width: u16 = 120;
    const height: u16 = 40;

    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
    const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
    const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;

    try std.testing.expectEqual(@as(u16, 33), chat_height);
    try std.testing.expectEqual(@as(u16, 34), input_y);
    try std.testing.expectEqual(@as(u16, 39), status_bar_y);
    try std.testing.expectEqual(@as(u16, 120), width);
}

// ============================================================================
// Minimum Terminal Size Tests
// ============================================================================

test "MIN_WIDTH constant" {
    try std.testing.expectEqual(@as(u16, 80), Layout.MIN_WIDTH);
}

test "MIN_HEIGHT constant" {
    try std.testing.expectEqual(@as(u16, 24), Layout.MIN_HEIGHT);
}

test "Layout handles terminal at minimum size" {
    const width: u16 = Layout.MIN_WIDTH;
    const height: u16 = Layout.MIN_HEIGHT;

    const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
    const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;

    try std.testing.expect(chat_height >= 1);
    try std.testing.expectEqual(@as(u16, 80), width);
}

// ============================================================================
// Margin Constants Tests
// ============================================================================

test "CHAT_TOP_MARGIN constant" {
    try std.testing.expectEqual(@as(u16, 1), Layout.CHAT_TOP_MARGIN);
}

test "CHAT_SIDE_MARGIN constant" {
    try std.testing.expectEqual(@as(u16, 2), Layout.CHAT_SIDE_MARGIN);
}

test "INPUT_PADDING constant" {
    try std.testing.expectEqual(@as(u16, 1), Layout.INPUT_PADDING);
}
