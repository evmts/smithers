const std = @import("std");
const status = @import("../ui/status.zig");
const loading_mod = @import("../loading.zig");

/// Mock Renderer for testing StatusBar
const MockRenderer = struct {
    width_val: u16 = 80,
    height_val: u16 = 24,
    draw_calls: std.ArrayList(DrawCall),
    fill_calls: std.ArrayList(FillCall),

    const DrawCall = struct {
        x: u16,
        y: u16,
        text: []const u8,
    };

    const FillCall = struct {
        x: u16,
        y: u16,
        w: u16,
        h: u16,
        char: []const u8,
    };

    pub const Style = struct {
        bg: ?BgColor = null,
        fg: ?FgColor = null,
        bold: bool = false,

        const BgColor = union(enum) { index: u8 };
        const FgColor = union(enum) { index: u8 };
    };

    pub fn init(allocator: std.mem.Allocator) MockRenderer {
        return .{
            .draw_calls = std.ArrayList(DrawCall).init(allocator),
            .fill_calls = std.ArrayList(FillCall).init(allocator),
        };
    }

    pub fn deinit(self: *MockRenderer) void {
        self.draw_calls.deinit();
        self.fill_calls.deinit();
    }

    pub fn width(self: MockRenderer) u16 {
        return self.width_val;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.height_val;
    }

    pub fn drawText(self: *MockRenderer, x: u16, y: u16, text: []const u8, _: Style) void {
        self.draw_calls.append(.{ .x = x, .y = y, .text = text }) catch {};
    }

    pub fn fill(self: *MockRenderer, x: u16, y: u16, w: u16, h: u16, char: []const u8, _: Style) void {
        self.fill_calls.append(.{ .x = x, .y = y, .w = w, .h = h, .char = char }) catch {};
    }
};

const TestStatusBar = status.StatusBar(*MockRenderer);

test "StatusBar init" {
    const bar = TestStatusBar.init();

    try std.testing.expect(bar.custom_status == null);
    try std.testing.expect(!bar.is_busy);
    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);
    try std.testing.expect(!bar.show_help);
}

test "StatusBar setBusy true" {
    var bar = TestStatusBar.init();

    bar.setBusy(true);

    try std.testing.expect(bar.is_busy);
    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);
}

test "StatusBar setBusy false resets spinner_frame" {
    var bar = TestStatusBar.init();

    bar.spinner_frame = 5;
    bar.is_busy = true;

    bar.setBusy(false);

    try std.testing.expect(!bar.is_busy);
    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);
}

test "StatusBar setBusy true does not reset spinner_frame" {
    var bar = TestStatusBar.init();

    bar.spinner_frame = 3;
    bar.setBusy(true);

    try std.testing.expect(bar.is_busy);
    try std.testing.expectEqual(@as(u8, 3), bar.spinner_frame);
}

test "StatusBar tickSpinner increments frame" {
    var bar = TestStatusBar.init();

    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);

    bar.tickSpinner();
    try std.testing.expectEqual(@as(u8, 1), bar.spinner_frame);

    bar.tickSpinner();
    try std.testing.expectEqual(@as(u8, 2), bar.spinner_frame);

    bar.tickSpinner();
    try std.testing.expectEqual(@as(u8, 3), bar.spinner_frame);
}

test "StatusBar tickSpinner wraps around" {
    var bar = TestStatusBar.init();

    const num_frames = loading_mod.spinner_frames.len;
    try std.testing.expectEqual(@as(usize, 10), num_frames);

    bar.spinner_frame = 9;
    bar.tickSpinner();

    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);
}

test "StatusBar tickSpinner cycles through all frames" {
    var bar = TestStatusBar.init();

    var i: u8 = 0;
    while (i < 20) : (i += 1) {
        const expected: u8 = @intCast(i % loading_mod.spinner_frames.len);
        try std.testing.expectEqual(expected, bar.spinner_frame);
        bar.tickSpinner();
    }
}

