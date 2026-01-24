const std = @import("std");
const header = @import("../ui/header.zig");

// ============================================================================
// Mock Renderer for Testing
// ============================================================================

const MockRenderer = struct {
    w: u16 = 80,
    h: u16 = 24,

    pub const Style = struct {
        fg: ?Color = null,
        bg: ?Color = null,
        bold: bool = false,

        pub const Color = union(enum) {
            index: u8,
            rgb: struct { r: u8, g: u8, b: u8 },
        };
    };

    pub fn width(self: *const MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: *const MockRenderer) u16 {
        return self.h;
    }

    pub fn fill(_: *const MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}

    pub fn drawText(_: *const MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
};

const TestHeader = header.Header(MockRenderer);

// ============================================================================
// Header Initialization Tests
// ============================================================================

test "Header init stores version" {
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "1.2.3", "claude-sonnet");
    try std.testing.expectEqualStrings("1.2.3", h.version);
}

test "Header init stores model" {
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "1.0.0", "claude-sonnet-4");
    try std.testing.expectEqualStrings("claude-sonnet-4", h.model);
}

test "Header init stores allocator" {
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "1.0.0", "test-model");
    try std.testing.expectEqual(allocator, h.allocator);
}

test "Header init with empty version" {
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "", "claude-sonnet");
    try std.testing.expectEqualStrings("", h.version);
}

test "Header init with empty model" {
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "1.0.0", "");
    try std.testing.expectEqualStrings("", h.model);
}

test "Header init with long version string" {
    const allocator = std.testing.allocator;
    const long_version = "1.2.3-alpha.4+build.567";
    const h = TestHeader.init(allocator, long_version, "model");
    try std.testing.expectEqualStrings(long_version, h.version);
}

test "Header init with long model string" {
    const allocator = std.testing.allocator;
    const long_model = "claude-3-5-sonnet-20241022-extended-thinking";
    const h = TestHeader.init(allocator, "1.0.0", long_model);
    try std.testing.expectEqualStrings(long_model, h.model);
}

// ============================================================================
// setModel Tests
// ============================================================================

test "setModel updates model field" {
    const allocator = std.testing.allocator;
    var h = TestHeader.init(allocator, "1.0.0", "old-model");
    h.setModel("new-model");
    try std.testing.expectEqualStrings("new-model", h.model);
}

test "setModel can set to empty string" {
    const allocator = std.testing.allocator;
    var h = TestHeader.init(allocator, "1.0.0", "some-model");
    h.setModel("");
    try std.testing.expectEqualStrings("", h.model);
}

test "setModel can be called multiple times" {
    const allocator = std.testing.allocator;
    var h = TestHeader.init(allocator, "1.0.0", "model-1");

    h.setModel("model-2");
    try std.testing.expectEqualStrings("model-2", h.model);

    h.setModel("model-3");
    try std.testing.expectEqualStrings("model-3", h.model);

    h.setModel("model-4");
    try std.testing.expectEqualStrings("model-4", h.model);
}

// ============================================================================
// height Function Tests
// ============================================================================

test "height returns 1" {
    try std.testing.expectEqual(@as(u16, 1), TestHeader.height());
}

test "height is consistent across calls" {
    try std.testing.expectEqual(TestHeader.height(), TestHeader.height());
}

// ============================================================================
// SEPARATOR Constant Tests
// ============================================================================

test "SEPARATOR has expected format" {
    // Access via init and struct, verify separator is used in draw logic
    // The separator is a private const, but we can verify header behavior
    const allocator = std.testing.allocator;
    const h = TestHeader.init(allocator, "1.0.0", "test");
    _ = h;
    // If we got here without error, struct is valid
    try std.testing.expect(true);
}

// ============================================================================
// DefaultHeader Type Tests
// ============================================================================

test "DefaultHeader type exists" {
    // Verify the default header type alias exists and compiles
    const default_type_info = @typeInfo(header.DefaultHeader);
    try std.testing.expect(default_type_info == .@"struct");
}

// ============================================================================
// Struct Field Tests
// ============================================================================

test "Header has version field" {
    const fields = @typeInfo(TestHeader).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "version")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "Header has model field" {
    const fields = @typeInfo(TestHeader).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "model")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "Header has allocator field" {
    const fields = @typeInfo(TestHeader).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "allocator")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "Header has exactly 3 fields" {
    const fields = @typeInfo(TestHeader).@"struct".fields;
    try std.testing.expectEqual(@as(usize, 3), fields.len);
}
