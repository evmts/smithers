const std = @import("std");
const uucode = @import("../root.zig");
const types_x = @import("types.x.zig");

// TODO: verify if this is reasonable, and see if this is the best API.
// This only takes the width of the first > 0 width code point, as the theory
// is that all these code points are combined into one grapheme cluster.
// However, if there is a zero width joiner, then consider the width to be 2
// (wide), since it's likely to be a wide grapheme cluster.
pub fn unverifiedWcwidth(const_it: anytype) i3 {
    var it = const_it;
    var width: i3 = 0;
    while (it.next()) |result| {
        if (result.cp == uucode.config.zero_width_joiner) {
            width = 2;
        } else if (width <= 0) {
            width = uucode.get(.wcwidth, result.cp);
        }
    }

    return width;
}

test "unverifiedWcwidth" {
    const str = "क्‍ष";
    const it = uucode.grapheme.Iterator(uucode.utf8.Iterator).init(.init(str));
    try std.testing.expect(unverifiedWcwidth(it) == 2);
}

pub fn PedanticEmojiIterator(comptime CodePointIterator: type) type {
    return uucode.grapheme.CustomIterator(
        CodePointIterator,
        types_x.GraphemeBreakPedanticEmoji,
        uucode.grapheme.BreakState,
        .grapheme_break_pedantic_emoji,
        precomputedGraphemeBreakPedanticEmoji,
    );
}

fn isIndicConjunctBreakExtend(gb: types_x.GraphemeBreakPedanticEmoji) bool {
    return gb == .indic_conjunct_break_extend or gb == .zwj or gb == .emoji_modifier;
}

fn isExtendedPictographic(gb: types_x.GraphemeBreakPedanticEmoji) bool {
    return gb == .extended_pictographic or gb == .emoji_modifier_base;
}

fn isExtend(gb: types_x.GraphemeBreakPedanticEmoji) bool {
    return gb == .zwnj or
        gb == .indic_conjunct_break_extend or
        gb == .indic_conjunct_break_linker;
}

// This code is left in case `zig` ever gets better at not spending a bunch
// of time in semantic analysis for `isBreakPendanticEmoji` every time.
//
//fn mapXEmojiToOriginal(gbx: types_x.GraphemeBreakPedanticEmoji) uucode.types.GraphemeBreak {
//    return switch (gbx) {
//        .emoji_modifier => .indic_conjunct_break_extend,
//        .emoji_modifier_base => .extended_pictographic,
//
//        inline else => |g| comptime blk: {
//            @setEvalBranchQuota(10_000);
//            break :blk std.meta.stringToEnum(
//                uucode.types.GraphemeBreak,
//                @tagName(g),
//            ) orelse unreachable;
//        },
//    };
//}

// This code is an almost exact copy of `computeGraphemeBreak` in
// `src/grapheme.zig`, only repeated here to avoid Zig spending a bunch
// of time in semantic analysis.
fn computeOriginalGraphemeBreakButForPedanticEmoji(
    gb1: types_x.GraphemeBreakPedanticEmoji,
    gb2: types_x.GraphemeBreakPedanticEmoji,
    state: *uucode.grapheme.BreakState,
) bool {
    // Set state back to default when `gb1` or `gb2` is not expected in sequence.
    switch (state.*) {
        .regional_indicator => {
            if (gb1 != .regional_indicator or gb2 != .regional_indicator) {
                state.* = .default;
            }
        },
        .extended_pictographic => {
            switch (gb1) {
                // Keep state if in possibly valid sequence
                .indic_conjunct_break_extend, // extend
                .indic_conjunct_break_linker, // extend
                .zwnj, // extend
                .zwj,
                .extended_pictographic,
                => {},

                else => state.* = .default,
            }

            switch (gb2) {
                // Keep state if in possibly valid sequence
                .indic_conjunct_break_extend, // extend
                .indic_conjunct_break_linker, // extend
                .zwnj, // extend
                .zwj,
                .extended_pictographic,
                => {},

                else => state.* = .default,
            }
        },
        .indic_conjunct_break_consonant, .indic_conjunct_break_linker => {
            switch (gb1) {
                // Keep state if in possibly valid sequence
                .indic_conjunct_break_consonant,
                .indic_conjunct_break_linker,
                .indic_conjunct_break_extend,
                .zwj, // indic_conjunct_break_extend
                => {},

                else => state.* = .default,
            }

            switch (gb2) {
                // Keep state if in possibly valid sequence
                .indic_conjunct_break_consonant,
                .indic_conjunct_break_linker,
                .indic_conjunct_break_extend,
                .zwj, // indic_conjunct_break_extend
                => {},

                else => state.* = .default,
            }
        },
        .default => {},
    }

    // GB3: CR x LF
    if (gb1 == .cr and gb2 == .lf) return false;

    // GB4: Control
    if (gb1 == .control or gb1 == .cr or gb1 == .lf) return true;

    // GB5: Control
    if (gb2 == .control or gb2 == .cr or gb2 == .lf) return true;

    // GB6: L x (L | V | LV | VT)
    if (gb1 == .l) {
        if (gb2 == .l or
            gb2 == .v or
            gb2 == .lv or
            gb2 == .lvt) return false;
    }

    // GB7: (LV | V) x (V | T)
    if (gb1 == .lv or gb1 == .v) {
        if (gb2 == .v or gb2 == .t) return false;
    }

    // GB8: (LVT | T) x T
    if (gb1 == .lvt or gb1 == .t) {
        if (gb2 == .t) return false;
    }

    // Handle GB9 (Extend | ZWJ) later, since it can also match the start of
    // GB9c (Indic) and GB11 (Emoji ZWJ)

    // GB9a: SpacingMark
    if (gb2 == .spacing_mark) return false;

    // GB9b: Prepend
    if (gb1 == .prepend) return false;

    // GB9c: Indic
    if (gb1 == .indic_conjunct_break_consonant) {
        // start of sequence:

        // In normal operation, we'll be in this state, but
        // buildGraphemeBreakTable iterates all states.
        // std.debug.assert(state.* == .default);

        if (isIndicConjunctBreakExtend(gb2)) {
            state.* = .indic_conjunct_break_consonant;
            return false;
        } else if (gb2 == .indic_conjunct_break_linker) {
            // jump straight to linker state
            state.* = .indic_conjunct_break_linker;
            return false;
        }
        // else, not an Indic sequence

    } else if (state.* == .indic_conjunct_break_consonant) {
        // consonant state:

        if (gb2 == .indic_conjunct_break_linker) {
            // consonant -> linker transition
            state.* = .indic_conjunct_break_linker;
            return false;
        } else if (isIndicConjunctBreakExtend(gb2)) {
            // continue [extend]* sequence
            return false;
        } else {
            // Not a valid Indic sequence
            state.* = .default;
        }
    } else if (state.* == .indic_conjunct_break_linker) {
        // linker state:

        if (gb2 == .indic_conjunct_break_linker or
            isIndicConjunctBreakExtend(gb2))
        {
            // continue [extend linker]* sequence
            return false;
        } else if (gb2 == .indic_conjunct_break_consonant) {
            // linker -> end of sequence
            state.* = .default;
            return false;
        } else {
            // Not a valid Indic sequence
            state.* = .default;
        }
    }

    // GB11: Emoji ZWJ sequence
    if (isExtendedPictographic(gb1)) {
        // start of sequence:

        // In normal operation, we'll be in this state, but
        // buildGraphemeBreakTable iterates all states.
        // std.debug.assert(state.* == .default);

        if (isExtend(gb2) or gb2 == .zwj) {
            state.* = .extended_pictographic;
            return false;
        }
        // else, not an Emoji ZWJ sequence
    } else if (state.* == .extended_pictographic) {
        // continue or end sequence:

        if (isExtend(gb1) and (isExtend(gb2) or gb2 == .zwj)) {
            // continue extend* ZWJ sequence
            return false;
        } else if (gb1 == .zwj and isExtendedPictographic(gb2)) {
            // ZWJ -> end of sequence
            state.* = .default;
            return false;
        } else {
            // Not a valid Emoji ZWJ sequence
            state.* = .default;
        }
    }

    // GB12 and GB13: Regional Indicator
    if (gb1 == .regional_indicator and gb2 == .regional_indicator) {
        if (state.* == .default) {
            state.* = .regional_indicator;
            return false;
        } else {
            state.* = .default;
            return true;
        }
    }

    // GB9: x (Extend | ZWJ)
    if (isExtend(gb2) or gb2 == .zwj) return false;

    // GB999: Otherwise, break everywhere
    return true;
}

