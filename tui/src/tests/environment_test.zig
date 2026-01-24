const std = @import("std");
const env_mod = @import("../environment.zig");

const Environment = env_mod.Environment;
const PosixEnv = env_mod.PosixEnv;
const MockEnv = env_mod.MockEnv;
const DefaultEnvironment = env_mod.DefaultEnvironment;

// =============================================================================
// PosixEnv Tests
// =============================================================================

test "PosixEnv returns null for nonexistent key" {
    const result = PosixEnv.get("__SMITHERS_TEST_NONEXISTENT_KEY_12345__");
    try std.testing.expectEqual(@as(?[:0]const u8, null), result);
}

test "PosixEnv returns value for existing env var" {
    // PATH should exist on any POSIX system
    const path = PosixEnv.get("PATH");
    try std.testing.expect(path != null);
    try std.testing.expect(path.?.len > 0);
}

// =============================================================================
// Environment Interface Tests (DI pattern verification)
// =============================================================================

test "Environment wraps implementation correctly" {
    const TestEnv = Environment(PosixEnv);
    // Verify the wrapper delegates to PosixEnv
    const nonexistent = TestEnv.get("__SMITHERS_TEST_NONEXISTENT_KEY_12345__");
    try std.testing.expectEqual(@as(?[:0]const u8, null), nonexistent);
}

test "DefaultEnvironment is Environment(PosixEnv)" {
    // Both should return the same result for the same key
    const default_result = DefaultEnvironment.get("PATH");
    const posix_result = PosixEnv.get("PATH");
    try std.testing.expectEqual(default_result, posix_result);
}

// =============================================================================
// Environment Helper Methods
// =============================================================================

test "Environment.home returns HOME env var" {
    const TestEnv = Environment(PosixEnv);
    const home = TestEnv.home();
    const direct = PosixEnv.get("HOME");
    try std.testing.expectEqual(home, direct);
}

test "Environment.anthropicApiKey returns ANTHROPIC_API_KEY env var" {
    const TestEnv = Environment(PosixEnv);
    const key = TestEnv.anthropicApiKey();
    const direct = PosixEnv.get("ANTHROPIC_API_KEY");
    try std.testing.expectEqual(key, direct);
}

test "Environment.editor returns EDITOR env var" {
    const TestEnv = Environment(PosixEnv);
    const editor = TestEnv.editor();
    const direct = PosixEnv.get("EDITOR");
    try std.testing.expectEqual(editor, direct);
}

// =============================================================================
// MockEnv Tests
// =============================================================================

test "MockEnv init and deinit" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    // Should start empty
    const result = MockEnv.get("TEST_KEY");
    try std.testing.expectEqual(@as(?[:0]const u8, null), result);
}

test "MockEnv set and get" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("MY_VAR", "my_value");
    const result = MockEnv.get("MY_VAR");
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("my_value", result.?);
}

test "MockEnv get returns null for missing key" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    const result = MockEnv.get("NONEXISTENT_KEY");
    try std.testing.expectEqual(@as(?[:0]const u8, null), result);
}

test "MockEnv set overwrites existing value" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("KEY", "value1");
    MockEnv.set("KEY", "value2");
    const result = MockEnv.get("KEY");
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("value2", result.?);
}

test "MockEnv reset clears all values" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("KEY1", "value1");
    MockEnv.set("KEY2", "value2");

    // Verify values exist
    try std.testing.expect(MockEnv.get("KEY1") != null);
    try std.testing.expect(MockEnv.get("KEY2") != null);

    // Reset should clear everything
    MockEnv.reset();

    try std.testing.expectEqual(@as(?[:0]const u8, null), MockEnv.get("KEY1"));
    try std.testing.expectEqual(@as(?[:0]const u8, null), MockEnv.get("KEY2"));
}

test "MockEnv supports multiple keys" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("HOME", "/home/test");
    MockEnv.set("EDITOR", "vim");
    MockEnv.set("ANTHROPIC_API_KEY", "sk-test-key");

    try std.testing.expectEqualStrings("/home/test", MockEnv.get("HOME").?);
    try std.testing.expectEqualStrings("vim", MockEnv.get("EDITOR").?);
    try std.testing.expectEqualStrings("sk-test-key", MockEnv.get("ANTHROPIC_API_KEY").?);
}

// =============================================================================
// DI Pattern Verification - MockEnv as Environment Implementation
// =============================================================================

test "Environment works with MockEnv implementation" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    const TestEnv = Environment(MockEnv);

    // Set mock values
    MockEnv.set("HOME", "/mock/home");
    MockEnv.set("EDITOR", "nano");
    MockEnv.set("ANTHROPIC_API_KEY", "mock-api-key");

    // Verify helpers work through the interface
    try std.testing.expectEqualStrings("/mock/home", TestEnv.home().?);
    try std.testing.expectEqualStrings("nano", TestEnv.editor().?);
    try std.testing.expectEqualStrings("mock-api-key", TestEnv.anthropicApiKey().?);
}

test "Environment with MockEnv returns null for unset helpers" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    const TestEnv = Environment(MockEnv);

    // Don't set any values - helpers should return null
    try std.testing.expectEqual(@as(?[:0]const u8, null), TestEnv.home());
    try std.testing.expectEqual(@as(?[:0]const u8, null), TestEnv.editor());
    try std.testing.expectEqual(@as(?[:0]const u8, null), TestEnv.anthropicApiKey());
}

// =============================================================================
// Edge Cases
// =============================================================================

test "MockEnv handles empty string value" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("EMPTY_VAR", "");
    const result = MockEnv.get("EMPTY_VAR");
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("", result.?);
}

test "MockEnv reset can be called multiple times" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("KEY", "value");
    MockEnv.reset();
    MockEnv.reset(); // Should not crash

    try std.testing.expectEqual(@as(?[:0]const u8, null), MockEnv.get("KEY"));
}

test "MockEnv can set after reset" {
    MockEnv.init(std.testing.allocator);
    defer MockEnv.deinit();

    MockEnv.set("KEY", "value1");
    MockEnv.reset();
    MockEnv.set("KEY", "value2");

    try std.testing.expectEqualStrings("value2", MockEnv.get("KEY").?);
}
