const std = @import("std");
const logo = @import("../components/logo.zig");

// ============================================================================
// ASCII Art Tests
// ============================================================================

test "ascii_art is not empty" {
    try std.testing.expect(logo.ascii_art.len > 0);
}

test "ascii_art contains SMITHERS text" {
    // The ASCII art should spell out SMITHERS using box drawing characters
    // Check for distinctive Unicode box characters used in the logo
    try std.testing.expect(std.mem.indexOf(u8, logo.ascii_art, "███") != null);
}

test "ascii_art has consistent line structure" {
    // Each line should start with backslash-backslash and spaces
    try std.testing.expect(std.mem.indexOf(u8, logo.ascii_art, "  ") != null);
}

// ============================================================================
// Subtitle Tests
// ============================================================================

test "subtitle is not empty" {
    try std.testing.expect(logo.subtitle.len > 0);
}

test "subtitle contains expected text" {
    try std.testing.expectEqualStrings("Multi-Agent AI Orchestration Framework", logo.subtitle);
}

test "subtitle length matches expected" {
    try std.testing.expectEqual(@as(usize, 39), logo.subtitle.len);
}

// ============================================================================
// Dimension Constants Tests
// ============================================================================

test "height is correct" {
    try std.testing.expectEqual(@as(u16, 6), logo.height);
}

test "width is correct" {
    try std.testing.expectEqual(@as(u16, 66), logo.width);
}

test "width is greater than height" {
    try std.testing.expect(logo.width > logo.height);
}

test "dimensions are non-zero" {
    try std.testing.expect(logo.height > 0);
    try std.testing.expect(logo.width > 0);
}

test "width is greater than subtitle length" {
    try std.testing.expect(logo.width > logo.subtitle.len);
}

// ============================================================================
// ASCII Art Line Count Test
// ============================================================================

test "ascii_art has correct number of lines" {
    var line_count: u16 = 0;
    var iter = std.mem.splitScalar(u8, logo.ascii_art, '\n');
    while (iter.next()) |_| {
        line_count += 1;
    }
    try std.testing.expectEqual(logo.height, line_count);
}

// ============================================================================
// Logo Type Generation Tests
// ============================================================================

test "Logo comptime function generates type" {
    // Test that Logo(T) returns a valid type with draw function
    const MockRenderer = struct {
        pub const Style = struct {
            fg: union(enum) {
                rgb: struct { u8, u8, u8 },
            },
        };

        pub fn width(_: @This()) u16 {
            return 80;
        }

        pub fn height(_: @This()) u16 {
            return 24;
        }

        pub fn subRegion(_: @This(), _: u16, _: u16, _: u16, _: u16) MockSubRegion {
            return .{};
        }

        pub fn drawText(_: @This(), _: u16, _: u16, _: []const u8, _: Style) void {}
    };

    const MockSubRegion = struct {
        window: MockWindow = .{},

        const MockWindow = struct {
            pub fn printSegment(_: @This(), _: anytype, _: anytype) void {}
        };
    };

    const TestLogo = logo.Logo(MockRenderer);
    // Verify the type has a draw function
    try std.testing.expect(@hasDecl(TestLogo, "draw"));
}

// ============================================================================
// Content Validation Tests
// ============================================================================

test "ascii_art contains only valid characters" {
    // ASCII art should only contain printable characters, spaces, and newlines
    for (logo.ascii_art) |c| {
        const is_valid = c == '\n' or c == ' ' or c >= 0x80 or (c >= 0x20 and c <= 0x7E);
        try std.testing.expect(is_valid);
    }
}

test "subtitle contains only ASCII printable characters" {
    for (logo.subtitle) |c| {
        try std.testing.expect(c >= 0x20 and c <= 0x7E);
    }
}

test "ascii_art starts with spaces" {
    try std.testing.expect(std.mem.startsWith(u8, logo.ascii_art, "  "));
}
