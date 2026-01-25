const std = @import("std");
const testing = std.testing;
const command_popup_mod = @import("../commands/command_popup.zig");
const slash_command = @import("../commands/slash_command.zig");
const SlashCommand = slash_command.SlashCommand;
const builtInSlashCommands = slash_command.builtInSlashCommands;

// =============================================================================
// Mock Types for DI Pattern
// =============================================================================

const MockKey = struct {
    codepoint: u21,
    mods: Modifiers = .{},

    pub const escape: u21 = 0x1B;
    pub const enter: u21 = '\r';
    pub const tab: u21 = '\t';
    pub const up: u21 = 0x100;
    pub const down: u21 = 0x101;

    pub const Modifiers = struct {
        ctrl: bool = false,
        alt: bool = false,
        shift: bool = false,
    };

    pub fn matches(self: MockKey, cp: u21, mods: Modifiers) bool {
        return self.codepoint == cp and
            self.mods.ctrl == mods.ctrl and
            self.mods.alt == mods.alt and
            self.mods.shift == mods.shift;
    }
};

const MockColor = union(enum) {
    default,
    index: u8,
    rgb: struct { u8, u8, u8 },
};

const MockStyle = struct {
    fg: MockColor = .default,
    bg: MockColor = .default,
    bold: bool = false,
};

const MockWindow = struct {
    w: u16 = 80,
    h: u16 = 24,
    x_offset: u16 = 0,
    y_offset: u16 = 0,

    pub fn child(_: MockWindow, opts: anytype) MockWindow {
        return .{
            .w = opts.width,
            .h = opts.height,
            .x_offset = opts.x_off,
            .y_offset = opts.y_off,
        };
    }

    pub const width: u16 = 80;
    pub const height: u16 = 24;
};

const MockRenderer = struct {
    window: MockWindow = .{},
    draw_calls: usize = 0,
    fill_calls: usize = 0,

    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = MockKey;
    pub const Mouse = struct { x: u16, y: u16, button: enum { left, right, middle, none } };
    pub const Winsize = struct { rows: u16, cols: u16 };

    pub fn init(window: MockWindow) MockRenderer {
        return .{ .window = window };
    }

    pub fn width(self: MockRenderer) u16 {
        return self.window.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.window.h;
    }

    pub fn drawCell(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}

    pub fn drawText(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}

    pub fn fill(_: MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}

    pub fn subRegion(self: MockRenderer, _: u16, _: u16, w: u16, h: u16) MockRenderer {
        return .{
            .window = .{ .w = w, .h = h },
            .draw_calls = self.draw_calls,
            .fill_calls = self.fill_calls,
        };
    }
};

const TestCommandPopup = command_popup_mod.CommandPopup(MockRenderer);

// =============================================================================
// Initialization Tests
// =============================================================================

test "init: popup starts hidden" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(!popup.isVisible());
}

test "init: popup starts with empty filter" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expectEqual(@as(usize, 0), popup.filter.len);
}

test "init: popup starts with all commands in filtered list" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    const builtin_count = builtInSlashCommands().len;
    try testing.expectEqual(builtin_count, popup.filtered_commands.items.len);
}

test "init: first command is selected by default" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const selected = popup.selectedCommand();
    try testing.expect(selected != null);
}

// =============================================================================
// Visibility Tests
// =============================================================================

test "show: makes popup visible" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());
}

test "show: sets filter from prefix" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("mo");
    try testing.expectEqualStrings("mo", popup.filter);
}

test "show: empty prefix shows all commands" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const builtin_count = builtInSlashCommands().len;
    try testing.expectEqual(builtin_count, popup.filtered_commands.items.len);
}

test "hide: makes popup invisible" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());

    popup.hide();
    try testing.expect(!popup.isVisible());
}

test "hide: can be called when already hidden" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    popup.hide();
    try testing.expect(!popup.isVisible());
    popup.hide();
    try testing.expect(!popup.isVisible());
}

