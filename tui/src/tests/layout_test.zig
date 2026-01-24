const std = @import("std");
const layout = @import("../layout.zig");

// Mock backend for testing Colors and Styles without vaxis dependency
const MockBackend = struct {
    pub const Window = struct {};
    pub const Color = struct {
        rgb: ?struct { u8, u8, u8 } = null,
        indexed: ?u8 = null,
    };
    pub const Style = struct {
        fg: ?Color = null,
        bg: ?Color = null,
        bold: bool = false,
        italic: bool = false,
        dim: bool = false,
        ul_style: ?enum { single, double } = null,
    };
    pub const Key = struct {};
    pub const Mouse = struct {};
    pub const Winsize = struct {};
};

const MockRenderer = @import("../rendering/renderer.zig").Renderer(MockBackend);
const MockColors = layout.Colors(MockRenderer);
const MockStyles = layout.Styles(MockRenderer);

// ============================================================================
// Layout Constants Tests
// ============================================================================

test "Layout.INPUT_HEIGHT is positive" {
    try std.testing.expect(layout.Layout.INPUT_HEIGHT > 0);
}

test "Layout.HEADER_HEIGHT is positive" {
    try std.testing.expect(layout.Layout.HEADER_HEIGHT > 0);
}

test "Layout.STATUS_HEIGHT is positive" {
    try std.testing.expect(layout.Layout.STATUS_HEIGHT > 0);
}

test "Layout.MIN_WIDTH is reasonable" {
    try std.testing.expect(layout.Layout.MIN_WIDTH >= 40);
    try std.testing.expect(layout.Layout.MIN_WIDTH <= 200);
}

test "Layout.MIN_HEIGHT is reasonable" {
    try std.testing.expect(layout.Layout.MIN_HEIGHT >= 10);
    try std.testing.expect(layout.Layout.MIN_HEIGHT <= 100);
}

test "Layout.CHAT_TOP_MARGIN is non-negative" {
    try std.testing.expect(layout.Layout.CHAT_TOP_MARGIN >= 0);
}

test "Layout.CHAT_SIDE_MARGIN is non-negative" {
    try std.testing.expect(layout.Layout.CHAT_SIDE_MARGIN >= 0);
}

test "Layout.INPUT_PADDING is non-negative" {
    try std.testing.expect(layout.Layout.INPUT_PADDING >= 0);
}

test "Layout heights sum correctly for minimum terminal" {
    const min_height = layout.Layout.MIN_HEIGHT;
    const fixed_heights = layout.Layout.INPUT_HEIGHT +
        layout.Layout.HEADER_HEIGHT +
        layout.Layout.STATUS_HEIGHT +
        layout.Layout.CHAT_TOP_MARGIN;
    // Fixed heights should leave room for at least some chat history
    try std.testing.expect(fixed_heights < min_height);
}

test "Layout fixed elements leave room for chat" {
    const chat_height = layout.Layout.chatHistoryHeight(layout.Layout.MIN_HEIGHT);
    // At minimum height, should still have some chat area
    try std.testing.expect(chat_height > 0);
}

// ============================================================================
// Layout Functions Tests
// ============================================================================

test "Layout.maxChatWidth respects side margins" {
    const width: u16 = 100;
    const max_chat = layout.Layout.maxChatWidth(width);
    const expected_with_margins = width - (layout.Layout.CHAT_SIDE_MARGIN * 2);
    try std.testing.expect(max_chat <= expected_with_margins);
}

test "Layout.maxChatWidth caps at 120" {
    const wide_terminal: u16 = 200;
    const max_chat = layout.Layout.maxChatWidth(wide_terminal);
    try std.testing.expectEqual(@as(u16, 120), max_chat);
}

test "Layout.maxChatWidth uses terminal width for narrow terminals" {
    const narrow_terminal: u16 = 80;
    const max_chat = layout.Layout.maxChatWidth(narrow_terminal);
    const expected = narrow_terminal - (layout.Layout.CHAT_SIDE_MARGIN * 2);
    try std.testing.expectEqual(expected, max_chat);
}

