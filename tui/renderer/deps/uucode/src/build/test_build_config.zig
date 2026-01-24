const std = @import("std");
const config = @import("config.zig");
const config_x = @import("config.x.zig");
const types = @import("types.zig");
const d = config.default;

const Allocator = std.mem.Allocator;
pub const log_level = .debug;

fn computeFoo(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    t: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = cp;
    _ = b;
    _ = t;
    data.foo = switch (data.original_grapheme_break) {
        .other => 0,
        .control => 3,
        else => 10,
    };
}

const foo = config.Extension{
    .inputs = &.{"original_grapheme_break"},
    .compute = &computeFoo,
    .fields = &.{
        .{ .name = "foo", .type = u8 },
    },
};

// Or build your own extension:
const emoji_odd_or_even = config.Extension{
    .inputs = &.{"is_emoji"},
    .compute = &computeEmojiOddOrEven,
    .fields = &.{
        .{ .name = "emoji_odd_or_even", .type = EmojiOddOrEven },
    },
};

fn computeEmojiOddOrEven(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    backing: anytype,
    tracking: anytype,
) Allocator.Error!void {
    // allocator is an ArenaAllocator, so don't worry about freeing
    _ = allocator;

    // backing and tracking are only used for slice types (see
    // src/build/test_build_config.zig for examples).
    _ = backing;
    _ = tracking;

    if (!data.is_emoji) {
        data.emoji_odd_or_even = .not_emoji;
    } else if (cp % 2 == 0) {
        data.emoji_odd_or_even = .even_emoji;
    } else {
        data.emoji_odd_or_even = .odd_emoji;
    }
}

// Types must be marked `pub`
pub const EmojiOddOrEven = enum(u2) {
    not_emoji,
    even_emoji,
    odd_emoji,
};

const info = config.Extension{
    .inputs = &.{
        "uppercase_mapping",
        "numeric_value_numeric",
        "numeric_value_decimal",
        "simple_lowercase_mapping",
    },
    .compute = &computeInfo,
    .fields = &.{
        .{
            .name = "uppercase_mapping_first_char",
            .type = u21,
            .cp_packing = .shift,
            .shift_low = -64190,
            .shift_high = 42561,
        },
        .{ .name = "has_simple_lowercase", .type = bool },
        .{
            .name = "numeric_value_numeric_reversed",
            .type = []const u8,
            .max_len = 13,
            .max_offset = 503,
            .embedded_len = 1,
        },
    },
};

fn computeInfo(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    backing: anytype,
    tracking: anytype,
) Allocator.Error!void {
    var single_item_buffer: [1]u21 = undefined;
    types.fieldInit(
        "uppercase_mapping_first_char",
        cp,
        data,
        tracking,
        data.uppercase_mapping.sliceWith(
            backing.uppercase_mapping,
            &single_item_buffer,
            cp,
        )[0],
    );

    data.has_simple_lowercase = data.simple_lowercase_mapping.unshift(cp) != null;

    var buffer: [13]u8 = undefined;
    for (data.numeric_value_numeric.slice(backing.numeric_value_numeric), 0..) |digit, i| {
        buffer[data.numeric_value_numeric.len - i - 1] = digit;
    }

    try types.sliceFieldInit(
        "numeric_value_numeric_reversed",
        allocator,
        cp,
        data,
        backing,
        tracking,
        buffer[0..data.numeric_value_numeric.len],
    );
}

fn computeOptEmojiOddOrEven(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    tracking: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = b;
    types.fieldInit(
        "opt_emoji_odd_or_even",
        cp,
        data,
        tracking,
        @as(?EmojiOddOrEven, switch (data.emoji_odd_or_even) {
            .even_emoji => .even_emoji,
            .odd_emoji => .odd_emoji,
            .not_emoji => null,
        }),
    );
}

const opt_emoji_odd_or_even = config.Extension{
    .inputs = &.{"emoji_odd_or_even"},
    .compute = &computeOptEmojiOddOrEven,
    .fields = &.{
        .{
            .name = "opt_emoji_odd_or_even",
            .type = ?EmojiOddOrEven,
            .min_value = 0,
            .max_value = 2,
        },
    },
};

pub const NextOrPrev = union(enum) {
    none: void,
    next: u21,
    prev: u21,
};

