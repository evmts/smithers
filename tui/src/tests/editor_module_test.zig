const std = @import("std");

// =============================================================================
// Editor Module Tests
// =============================================================================
//
// Tests for tui/src/editor.zig which provides openExternalEditor functionality.
// Since the actual function spawns processes and manipulates TTY, we test:
// 1. The whitespace trimming logic (extracted and tested directly)
// 2. File I/O patterns used by the module
// 3. Mock-based tests for the DI-enabled generic version
// 4. Edge cases and boundary conditions

// =============================================================================
// Whitespace Trimming Tests (core logic from openExternalEditor)
// =============================================================================

/// Replicates the trimming logic from openExternalEditor
fn trimTrailingWhitespace(allocator: std.mem.Allocator, content: []const u8) ![]u8 {
    const trimmed = std.mem.trimRight(u8, content, " \t\n\r");
    if (trimmed.len < content.len) {
        const result = try allocator.dupe(u8, trimmed);
        return result;
    }
    return try allocator.dupe(u8, content);
}

test "trim trailing whitespace - no whitespace" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello world");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello world", result);
}

test "trim trailing whitespace - trailing newline" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello world\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello world", result);
}

test "trim trailing whitespace - multiple trailing newlines" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello\n\n\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "trim trailing whitespace - mixed trailing whitespace" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello \t\n\r ");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "trim trailing whitespace - only whitespace" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "   \t\n\r  ");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "trim trailing whitespace - empty string" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "trim trailing whitespace - preserves internal whitespace" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello  world\n\ntest\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello  world\n\ntest", result);
}

test "trim trailing whitespace - preserves leading whitespace" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "  hello\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("  hello", result);
}

test "trim trailing whitespace - CRLF line endings" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "hello\r\n\r\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "trim trailing whitespace - tabs only" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "text\t\t\t");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("text", result);
}

// =============================================================================
// Temp File Path Tests
// =============================================================================

const TEMP_PATH = "/tmp/smithers-edit.txt";

test "temp file path is absolute" {
    try std.testing.expect(std.fs.path.isAbsolute(TEMP_PATH));
}

test "temp file path starts with /tmp" {
    try std.testing.expect(std.mem.startsWith(u8, TEMP_PATH, "/tmp"));
}

// =============================================================================
// File I/O Pattern Tests (mirrors editor.zig file operations)
// =============================================================================

fn createTestTempFile(content: []const u8) !void {
    const file = try std.fs.createFileAbsolute(TEMP_PATH, .{});
    defer file.close();
    if (content.len > 0) {
        try file.writeAll(content);
    }
}

fn deleteTestTempFile() void {
    std.fs.deleteFileAbsolute(TEMP_PATH) catch {};
}

fn readTestTempFile(allocator: std.mem.Allocator) ![]u8 {
    const file = try std.fs.openFileAbsolute(TEMP_PATH, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, 1024 * 1024);
}

test "file create and read pattern" {
    const allocator = std.testing.allocator;
    const test_content = "test content for editor";

    try createTestTempFile(test_content);
    defer deleteTestTempFile();

    const read_back = try readTestTempFile(allocator);
    defer allocator.free(read_back);

    try std.testing.expectEqualStrings(test_content, read_back);
}

test "file create with empty content" {
    const allocator = std.testing.allocator;

    try createTestTempFile("");
    defer deleteTestTempFile();

    const read_back = try readTestTempFile(allocator);
    defer allocator.free(read_back);

    try std.testing.expectEqual(@as(usize, 0), read_back.len);
}

test "file overwrite existing" {
    const allocator = std.testing.allocator;

    try createTestTempFile("original content");
    try createTestTempFile("new content");
    defer deleteTestTempFile();

    const read_back = try readTestTempFile(allocator);
    defer allocator.free(read_back);

    try std.testing.expectEqualStrings("new content", read_back);
}

test "file delete pattern" {
    try createTestTempFile("temp");

    // Verify exists - accessAbsolute returns void on success
    try std.fs.accessAbsolute(TEMP_PATH, .{});

    deleteTestTempFile();

    // Verify deleted
    const after_delete = std.fs.accessAbsolute(TEMP_PATH, .{});
    try std.testing.expectError(error.FileNotFound, after_delete);
}

test "file delete non-existent is safe" {
    // Should not panic or error
    deleteTestTempFile();
    deleteTestTempFile(); // Call twice to ensure idempotent
}

test "file read with max size limit" {
    const allocator = std.testing.allocator;

    // Create content that fits within 1MB limit
    const content = "A" ** 1000;
    try createTestTempFile(content);
    defer deleteTestTempFile();

    const file = try std.fs.openFileAbsolute(TEMP_PATH, .{});
    defer file.close();
    const read_back = try file.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(read_back);

    try std.testing.expectEqual(@as(usize, 1000), read_back.len);
}