test "Layout.chatHistoryHeight calculation" {
    const terminal_height: u16 = 50;
    const expected = terminal_height -
        layout.Layout.INPUT_HEIGHT -
        layout.Layout.HEADER_HEIGHT -
        layout.Layout.STATUS_HEIGHT -
        layout.Layout.CHAT_TOP_MARGIN;
    const actual = layout.Layout.chatHistoryHeight(terminal_height);
    try std.testing.expectEqual(expected, actual);
}

test "Layout.chatHistoryHeight increases with terminal height" {
    const height1 = layout.Layout.chatHistoryHeight(30);
    const height2 = layout.Layout.chatHistoryHeight(50);
    try std.testing.expect(height2 > height1);
}

// ============================================================================
// Colors Indexed Tests
// ============================================================================

test "Colors.Indexed.USER_BAR in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.USER_BAR <= 255);
}

test "Colors.Indexed.USER_TEXT in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.USER_TEXT <= 255);
}

test "Colors.Indexed.ASSISTANT_TEXT in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.ASSISTANT_TEXT <= 255);
}

test "Colors.Indexed.SYSTEM_TEXT in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.SYSTEM_TEXT <= 255);
}

test "Colors.Indexed.DIM in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.DIM <= 255);
}

test "Colors.Indexed.CODE in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.CODE <= 255);
}

test "Colors.Indexed.HEADING in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.HEADING <= 255);
}

test "Colors.Indexed.LINK in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.LINK <= 255);
}

test "Colors.Indexed.QUOTE in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.QUOTE <= 255);
}

test "Colors.Indexed.SELECTION_BG in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.SELECTION_BG <= 255);
}

test "Colors.Indexed header colors in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.HEADER_BG <= 255);
    try std.testing.expect(MockColors.Indexed.TITLE <= 255);
    try std.testing.expect(MockColors.Indexed.SEPARATOR <= 255);
    try std.testing.expect(MockColors.Indexed.MODEL <= 255);
}

test "Colors.Indexed tab colors in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.TAB <= 255);
    try std.testing.expect(MockColors.Indexed.TAB_ACTIVE <= 255);
    try std.testing.expect(MockColors.Indexed.TAB_BG_ACTIVE <= 255);
}

test "Colors.Indexed status bar colors in valid ANSI 256 range" {
    try std.testing.expect(MockColors.Indexed.STATUS_BG <= 255);
    try std.testing.expect(MockColors.Indexed.STATUS_FG <= 255);
    try std.testing.expect(MockColors.Indexed.KEY_HINT <= 255);
    try std.testing.expect(MockColors.Indexed.SPINNER <= 255);
}

// ============================================================================
// Colors RGB Tests
// ============================================================================

test "Colors.PRIMARY has valid RGB" {
    const rgb = MockColors.PRIMARY.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x88), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x99), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0xAA), rgb[2]);
}

test "Colors.SECONDARY has valid RGB" {
    const rgb = MockColors.SECONDARY.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x66), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x77), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x88), rgb[2]);
}

test "Colors.SUCCESS has valid RGB" {
    const rgb = MockColors.SUCCESS.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x55), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xAA), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x55), rgb[2]);
}

test "Colors.ERROR has valid RGB" {
    const rgb = MockColors.ERROR.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xDD), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x55), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x55), rgb[2]);
}

test "Colors.WARNING has valid RGB" {
    const rgb = MockColors.WARNING.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xFF), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xBB), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x33), rgb[2]);
}

test "Colors.MUTED has valid RGB" {
    const rgb = MockColors.MUTED.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x55), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x55), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x55), rgb[2]);
}

test "Colors.BACKGROUND has valid RGB" {
    const rgb = MockColors.BACKGROUND.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x1A), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x1A), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x1A), rgb[2]);
}

test "Colors.FOREGROUND has valid RGB" {
    const rgb = MockColors.FOREGROUND.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xCC), rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xCC), rgb[1]);
    try std.testing.expectEqual(@as(u8, 0xCC), rgb[2]);
}