test "StatusBar setCustomStatus sets status" {
    var bar = TestStatusBar.init();

    try std.testing.expect(bar.custom_status == null);

    bar.setCustomStatus("Loading data...");

    try std.testing.expect(bar.custom_status != null);
    try std.testing.expectEqualStrings("Loading data...", bar.custom_status.?);
}

test "StatusBar setCustomStatus clears status with null" {
    var bar = TestStatusBar.init();

    bar.setCustomStatus("Some status");
    try std.testing.expect(bar.custom_status != null);

    bar.setCustomStatus(null);
    try std.testing.expect(bar.custom_status == null);
}

test "StatusBar setCustomStatus replaces existing status" {
    var bar = TestStatusBar.init();

    bar.setCustomStatus("First status");
    try std.testing.expectEqualStrings("First status", bar.custom_status.?);

    bar.setCustomStatus("Second status");
    try std.testing.expectEqualStrings("Second status", bar.custom_status.?);
}

test "StatusBar getHeight returns 1 when help hidden" {
    const bar = TestStatusBar.init();

    try std.testing.expect(!bar.show_help);
    try std.testing.expectEqual(@as(u16, 1), bar.getHeight());
}

test "StatusBar getHeight returns 4 when help visible" {
    var bar = TestStatusBar.init();

    bar.show_help = true;

    try std.testing.expectEqual(@as(u16, 4), bar.getHeight());
}

test "StatusBar toggleHelp toggles show_help" {
    var bar = TestStatusBar.init();

    try std.testing.expect(!bar.show_help);

    bar.toggleHelp();
    try std.testing.expect(bar.show_help);

    bar.toggleHelp();
    try std.testing.expect(!bar.show_help);

    bar.toggleHelp();
    try std.testing.expect(bar.show_help);
}

test "StatusBar hideHelp sets show_help to false" {
    var bar = TestStatusBar.init();

    bar.show_help = true;
    bar.hideHelp();

    try std.testing.expect(!bar.show_help);
}

test "StatusBar hideHelp is idempotent" {
    var bar = TestStatusBar.init();

    bar.hideHelp();
    try std.testing.expect(!bar.show_help);

    bar.hideHelp();
    try std.testing.expect(!bar.show_help);
}

test "StatusBar isHelpVisible returns show_help state" {
    var bar = TestStatusBar.init();

    try std.testing.expect(!bar.isHelpVisible());

    bar.show_help = true;
    try std.testing.expect(bar.isHelpVisible());

    bar.show_help = false;
    try std.testing.expect(!bar.isHelpVisible());
}

test "StatusBar draw fills background" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    const bar = TestStatusBar.init();
    bar.draw(&renderer);

    try std.testing.expect(renderer.fill_calls.items.len >= 1);

    const fill = renderer.fill_calls.items[0];
    try std.testing.expectEqual(@as(u16, 0), fill.x);
    try std.testing.expectEqual(@as(u16, 0), fill.y);
    try std.testing.expectEqual(@as(u16, 80), fill.w);
    try std.testing.expectEqual(@as(u16, 1), fill.h);
    try std.testing.expectEqualStrings(" ", fill.char);
}

test "StatusBar draw with help visible fills 4 rows" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    var bar = TestStatusBar.init();
    bar.show_help = true;

    bar.draw(&renderer);

    try std.testing.expect(renderer.fill_calls.items.len >= 1);

    const fill = renderer.fill_calls.items[0];
    try std.testing.expectEqual(@as(u16, 4), fill.h);
}

test "StatusBar draw with is_busy shows spinner" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    var bar = TestStatusBar.init();
    bar.is_busy = true;

    bar.draw(&renderer);

    try std.testing.expect(renderer.draw_calls.items.len >= 1);

    var found_spinner = false;
    for (renderer.draw_calls.items) |call| {
        for (loading_mod.spinner_frames) |frame| {
            if (std.mem.eql(u8, call.text, frame)) {
                found_spinner = true;
                break;
            }
        }
    }
    try std.testing.expect(found_spinner);
}

