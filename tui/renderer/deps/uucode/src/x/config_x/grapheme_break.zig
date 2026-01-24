const std = @import("std");
const config = @import("config.zig");
const types_x = @import("types.x.zig");

fn computeGraphemeBreakPedanticEmoji(
    allocator: std.mem.Allocator,
    cp: u21,
    data: anytype,
    backing: anytype,
    tracking: anytype,
) std.mem.Allocator.Error!void {
    _ = allocator;
    _ = cp;
    _ = backing;
    _ = tracking;

    if (data.is_emoji_modifier) {
        data.grapheme_break_pedantic_emoji = .emoji_modifier;
    } else if (data.is_emoji_modifier_base) {
        data.grapheme_break_pedantic_emoji = .emoji_modifier_base;
    } else {
        switch (data.grapheme_break) {
            inline else => |gb| {
                data.grapheme_break_pedantic_emoji = comptime std.meta.stringToEnum(
                    types_x.GraphemeBreakPedanticEmoji,
                    @tagName(gb),
                ) orelse unreachable;
            },
        }
    }
}

pub const grapheme_break_pedantic_emoji = config.Extension{
    .inputs = &.{
        "grapheme_break",
        "is_emoji_modifier",
        "is_emoji_modifier_base",
    },
    .compute = &computeGraphemeBreakPedanticEmoji,
    .fields = &.{
        .{ .name = "grapheme_break_pedantic_emoji", .type = types_x.GraphemeBreakPedanticEmoji },
    },
};