test "Colors chat message colors have valid RGB" {
    // USER_MESSAGE
    const user_rgb = MockColors.USER_MESSAGE.rgb.?;
    try std.testing.expectEqual(@as(u8, 0x77), user_rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xAA), user_rgb[1]);
    try std.testing.expectEqual(@as(u8, 0xFF), user_rgb[2]);

    // ASSISTANT_MESSAGE
    const asst_rgb = MockColors.ASSISTANT_MESSAGE.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xAA), asst_rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xFF), asst_rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x77), asst_rgb[2]);

    // SYSTEM_MESSAGE
    const sys_rgb = MockColors.SYSTEM_MESSAGE.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xFF), sys_rgb[0]);
    try std.testing.expectEqual(@as(u8, 0xAA), sys_rgb[1]);
    try std.testing.expectEqual(@as(u8, 0x77), sys_rgb[2]);

    // TOOL_MESSAGE
    const tool_rgb = MockColors.TOOL_MESSAGE.rgb.?;
    try std.testing.expectEqual(@as(u8, 0xFF), tool_rgb[0]);
    try std.testing.expectEqual(@as(u8, 0x77), tool_rgb[1]);
    try std.testing.expectEqual(@as(u8, 0xAA), tool_rgb[2]);
}

// ============================================================================
// Styles Tests
// ============================================================================

test "Styles.header has correct fg/bg and bold" {
    try std.testing.expect(MockStyles.header.fg != null);
    try std.testing.expect(MockStyles.header.bg != null);
    try std.testing.expect(MockStyles.header.bold);
}

test "Styles.status_bar has correct fg/bg" {
    try std.testing.expect(MockStyles.status_bar.fg != null);
    try std.testing.expect(MockStyles.status_bar.bg != null);
    try std.testing.expect(!MockStyles.status_bar.bold);
}

test "Styles.input_active has underline" {
    try std.testing.expect(MockStyles.input_active.fg != null);
    try std.testing.expect(MockStyles.input_active.bg != null);
    try std.testing.expect(MockStyles.input_active.ul_style != null);
    try std.testing.expectEqual(.single, MockStyles.input_active.ul_style.?);
}

test "Styles.input_inactive uses muted colors" {
    try std.testing.expect(MockStyles.input_inactive.fg != null);
    try std.testing.expect(MockStyles.input_inactive.bg != null);
    try std.testing.expect(MockStyles.input_inactive.ul_style == null);
}

test "Styles.user_message is bold" {
    try std.testing.expect(MockStyles.user_message.fg != null);
    try std.testing.expect(MockStyles.user_message.bold);
}

test "Styles.assistant_message is not bold" {
    try std.testing.expect(MockStyles.assistant_message.fg != null);
    try std.testing.expect(!MockStyles.assistant_message.bold);
}

test "Styles.system_message is italic" {
    try std.testing.expect(MockStyles.system_message.fg != null);
    try std.testing.expect(MockStyles.system_message.italic);
}

test "Styles.tool_message is dim" {
    try std.testing.expect(MockStyles.tool_message.fg != null);
    try std.testing.expect(MockStyles.tool_message.dim);
}

test "Styles.error_message is bold with error color" {
    try std.testing.expect(MockStyles.error_message.fg != null);
    try std.testing.expect(MockStyles.error_message.bold);
}

test "Styles.loading is dim" {
    try std.testing.expect(MockStyles.loading.fg != null);
    try std.testing.expect(MockStyles.loading.dim);
}

// ============================================================================
// DI Pattern Tests
// ============================================================================

test "Colors generic instantiation works with MockRenderer" {
    const C = layout.Colors(MockRenderer);
    _ = C.PRIMARY;
    _ = C.Indexed.USER_BAR;
}

test "Styles generic instantiation works with MockRenderer" {
    const S = layout.Styles(MockRenderer);
    _ = S.header;
    _ = S.user_message;
}