test "isVisible: returns correct state" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(!popup.isVisible());
    try popup.show("");
    try testing.expect(popup.isVisible());
    popup.hide();
    try testing.expect(!popup.isVisible());
}

// =============================================================================
// Filter Tests
// =============================================================================

test "setFilter: filters commands by prefix" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("mo");
    
    var has_model = false;
    for (popup.filtered_commands.items) |item| {
        if (item.cmd == .model) {
            has_model = true;
            break;
        }
    }
    try testing.expect(has_model);
}

test "setFilter: case insensitive matching" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("MO");
    
    var has_model = false;
    for (popup.filtered_commands.items) |item| {
        if (item.cmd == .model) {
            has_model = true;
            break;
        }
    }
    try testing.expect(has_model);
}

test "setFilter: no matches returns empty list" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("xyz");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
}

test "setFilter: empty filter shows all commands" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("mo");
    try testing.expect(popup.filtered_commands.items.len < builtInSlashCommands().len);

    try popup.setFilter("");
    try testing.expectEqual(builtInSlashCommands().len, popup.filtered_commands.items.len);
}

test "setFilter: updates filter string" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("test");
    try testing.expectEqualStrings("test", popup.filter);

    try popup.setFilter("other");
    try testing.expectEqualStrings("other", popup.filter);
}

test "setFilter: match_start and match_len set correctly" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("mo");
    
    for (popup.filtered_commands.items) |item| {
        if (item.cmd == .model) {
            try testing.expectEqual(@as(?usize, 0), item.match_start);
            try testing.expectEqual(@as(usize, 2), item.match_len);
            break;
        }
    }
}

test "setFilter: single character filter" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("e");
    
    var has_exit = false;
    for (popup.filtered_commands.items) |item| {
        if (item.cmd == .exit) {
            has_exit = true;
            break;
        }
    }
    try testing.expect(has_exit);
}

test "setFilter: very long filter returns no matches" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    const long_filter = "a" ** 100;
    try popup.setFilter(long_filter);
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
}

// =============================================================================
// Keyboard Navigation Tests
// =============================================================================

test "handleKey: down moves selection" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const initial_cmd = popup.selectedCommand();

    _ = popup.handleKey(.{ .codepoint = MockKey.down });
    const after_down = popup.selectedCommand();

    try testing.expect(initial_cmd != null);
    try testing.expect(after_down != null);
}

test "handleKey: up moves selection" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    _ = popup.handleKey(.{ .codepoint = MockKey.down });
    const cmd1 = popup.selectedCommand();

    _ = popup.handleKey(.{ .codepoint = MockKey.up });
    const cmd2 = popup.selectedCommand();

    try testing.expect(cmd1 != null);
    try testing.expect(cmd2 != null);
}

test "handleKey: escape hides popup" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());

    _ = popup.handleKey(.{ .codepoint = MockKey.escape });
    try testing.expect(!popup.isVisible());
}

test "handleKey: escape returns null" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const result = popup.handleKey(.{ .codepoint = MockKey.escape });
    try testing.expect(result == null);
}

test "handleKey: enter selects command and hides popup" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const expected = popup.selectedCommand();
    try testing.expect(expected != null);

    const selected = popup.handleKey(.{ .codepoint = MockKey.enter });
    try testing.expect(selected != null);
    try testing.expect(!popup.isVisible());
    try testing.expectEqual(expected.?, selected.?);
}

test "handleKey: tab returns command without hiding" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const expected = popup.selectedCommand();

    const selected = popup.handleKey(.{ .codepoint = MockKey.tab });
    try testing.expect(selected != null);
    try testing.expectEqual(expected.?, selected.?);
}

