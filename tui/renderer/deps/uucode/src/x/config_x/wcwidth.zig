//! From: https://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c
//!
//! This is an implementation of wcwidth() and wcswidth() (defined in
//! IEEE Std 1002.1-2001) for Unicode.
//!
//! http://www.opengroup.org/onlinepubs/007904975/functions/wcwidth.html
//! http://www.opengroup.org/onlinepubs/007904975/functions/wcswidth.html
//!
//! In fixed-width output devices, Latin characters all occupy a single
//! "cell" position of equal width, whereas ideographic CJK characters
//! occupy two such cells. Interoperability between terminal-line
//! applications and (teletype-style) character terminals using the
//! UTF-8 encoding requires agreement on which character should advance
//! the cursor by how many cell positions. No established formal
//! standards exist at present on which Unicode character shall occupy
//! how many cell positions on character terminals. These routines are
//! a first attempt of defining such behavior based on simple rules
//! applied to data provided by the Unicode Consortium.
//!
//! For some graphical characters, the Unicode standard explicitly
//! defines a character-cell width via the definition of the East Asian
//! FullWidth (F), Wide (W), Half-width (H), and Narrow (Na) classes.
//! In all these cases, there is no ambiguity about which width a
//! terminal shall use. For characters in the East Asian Ambiguous (A)
//! class, the width choice depends purely on a preference of backward
//! compatibility with either historic CJK or Western practice.
//! Choosing single-width for these characters is easy to justify as
//! the appropriate long-term solution, as the CJK practice of
//! displaying these characters as double-width comes from historic
//! implementation simplicity (8-bit encoded characters were displayed
//! single-width and 16-bit ones double-width, even for Greek,
//! Cyrillic, etc.) and not any typographic considerations.
//!
//! Much less clear is the choice of width for the Not East Asian
//! (Neutral) class. Existing practice does not dictate a width for any
//! of these characters. It would nevertheless make sense
//! typographically to allocate two character cells to characters such
//! as for instance EM SPACE or VOLUME INTEGRAL, which cannot be
//! represented adequately with a single-width glyph. The following
//! routines at present merely assign a single-cell width to all
//! neutral characters, in the interest of simplicity. This is not
//! entirely satisfactory and should be reconsidered before
//! establishing a formal standard in this area. At the moment, the
//! decision which Not East Asian (Neutral) characters should be
//! represented by double-width glyphs cannot yet be answered by
//! applying a simple rule from the Unicode database content. Setting
//! up a proper standard for the behavior of UTF-8 character terminals
//! will require a careful analysis not only of each Unicode character,
//! but also of each presentation form, something the author of these
//! routines has avoided to do so far.
//!
//! http://www.unicode.org/unicode/reports/tr11/
//!
//! Markus Kuhn -- 2007-05-26 (Unicode 5.0)
//!
//! Permission to use, copy, modify, and distribute this software
//! for any purpose and without fee is hereby granted. The author
//! disclaims all warranties with regard to this software.
//!
//! Latest version: http://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c

const std = @import("std");
const config = @import("config.zig");

/// From: https://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c
///
/// The following two functions define the column width of an ISO 10646
/// character as follows:
///
///    - The null character (U+0000) has a column width of 0.
///
///    - Other C0/C1 control characters and DEL will lead to a return
///      value of -1.
///
///    - Non-spacing and enclosing combining characters (general
///      category code Mn or Me in the Unicode database) have a
///      column width of 0.
///
///    - SOFT HYPHEN (U+00AD) has a column width of 1.
///
///    - Other format characters (general category code Cf in the Unicode
///      database) and ZERO WIDTH SPACE (U+200B) have a column width of 0.
///
///    - Hangul Jamo medial vowels and final consonants (U+1160-U+11FF)
///      have a column width of 0.
///
///    - Spacing characters in the East Asian Wide (W) or East Asian
///      Full-width (F) category as defined in Unicode Technical
///      Report #11 have a column width of 2.
///
///    - All remaining characters (including all printable
///      ISO 8859-1 and WGL4 characters, Unicode control characters,
///      etc.) have a column width of 1.
///
/// See also Ziglyph's `codePointWidth` function:
/// https://codeberg.org/dude_the_builder/ziglyph/src/branch/main/src/display_width.zig
///
fn compute(
    allocator: std.mem.Allocator,
    cp: u21,
    data: anytype,
    backing: anytype,
    tracking: anytype,
) std.mem.Allocator.Error!void {
    _ = allocator;
    _ = backing;
    _ = tracking;
    const gc = data.general_category;
    const block = data.block;

    if (cp == 0) {
        data.wcwidth = 0;
    } else if (gc == .other_control) {
        data.wcwidth = -1;
    } else if (gc == .mark_nonspacing or gc == .mark_enclosing) {
        data.wcwidth = 0;
    } else if (cp == 0x00AD) { // Soft hyphen
        data.wcwidth = 1;
    } else if (cp == 0x2E3A) { // Two-em dash
        data.wcwidth = 2;
    } else if (cp == 0x2E3B) { // Three-em dash
        data.wcwidth = 3;
    } else if (gc == .other_format and block != .arabic and cp != 0x08E2) {
        // Format except Arabic (from Ziglyph).
        data.wcwidth = 0;
    } else if (block == .hangul_jamo and cp >= 0x1160) {
        // Note though that 0x1160 and up in hangul_jamo are
        // east_asian_width == .neutral
        data.wcwidth = 0;
    } else if (data.east_asian_width == .wide or data.east_asian_width == .fullwidth) {
        data.wcwidth = 2;
    } else if (data.grapheme_break == .regional_indicator) {
        data.wcwidth = 2;
    } else {
        data.wcwidth = 1;
    }
}

pub const wcwidth = config.Extension{
    .inputs = &.{
        "block",
        "east_asian_width",
        "general_category",
        "grapheme_break",
    },
    .compute = &compute,
    .fields = &.{
        .{ .name = "wcwidth", .type = i3 },
    },
};