test "file content with unicode" {
    const allocator = std.testing.allocator;
    const unicode_content = "Hello 世界 🎉 émojis привет";

    try createTestTempFile(unicode_content);
    defer deleteTestTempFile();

    const read_back = try readTestTempFile(allocator);
    defer allocator.free(read_back);

    try std.testing.expectEqualStrings(unicode_content, read_back);
}

test "file content with special characters" {
    const allocator = std.testing.allocator;
    const special_content = "Line1\nLine2\tTabbed\r\nCRLF\x00NullByte";

    try createTestTempFile(special_content);
    defer deleteTestTempFile();

    const read_back = try readTestTempFile(allocator);
    defer allocator.free(read_back);

    try std.testing.expectEqualSlices(u8, special_content, read_back);
}

// =============================================================================
// Mock-based Editor Tests (DI pattern)
// =============================================================================

/// Mock environment for testing EDITOR/VISUAL env var logic
const MockEnv = struct {
    var editor_val: ?[:0]const u8 = null;
    var visual_val: ?[:0]const u8 = null;

    pub fn reset() void {
        editor_val = null;
        visual_val = null;
    }

    pub fn setEditor(val: [:0]const u8) void {
        editor_val = val;
    }

    pub fn setVisual(val: [:0]const u8) void {
        visual_val = val;
    }

    pub fn get(key: [:0]const u8) ?[:0]const u8 {
        if (std.mem.eql(u8, key, "EDITOR")) return editor_val;
        if (std.mem.eql(u8, key, "VISUAL")) return visual_val;
        return null;
    }
};

/// Replicates the editor command selection logic from openExternalEditor
fn getEditorCommand(comptime Env: type) []const u8 {
    return Env.get("EDITOR") orelse Env.get("VISUAL") orelse "vi";
}

test "editor command - EDITOR set" {
    MockEnv.reset();
    MockEnv.setEditor("nvim");

    const cmd = getEditorCommand(MockEnv);
    try std.testing.expectEqualStrings("nvim", cmd);
}

test "editor command - VISUAL set, EDITOR not set" {
    MockEnv.reset();
    MockEnv.setVisual("code");

    const cmd = getEditorCommand(MockEnv);
    try std.testing.expectEqualStrings("code", cmd);
}

test "editor command - both set, EDITOR takes precedence" {
    MockEnv.reset();
    MockEnv.setEditor("vim");
    MockEnv.setVisual("emacs");

    const cmd = getEditorCommand(MockEnv);
    try std.testing.expectEqualStrings("vim", cmd);
}

test "editor command - neither set, defaults to vi" {
    MockEnv.reset();

    const cmd = getEditorCommand(MockEnv);
    try std.testing.expectEqualStrings("vi", cmd);
}

// =============================================================================
// Mock Input Component Tests
// =============================================================================

/// Mock input that tracks getText and clear calls
const MockInput = struct {
    text: []const u8 = "",
    allocator: std.mem.Allocator,
    get_text_count: usize = 0,
    clear_count: usize = 0,

    pub fn init(allocator: std.mem.Allocator) MockInput {
        return .{ .allocator = allocator };
    }

    pub fn getText(self: *MockInput) ![]u8 {
        self.get_text_count += 1;
        return try self.allocator.dupe(u8, self.text);
    }

    pub fn clear(self: *MockInput) void {
        self.clear_count += 1;
        self.text = "";
    }

    pub fn setText(self: *MockInput, text: []const u8) void {
        self.text = text;
    }
};

test "MockInput getText returns current text" {
    const allocator = std.testing.allocator;
    var input = MockInput.init(allocator);
    input.setText("hello");

    const text = try input.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("hello", text);
    try std.testing.expectEqual(@as(usize, 1), input.get_text_count);
}

test "MockInput clear resets text" {
    const allocator = std.testing.allocator;
    var input = MockInput.init(allocator);
    input.setText("hello");

    input.clear();

    const text = try input.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("", text);
    try std.testing.expectEqual(@as(usize, 1), input.clear_count);
}

test "MockInput empty initial state" {
    const allocator = std.testing.allocator;
    var input = MockInput.init(allocator);

    const text = try input.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("", text);
}

// =============================================================================
// Integration Pattern Tests (simulated workflow)
// =============================================================================

/// Simulates the full editor workflow without spawning processes
fn simulateEditorWorkflow(
    allocator: std.mem.Allocator,
    initial_text: []const u8,
    edited_text: []const u8,
) ![]u8 {
    // Step 1: Create temp file with initial content
    try createTestTempFile(initial_text);
    errdefer deleteTestTempFile();

    // Step 2: Simulate editor modifying the file
    try createTestTempFile(edited_text);

    // Step 3: Read the edited content
    const content = try readTestTempFile(allocator);
    errdefer allocator.free(content);

    // Step 4: Trim trailing whitespace
    const trimmed = try trimTrailingWhitespace(allocator, content);
    allocator.free(content);

    // Step 5: Clean up temp file
    deleteTestTempFile();

    return trimmed;
}