pub fn computeGraphemeBreakPedanticEmoji(
    gb1: types_x.GraphemeBreakPedanticEmoji,
    gb2: types_x.GraphemeBreakPedanticEmoji,
    state: *uucode.grapheme.BreakState,
) bool {
    const result = computeOriginalGraphemeBreakButForPedanticEmoji(gb1, gb2, state);

    if (gb2 == .emoji_modifier) {
        if (gb1 == .emoji_modifier_base) {
            // In normal operation, we'll be in this state, but
            // buildGraphemeBreakTable iterates all states.
            //std.debug.assert(state.* == .extended_pictographic);
            return false;
        } else {
            // Only break when `emoji_modifier` follows `emoji_modifier_base`.
            // Note also from UTS #51:
            // > Implementations may choose to support old data that contains
            // > defective emoji_modifier_sequences, that is, having emoji
            // > presentation selectors. but here we don't support that.
            return true;
        }
    } else {
        return result;
    }
}

pub fn precomputedGraphemeBreakPedanticEmoji(
    gb1: types_x.GraphemeBreakPedanticEmoji,
    gb2: types_x.GraphemeBreakPedanticEmoji,
    state: *uucode.grapheme.BreakState,
) bool {
    const table = comptime uucode.grapheme.buildGraphemeBreakTable(
        types_x.GraphemeBreakPedanticEmoji,
        uucode.grapheme.BreakState,
        computeGraphemeBreakPedanticEmoji,
    );
    const result = table.get(gb1, gb2, state.*);
    state.* = result.state;
    return result.result;
}

// While this is included in `uucode` as a builtin extension, the core
// `isBreak` should be used unless there's a very good reason to use this one.
// The reason this is included as a builtin extensions is because determining
// a grapheme break is something that, due to the complexities of human
// language, isn't something that a single algorithm can satisfy every
// case perfectly for all people. The unicode standard tries to make a
// good compromise between "correctness" and implementation complexity.
//
// For this example, this implements the grapheme break with an addditional
// handling that used to be in Uniocode 10. Despite `emoji_modifier` being
// `extend`, UTS #51 states: `emoji_modifier_sequence := emoji_modifier_base
// emoji_modifier` and: "When used alone, the default representation of these
// modifier characters is a color swatch". See this revision of UAX #29 when
// the grapheme cluster break properties were simplified to remove `E_Base` and
// `E_Modifier`: http://www.unicode.org/reports/tr29/tr29-32.html
pub fn isBreakPendanticEmoji(
    cp1: u21,
    cp2: u21,
    state: *uucode.grapheme.BreakState,
) bool {
    const gb1 = uucode.get(.grapheme_break_pedantic_emoji, cp1);
    const gb2 = uucode.get(.grapheme_break_pedantic_emoji, cp2);
    return precomputedGraphemeBreakPedanticEmoji(gb1, gb2, state);
}
