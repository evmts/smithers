const std = @import("std");
const renderer_mod = @import("../rendering/renderer.zig");
const SelectList = @import("select_list.zig").SelectList;
const SlashCommand = @import("slash_command.zig").SlashCommand;
const builtInSlashCommands = @import("slash_command.zig").builtInSlashCommands;

const MAX_POPUP_ROWS: usize = 8;

/// Filtered command item with display info
pub const FilteredCommand = struct {
    cmd: SlashCommand,
    match_start: ?usize,
    match_len: usize,
};

/// Generic Command popup that shows when user types "/"
pub fn CommandPopup(comptime R: type) type {
    return struct {
        allocator: std.mem.Allocator,
        visible: bool,
        filter: []u8,
        filtered_commands: std.ArrayList(FilteredCommand),
        select_list: SelectList(FilteredCommand),

        const Self = @This();

        const border_color = R.Color{ .rgb = .{ 0x7a, 0xa2, 0xf7 } };
        const selected_bg = R.Color{ .rgb = .{ 0x3d, 0x59, 0xa1 } };
        const command_color = R.Color{ .rgb = .{ 0xbb, 0x9a, 0xf7 } };
        const desc_color = R.Color{ .rgb = .{ 0x56, 0x5f, 0x89 } };
        const highlight_color = R.Color{ .rgb = .{ 0xff, 0x9e, 0x64 } };

        pub fn init(allocator: std.mem.Allocator) Self {
            var self = Self{
                .allocator = allocator,
                .visible = false,
                .filter = &[_]u8{},
                .filtered_commands = .empty,
                .select_list = SelectList(FilteredCommand).init(&[_]FilteredCommand{}, MAX_POPUP_ROWS),
            };
            self.rebuildFilteredList();
            return self;
        }

        pub fn deinit(self: *Self) void {
            if (self.filter.len > 0) {
                self.allocator.free(self.filter);
            }
            self.filtered_commands.deinit(self.allocator);
        }

        /// Show popup with optional filter prefix (without leading slash)
        pub fn show(self: *Self, prefix: []const u8) !void {
            self.visible = true;
            try self.setFilter(prefix);
        }

        /// Hide the popup
        pub fn hide(self: *Self) void {
            self.visible = false;
        }

        /// Check if popup is visible
        pub fn isVisible(self: *const Self) bool {
            return self.visible;
        }

        /// Set the filter and rebuild the filtered list
        pub fn setFilter(self: *Self, prefix: []const u8) !void {
            if (self.filter.len > 0) {
                self.allocator.free(self.filter);
            }
            self.filter = try self.allocator.dupe(u8, prefix);
            self.rebuildFilteredList();
        }

        fn rebuildFilteredList(self: *Self) void {
            self.filtered_commands.clearRetainingCapacity();

            const cmds = builtInSlashCommands();
            const filter_lower = self.toLowerAlloc(self.filter) catch return;
            defer if (filter_lower.len > 0) self.allocator.free(filter_lower);

            for (cmds) |entry| {
                const cmd_name = entry.cmd.command();
                const cmd_lower = self.toLowerAlloc(cmd_name) catch continue;
                defer self.allocator.free(cmd_lower);

                if (filter_lower.len == 0) {
                    self.filtered_commands.append(self.allocator, .{
                        .cmd = entry.cmd,
                        .match_start = null,
                        .match_len = 0,
                    }) catch continue;
                } else if (std.mem.startsWith(u8, cmd_lower, filter_lower)) {
                    self.filtered_commands.append(self.allocator, .{
                        .cmd = entry.cmd,
                        .match_start = 0,
                        .match_len = filter_lower.len,
                    }) catch continue;
                }
            }

            self.select_list.setItems(self.filtered_commands.items);
        }

        fn toLowerAlloc(self: *Self, str: []const u8) ![]u8 {
            if (str.len == 0) return &[_]u8{};
            const result = try self.allocator.alloc(u8, str.len);
            for (str, 0..) |c, i| {
                result[i] = std.ascii.toLower(c);
            }
            return result;
        }

        /// Handle navigation key, returns selected command if Enter pressed
        pub fn handleKey(self: *Self, key: R.Key) ?SlashCommand {
            if (!self.visible) return null;

            if (key.matches(R.Key.escape, .{})) {
                self.hide();
                return null;
            }

            if (key.matches(R.Key.up, .{})) {
                self.select_list.moveUp();
                return null;
            }

            if (key.matches(R.Key.down, .{})) {
                self.select_list.moveDown();
                return null;
            }

            if (key.matches(R.Key.enter, .{})) {
                if (self.select_list.selectedItem()) |item| {
                    self.hide();
                    return item.cmd;
                }
                return null;
            }

            if (key.matches(R.Key.tab, .{})) {
                if (self.select_list.selectedItem()) |item| {
                    return item.cmd;
                }
                return null;
            }

            return null;
        }

        /// Get autocomplete text for Tab
        pub fn getAutocomplete(self: *const Self) ?[]const u8 {
            if (!self.visible) return null;
            if (self.select_list.selectedItem()) |item| {
                return item.cmd.command();
            }
            return null;
        }

        /// Get currently selected command
        pub fn selectedCommand(self: *const Self) ?SlashCommand {
            if (!self.visible) return null;
            if (self.select_list.selectedItem()) |item| {
                return item.cmd;
            }
            return null;
        }

        /// Draw the popup above the input area
        pub fn draw(self: *Self, renderer: R) void {
            if (!self.visible) return;

            const items = self.filtered_commands.items;
            if (items.len == 0) {
                self.drawNoMatches(renderer);
                return;
            }

            const visible_count: u16 = @intCast(@min(MAX_POPUP_ROWS, items.len));
            const popup_height: u16 = visible_count + 2;
            const popup_width: u16 = @min(50, renderer.width() -| 4);

            if (renderer.height() < popup_height + 1) return;

            const popup_y: u16 = renderer.height() -| popup_height -| 1;
            const popup_x: u16 = 2;

            const border_style: R.Style = .{ .fg = border_color };
            const popup_win = renderer.window.child(.{
                .x_off = popup_x,
                .y_off = popup_y,
                .width = popup_width,
                .height = popup_height,
                .border = .{
                    .where = .all,
                    .style = border_style,
                },
            });
            const popup_renderer = R.init(popup_win);

            const range = self.select_list.visibleRange();
            var row: u16 = 0;
            for (range.start..range.end) |i| {
                const item = items[i];
                const is_selected = self.select_list.isSelected(i);
                self.drawRow(popup_renderer, row, item, is_selected);
                row += 1;
            }
        }

        fn drawRow(self: *Self, renderer: R, row: u16, item: FilteredCommand, is_selected: bool) void {
            _ = self;
            const cmd_name = item.cmd.command();
            const description = item.cmd.description();

            const row_renderer = renderer.subRegion(0, row, renderer.width(), 1);

            if (is_selected) {
                row_renderer.fill(0, 0, row_renderer.width(), 1, " ", .{ .bg = selected_bg });
            }

            var x: u16 = 1;
            row_renderer.drawCell(x, 0, "/", .{
                .fg = command_color,
                .bg = if (is_selected) selected_bg else .default,
            });
            x += 1;

            for (cmd_name, 0..) |c, i| {
                const in_match = if (item.match_start) |start|
                    i >= start and i < start + item.match_len
                else
                    false;

                const fg = if (in_match) highlight_color else command_color;
                const char_buf: [1]u8 = .{c};
                row_renderer.drawCell(x, 0, &char_buf, .{
                    .fg = fg,
                    .bg = if (is_selected) selected_bg else .default,
                    .bold = in_match,
                });
                x += 1;
            }

            x += 2;

            const desc_style: R.Style = .{
                .fg = desc_color,
                .bg = if (is_selected) selected_bg else .default,
            };
            const max_desc_len = if (row_renderer.width() > x + 2) row_renderer.width() - x - 2 else 0;
            const desc_to_show = if (description.len > max_desc_len)
                description[0..max_desc_len]
            else
                description;

            const desc_renderer = row_renderer.subRegion(x, 0, @intCast(desc_to_show.len), 1);
            desc_renderer.drawText(0, 0, desc_to_show, desc_style);
        }

        fn drawNoMatches(self: *Self, renderer: R) void {
            _ = self;
            const msg = "no matches";
            const popup_height: u16 = 3;
            const popup_width: u16 = @intCast(msg.len + 4);

            if (renderer.height() < popup_height + 1) return;

            const popup_y: u16 = renderer.height() -| popup_height -| 1;
            const popup_x: u16 = 2;

            const border_style: R.Style = .{ .fg = border_color };
            const popup_win = renderer.window.child(.{
                .x_off = popup_x,
                .y_off = popup_y,
                .width = popup_width,
                .height = popup_height,
                .border = .{
                    .where = .all,
                    .style = border_style,
                },
            });
            const popup_renderer = R.init(popup_win);

            const style: R.Style = .{ .fg = desc_color };
            popup_renderer.drawText(0, 0, msg, style);
        }
    };
}