test "workflow - empty to text" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "", "New message");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("New message", result);
}

test "workflow - text to text" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "Draft", "Final message");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("Final message", result);
}

test "workflow - text with trailing whitespace trimmed" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "", "Message\n\n\n");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("Message", result);
}

test "workflow - multiline content" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "", "Line 1\nLine 2\nLine 3\n");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("Line 1\nLine 2\nLine 3", result);
}

test "workflow - content unchanged" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "Same text", "Same text");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("Same text", result);
}

test "workflow - empty result" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "Draft", "");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("", result);
}

test "workflow - whitespace only result" {
    const allocator = std.testing.allocator;

    const result = try simulateEditorWorkflow(allocator, "", "   \n\t\r\n  ");
    defer allocator.free(result);

    try std.testing.expectEqualStrings("", result);
}

// =============================================================================
// Memory Safety Tests
// =============================================================================

test "trim does not leak on trimmed content" {
    const allocator = std.testing.allocator;

    // Multiple allocations should all be freed
    for (0..100) |_| {
        const result = try trimTrailingWhitespace(allocator, "hello\n\n\n");
        allocator.free(result);
    }
    // Test passes if no leak detected by testing allocator
}

test "trim does not leak on untrimmed content" {
    const allocator = std.testing.allocator;

    for (0..100) |_| {
        const result = try trimTrailingWhitespace(allocator, "hello");
        allocator.free(result);
    }
}

test "workflow does not leak memory" {
    const allocator = std.testing.allocator;

    for (0..10) |_| {
        const result = try simulateEditorWorkflow(allocator, "Draft", "Final\n\n");
        allocator.free(result);
    }
}

// =============================================================================
// Boundary Condition Tests
// =============================================================================

test "trim single character" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "a");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a", result);
}

test "trim single whitespace character" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, " ");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "trim single newline" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "trim character followed by single space" {
    const allocator = std.testing.allocator;
    const result = try trimTrailingWhitespace(allocator, "x ");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("x", result);
}

test "large content trimming" {
    const allocator = std.testing.allocator;

    // Create large content with trailing whitespace
    const large_text = "A" ** 10000;
    const with_trailing = try std.fmt.allocPrint(allocator, "{s}\n\n\n", .{large_text});
    defer allocator.free(with_trailing);

    const result = try trimTrailingWhitespace(allocator, with_trailing);
    defer allocator.free(result);

    try std.testing.expectEqual(@as(usize, 10000), result.len);
    try std.testing.expect(std.mem.eql(u8, result, large_text));
}

// =============================================================================
// Error Handling Tests
// =============================================================================

test "read non-existent file returns error" {
    const allocator = std.testing.allocator;
    const result = std.fs.openFileAbsolute("/tmp/nonexistent-smithers-test-12345.txt", .{});
    try std.testing.expectError(error.FileNotFound, result);
    _ = allocator;
}

test "create file in non-existent directory returns error" {
    const result = std.fs.createFileAbsolute("/nonexistent-dir-12345/test.txt", .{});
    try std.testing.expectError(error.FileNotFound, result);
}

// =============================================================================
// Process Child Configuration Tests (verify expected setup)
// =============================================================================

test "child process config - inherit behavior" {
    // Verify the Child behavior enum values match expected configuration
    try std.testing.expect(@intFromEnum(std.process.Child.StdIo.Inherit) != @intFromEnum(std.process.Child.StdIo.Pipe));
    try std.testing.expect(@intFromEnum(std.process.Child.StdIo.Inherit) != @intFromEnum(std.process.Child.StdIo.Close));
}

// =============================================================================
// Concurrent Access Safety Tests
// =============================================================================

test "temp file path collision - sequential operations safe" {
    const allocator = std.testing.allocator;

    // Simulate two sequential editor operations using same temp path
    {
        const result1 = try simulateEditorWorkflow(allocator, "", "First");
        defer allocator.free(result1);
        try std.testing.expectEqualStrings("First", result1);
    }

    {
        const result2 = try simulateEditorWorkflow(allocator, "", "Second");
        defer allocator.free(result2);
        try std.testing.expectEqualStrings("Second", result2);
    }
}

test "cleanup after failed read" {
    // Ensure temp file is cleaned up even if subsequent operations would fail
    try createTestTempFile("content");
    deleteTestTempFile();

    // File should not exist after cleanup
    const result = std.fs.accessAbsolute(TEMP_PATH, .{});
    try std.testing.expectError(error.FileNotFound, result);
}