test "handleKey: invisible popup ignores all keys" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(!popup.isVisible());

    try testing.expect(popup.handleKey(.{ .codepoint = MockKey.down }) == null);
    try testing.expect(popup.handleKey(.{ .codepoint = MockKey.up }) == null);
    try testing.expect(popup.handleKey(.{ .codepoint = MockKey.enter }) == null);
    try testing.expect(popup.handleKey(.{ .codepoint = MockKey.tab }) == null);
    try testing.expect(popup.handleKey(.{ .codepoint = MockKey.escape }) == null);
}

test "handleKey: unrecognized key returns null" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const result = popup.handleKey(.{ .codepoint = 'x' });
    try testing.expect(result == null);
    try testing.expect(popup.isVisible());
}

test "handleKey: down wraps around at end" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const item_count = popup.filtered_commands.items.len;

    for (0..item_count) |_| {
        _ = popup.handleKey(.{ .codepoint = MockKey.down });
    }

    try testing.expect(popup.selectedCommand() != null);
}

test "handleKey: up wraps around at beginning" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    _ = popup.handleKey(.{ .codepoint = MockKey.up });
    try testing.expect(popup.selectedCommand() != null);
}

// =============================================================================
// Selection Tests
// =============================================================================

test "selectedCommand: returns null when hidden" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(popup.selectedCommand() == null);
}

test "selectedCommand: returns command when visible" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.selectedCommand() != null);
}

test "selectedCommand: returns null when no matches" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("xyz");
    try testing.expect(popup.selectedCommand() == null);
}

// =============================================================================
// Autocomplete Tests
// =============================================================================

test "getAutocomplete: returns null when hidden" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(popup.getAutocomplete() == null);
}

test "getAutocomplete: returns command string when visible" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);
    try testing.expect(autocomplete.?.len > 0);
}

test "getAutocomplete: returns filtered command" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("mo");
    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);
    try testing.expect(std.mem.startsWith(u8, autocomplete.?, "mo"));
}

test "getAutocomplete: returns null when no matches" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("xyz");
    try testing.expect(popup.getAutocomplete() == null);
}

// =============================================================================
// Draw Tests
// =============================================================================

test "draw: does nothing when hidden" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    const renderer = MockRenderer.init(.{ .w = 80, .h = 24 });
    popup.draw(renderer);
}

test "draw: draws when visible" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const renderer = MockRenderer.init(.{ .w = 80, .h = 24 });
    popup.draw(renderer);
}

test "draw: handles no matches" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("xyz");
    const renderer = MockRenderer.init(.{ .w = 80, .h = 24 });
    popup.draw(renderer);
}

test "draw: handles small terminal" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const renderer = MockRenderer.init(.{ .w = 20, .h = 5 });
    popup.draw(renderer);
}

test "draw: handles very small terminal" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const renderer = MockRenderer.init(.{ .w = 10, .h = 3 });
    popup.draw(renderer);
}

test "draw: handles zero dimensions" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const renderer = MockRenderer.init(.{ .w = 0, .h = 0 });
    popup.draw(renderer);
}

// =============================================================================
// Memory Tests
// =============================================================================

test "deinit: cleans up filter memory" {
    var popup = try TestCommandPopup.init(testing.allocator);
    try popup.setFilter("test");
    popup.deinit();
}

test "deinit: handles empty filter" {
    var popup = try TestCommandPopup.init(testing.allocator);
    popup.deinit();
}

test "setFilter: multiple calls don't leak memory" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("a");
    try popup.setFilter("ab");
    try popup.setFilter("abc");
    try popup.setFilter("");
    try popup.setFilter("xyz");
}

test "show: multiple calls don't leak memory" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("a");
    try popup.show("b");
    try popup.show("c");
    try popup.show("");
}

// =============================================================================
// FilteredCommand Tests
// =============================================================================

test "FilteredCommand: struct layout" {
    const cmd = command_popup_mod.FilteredCommand{
        .cmd = .help,
        .match_start = 0,
        .match_len = 2,
    };
    try testing.expectEqual(SlashCommand.help, cmd.cmd);
    try testing.expectEqual(@as(?usize, 0), cmd.match_start);
    try testing.expectEqual(@as(usize, 2), cmd.match_len);
}

