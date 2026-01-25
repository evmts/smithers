const std = @import("std");
const command_popup = @import("command_popup.zig");
const MockRenderer = @import("../testing/mock_renderer.zig").MockRenderer;

const CommandPopup = command_popup.CommandPopup;
const TestPopup = CommandPopup(MockRenderer);

test "CommandPopup visibility" {
    const testing = std.testing;
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
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.selectedCommand() != null);

    _ = popup.handleKey(.{ .codepoint = MockRenderer.Key.down });
    const cmd1 = popup.selectedCommand();
    try testing.expect(cmd1 != null);

    _ = popup.handleKey(.{ .codepoint = MockRenderer.Key.up });
    const cmd2 = popup.selectedCommand();
    try testing.expect(cmd2 != null);
}

test "CommandPopup enter selects command" {
    const testing = std.testing;
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    const first_cmd = popup.selectedCommand();
    try testing.expect(first_cmd != null);

    const selected = popup.handleKey(.{ .codepoint = MockRenderer.Key.enter });
    try testing.expect(selected != null);
    try testing.expect(!popup.isVisible());
}

test "CommandPopup escape dismisses" {
    const testing = std.testing;
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("");
    try testing.expect(popup.isVisible());

    _ = popup.handleKey(.{ .codepoint = MockRenderer.Key.escape });
    try testing.expect(!popup.isVisible());
}

test "CommandPopup tab autocomplete" {
    const testing = std.testing;
    var popup = TestPopup.init(testing.allocator);
    defer popup.deinit();

    try popup.show("mo");
    const autocomplete = popup.getAutocomplete();
    try testing.expect(autocomplete != null);

    const selected = popup.handleKey(.{ .codepoint = MockRenderer.Key.tab });
    try testing.expect(selected != null);
}