test "StatusBar draw with custom_status shows status text" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    var bar = TestStatusBar.init();
    bar.setCustomStatus("Custom message");

    bar.draw(&renderer);

    var found_status = false;
    for (renderer.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, "Custom message")) {
            found_status = true;
            break;
        }
    }
    try std.testing.expect(found_status);
}

test "StatusBar draw with custom_status and is_busy shows both" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    var bar = TestStatusBar.init();
    bar.setCustomStatus("Busy status");
    bar.is_busy = true;

    bar.draw(&renderer);

    var found_spinner = false;
    var found_status = false;

    for (renderer.draw_calls.items) |call| {
        for (loading_mod.spinner_frames) |frame| {
            if (std.mem.eql(u8, call.text, frame)) {
                found_spinner = true;
                break;
            }
        }
        if (std.mem.indexOf(u8, call.text, "Busy status") != null) {
            found_status = true;
        }
    }

    try std.testing.expect(found_spinner);
    try std.testing.expect(found_status);
}

test "StatusBar draw default shows keybinding hints" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    const bar = TestStatusBar.init();
    bar.draw(&renderer);

    var found_help = false;
    var found_esc = false;

    for (renderer.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, "?")) {
            found_help = true;
        }
        if (std.mem.eql(u8, call.text, "Esc")) {
            found_esc = true;
        }
    }

    try std.testing.expect(found_help);
    try std.testing.expect(found_esc);
}

test "StatusBar draw with busy no custom status shows Processing" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();

    var bar = TestStatusBar.init();
    bar.is_busy = true;

    bar.draw(&renderer);

    var found_processing = false;
    for (renderer.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, "Processing...")) {
            found_processing = true;
            break;
        }
    }
    try std.testing.expect(found_processing);
}

test "StatusBar spinner_frame affects displayed spinner" {
    var renderer1 = MockRenderer.init(std.testing.allocator);
    defer renderer1.deinit();

    var bar = TestStatusBar.init();
    bar.is_busy = true;
    bar.spinner_frame = 0;

    bar.draw(&renderer1);

    var found_frame_0 = false;
    for (renderer1.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, loading_mod.spinner_frames[0])) {
            found_frame_0 = true;
            break;
        }
    }
    try std.testing.expect(found_frame_0);

    var renderer2 = MockRenderer.init(std.testing.allocator);
    defer renderer2.deinit();

    bar.spinner_frame = 5;
    bar.draw(&renderer2);

    var found_frame_5 = false;
    for (renderer2.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, loading_mod.spinner_frames[5])) {
            found_frame_5 = true;
            break;
        }
    }
    try std.testing.expect(found_frame_5);
}

test "StatusBar SEPARATOR constant exists" {
    try std.testing.expectEqualStrings(" │ ", TestStatusBar.SEPARATOR);
}

test "StatusBar default state struct initialization" {
    const bar: TestStatusBar = .{};

    try std.testing.expect(bar.custom_status == null);
    try std.testing.expect(!bar.is_busy);
    try std.testing.expectEqual(@as(u8, 0), bar.spinner_frame);
    try std.testing.expect(!bar.show_help);
}

test "StatusBar narrow width truncates status" {
    var renderer = MockRenderer.init(std.testing.allocator);
    defer renderer.deinit();
    renderer.width_val = 20;

    var bar = TestStatusBar.init();
    bar.setCustomStatus("This is a very long status message that should be truncated");

    bar.draw(&renderer);

    var found_truncated = false;
    for (renderer.draw_calls.items) |call| {
        if (call.text.len > 0 and call.text.len < 60) {
            if (std.mem.indexOf(u8, "This is a very long status message that should be truncated", call.text) != null) {
                found_truncated = true;
                break;
            }
        }
    }
    try std.testing.expect(found_truncated);
}

test "DefaultStatusBar type exists" {
    const DefaultBar = status.DefaultStatusBar;
    _ = DefaultBar;
}