test "FilteredCommand: null match_start for no match" {
    const cmd = command_popup_mod.FilteredCommand{
        .cmd = .exit,
        .match_start = null,
        .match_len = 0,
    };
    try testing.expect(cmd.match_start == null);
}

// =============================================================================
// Edge Cases
// =============================================================================

test "edge: rapid show/hide cycles" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    for (0..100) |_| {
        try popup.show("");
        popup.hide();
    }
    try testing.expect(!popup.isVisible());
}

test "edge: filter with special characters" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("\n\t\r");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
}

test "edge: filter with unicode" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.setFilter("日本語");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
}

test "edge: navigation with single filtered command" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("exit");
    try testing.expectEqual(@as(usize, 1), popup.filtered_commands.items.len);

    _ = popup.handleKey(.{ .codepoint = MockKey.down });
    try testing.expect(popup.selectedCommand() != null);

    _ = popup.handleKey(.{ .codepoint = MockKey.up });
    try testing.expect(popup.selectedCommand() != null);
}

test "edge: selection after filter change" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    for (0..5) |_| {
        _ = popup.handleKey(.{ .codepoint = MockKey.down });
    }

    try popup.setFilter("e");
    try testing.expect(popup.selectedCommand() != null);
}

test "edge: enter on empty list returns null" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("xyz");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);

    const result = popup.handleKey(.{ .codepoint = MockKey.enter });
    try testing.expect(result == null);
}

test "edge: tab on empty list returns null" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("xyz");
    const result = popup.handleKey(.{ .codepoint = MockKey.tab });
    try testing.expect(result == null);
}

// =============================================================================
// Integration Tests
// =============================================================================

test "integration: typical usage flow" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());

    _ = popup.handleKey(.{ .codepoint = MockKey.down });
    _ = popup.handleKey(.{ .codepoint = MockKey.down });

    try popup.setFilter("h");

    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);

    const selected = popup.handleKey(.{ .codepoint = MockKey.enter });
    try testing.expect(selected != null);
    try testing.expect(!popup.isVisible());
}

test "integration: cancel flow" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    _ = popup.handleKey(.{ .codepoint = MockKey.down });
    _ = popup.handleKey(.{ .codepoint = MockKey.escape });

    try testing.expect(!popup.isVisible());
}

test "integration: autocomplete flow" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("he");
    
    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);

    const cmd = popup.handleKey(.{ .codepoint = MockKey.tab });
    try testing.expect(cmd != null);
}

// =============================================================================
// Consistency Tests
// =============================================================================

test "consistency: all builtin commands appear with empty filter" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");

    const builtins = builtInSlashCommands();
    for (builtins) |entry| {
        var found = false;
        for (popup.filtered_commands.items) |item| {
            if (item.cmd == entry.cmd) {
                found = true;
                break;
            }
        }
        try testing.expect(found);
    }
}

test "consistency: filter matches command prefix only" {
    var popup = try TestCommandPopup.init(testing.allocator);
    defer popup.deinit();

    // "it" doesn't match any command prefix, so filtered list should be empty
    try popup.setFilter("it");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);

    // "mo" should match "model" which starts with "mo"
    try popup.setFilter("mo");
    try testing.expect(popup.filtered_commands.items.len > 0);
    for (popup.filtered_commands.items) |item| {
        const cmd_name = item.cmd.command();
        // All filtered commands should start with the filter prefix (case-insensitive)
        var cmd_lower_buf: [32]u8 = undefined;
        const cmd_lower = blk: {
            var i: usize = 0;
            for (cmd_name) |c| {
                if (i >= cmd_lower_buf.len) break;
                cmd_lower_buf[i] = std.ascii.toLower(c);
                i += 1;
            }
            break :blk cmd_lower_buf[0..i];
        };
        try testing.expect(std.mem.startsWith(u8, cmd_lower, "mo"));
    }
}