fn computeNextOrPrev(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    tracking: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = b;
    var nop: NextOrPrev = .none;
    if (0x1200 <= cp and cp <= 0x1235) {
        nop = switch (cp % 3) {
            0 => .{ .next = cp + 1 },
            1 => .{ .prev = cp - 1 },
            2 => .none,
            else => unreachable,
        };
    }

    types.fieldInit(
        "next_or_prev",
        cp,
        data,
        tracking,
        nop,
    );
}

const next_or_prev = config.Extension{
    .inputs = &.{},
    .compute = &computeNextOrPrev,
    .fields = &.{
        .{
            .name = "next_or_prev",
            .type = NextOrPrev,
            .cp_packing = .shift,
            .shift_low = -1,
            .shift_high = 1,
        },
    },
};

fn computeNextOrPrevDirect(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    tracking: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = b;
    types.fieldInit(
        "next_or_prev_direct",
        cp,
        data,
        tracking,
        data.next_or_prev.unshift(cp),
    );
}

const next_or_prev_direct = config.Extension{
    .inputs = &.{"next_or_prev"},
    .compute = &computeNextOrPrevDirect,
    .fields = &.{
        .{
            .name = "next_or_prev_direct",
            .type = NextOrPrev,
        },
    },
};

fn computeBidiPairedBracketDirect(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    tracking: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = b;
    types.fieldInit(
        "bidi_paired_bracket_direct",
        cp,
        data,
        tracking,
        data.bidi_paired_bracket.unshift(cp),
    );
}

const bidi_paired_bracket_direct = config.Extension{
    .inputs = &.{"bidi_paired_bracket"},
    .compute = &computeBidiPairedBracketDirect,
    .fields = &.{
        .{
            .name = "bidi_paired_bracket_direct",
            .type = types.BidiPairedBracket,
        },
    },
};

fn computeMaybeBit(
    allocator: Allocator,
    cp: u21,
    data: anytype,
    b: anytype,
    tracking: anytype,
) Allocator.Error!void {
    _ = allocator;
    _ = b;
    var maybe: ?bool = null;
    if (0x1200 <= cp and cp <= 0x1235) {
        maybe = cp % 2 == 0;
    }

    types.fieldInit(
        "maybe_bit",
        cp,
        data,
        tracking,
        maybe,
    );
}

const maybe_bit = config.Extension{
    .inputs = &.{},
    .compute = &computeMaybeBit,
    .fields = &.{
        .{
            .name = "maybe_bit",
            .type = ?bool,
            .min_value = 0,
            .max_value = 1,
        },
    },
};

pub const tables = [_]config.Table{
    .{
        .extensions = &.{
            foo,
            emoji_odd_or_even,
            info,
            next_or_prev,
            next_or_prev_direct,
            bidi_paired_bracket_direct,
        },
        .fields = &.{
            foo.field("foo"),
            emoji_odd_or_even.field("emoji_odd_or_even"),
            info.field("uppercase_mapping_first_char"),
            info.field("has_simple_lowercase"),
            info.field("numeric_value_numeric_reversed"),
            next_or_prev.field("next_or_prev"),
            next_or_prev_direct.field("next_or_prev_direct"),
            bidi_paired_bracket_direct.field("bidi_paired_bracket_direct"),
            d.field("name").override(.{
                .embedded_len = 15,
                .max_offset = 986096,
            }),
            d.field("grapheme_break"),
            d.field("special_casing_condition"),
            d.field("special_lowercase_mapping"),
        },
    },
    .{
        .stages = .two,
        .fields = &.{
            d.field("general_category"),
            d.field("case_folding_simple"),
        },
    },
    .{
        .name = "pack",
        .packing = .@"packed",
        .extensions = &.{
            emoji_odd_or_even,
            opt_emoji_odd_or_even,
            maybe_bit,
        },
        .fields = &.{
            opt_emoji_odd_or_even.field("opt_emoji_odd_or_even"),
            maybe_bit.field("maybe_bit"),
            d.field("bidi_paired_bracket"),
        },
    },
    .{
        .name = "checks",
        .extensions = &.{},
        .fields = &.{
            d.field("simple_uppercase_mapping"),
            d.field("is_alphabetic"),
            d.field("is_lowercase"),
            d.field("is_uppercase"),
        },
    },
    .{
        .name = "needed_for_tests",
        .extensions = &.{
            config_x.grapheme_break_pedantic_emoji,
            config_x.wcwidth,
        },
        .fields = &.{
            config_x.grapheme_break_pedantic_emoji.field("grapheme_break_pedantic_emoji"),
            config_x.wcwidth.field("wcwidth"),
        },
    },
};