test "CommandPopup visibility" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try testing.expect(!popup.isVisible());

    try popup.show("");
    try testing.expect(popup.isVisible());

    popup.hide();
    try testing.expect(!popup.isVisible());
}

test "CommandPopup filtering" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.filtered_commands.items.len > 0);

    try popup.setFilter("mo");
    var has_model = false;
    for (popup.filtered_commands.items) |item| {
        if (item.cmd == .model) {
            has_model = true;
            break;
        }
    }
    try testing.expect(has_model);

    try popup.setFilter("xyz");
    try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
}

test "CommandPopup selection" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.selectedCommand() != null);

    _ = popup.handleKey(.{ .codepoint = TestRenderer.Key.down });
    const cmd1 = popup.selectedCommand();
    try testing.expect(cmd1 != null);

    _ = popup.handleKey(.{ .codepoint = TestRenderer.Key.up });
    const cmd2 = popup.selectedCommand();
    try testing.expect(cmd2 != null);
}

test "CommandPopup enter selects command" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const first_cmd = popup.selectedCommand();
    try testing.expect(first_cmd != null);

    const selected = popup.handleKey(.{ .codepoint = TestRenderer.Key.enter });
    try testing.expect(selected != null);
    try testing.expect(!popup.isVisible());
}

test "CommandPopup escape dismisses" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());

    _ = popup.handleKey(.{ .codepoint = TestRenderer.Key.escape });
    try testing.expect(!popup.isVisible());
}

test "CommandPopup tab autocomplete" {
    const testing = std.testing;
    const TestRenderer = @import("../testing/mock_renderer.zig").MockRenderer;
    const TestPopup = CommandPopup(TestRenderer);
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("mo");
    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);

    const selected = popup.handleKey(.{ .codepoint = TestRenderer.Key.tab });
    try testing.expect(selected != null);
}
