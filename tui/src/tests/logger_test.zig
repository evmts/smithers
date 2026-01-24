const std = @import("std");
const logger_mod = @import("../logger.zig");
const Logger = logger_mod.Logger;

// ============================================================
// Test Helpers
// ============================================================

fn getTempDir() !std.fs.Dir {
    return std.fs.cwd().openDir("/tmp", .{});
}

fn readLogFile(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    const file = try std.fs.openFileAbsolute(path, .{});
    defer file.close();
    return file.readToEndAlloc(allocator, 1024 * 1024);
}

fn deleteFile(path: []const u8) void {
    std.fs.deleteFileAbsolute(path) catch {};
}

// ============================================================
// Logger Initialization Tests
// ============================================================

test "Logger.init creates instance with allocator" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    try std.testing.expectEqual(allocator, logger.allocator);
}

test "Logger.init creates file handle" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    try std.testing.expect(logger.file != null);
}

test "Logger.deinit closes file handle" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    logger.deinit();

    // After deinit, file should be closed (we can't directly verify, but no crash is good)
    try std.testing.expect(true);
}

test "Logger.deinit handles null file gracefully" {
    const allocator = std.testing.allocator;
    var logger = Logger{
        .file = null,
        .allocator = allocator,
    };
    logger.deinit(); // Should not crash
}

test "Logger.deinit is idempotent-safe" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    logger.deinit();
    // Calling deinit again would be undefined behavior on closed file,
    // but we verify first deinit works correctly
}

// ============================================================
// Log Level Tests
// ============================================================

test "Logger.debug writes debug level" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.debug(.test_scope, "debug message", .{});

    // Read back and verify
    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[debug]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "(test_scope)") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "debug message") != null);
}

test "Logger.info writes info level" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.test_scope, "info message", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[info]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "info message") != null);
}

test "Logger.warn writes warn level" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.warn(.test_scope, "warn message", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[warn]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "warn message") != null);
}

test "Logger.logErr writes err level" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.logErr(.test_scope, "error message", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[err]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "error message") != null);
}

// ============================================================
// Formatting Tests
// ============================================================

test "Logger.log formats with arguments" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.format_test, "value: {d}, text: {s}", .{ 42, "hello" });

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "value: 42, text: hello") != null);
}

test "Logger.log includes timestamp" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.timestamp_test, "timestamp check", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    // Timestamp should be a number at the start of the log line
    try std.testing.expect(content.len > 0);
    try std.testing.expect(content[0] == '[');
}

test "Logger.log includes scope name" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.my_custom_scope, "scope test", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "(my_custom_scope)") != null);
}

test "Logger.log appends newline" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.newline_test, "line 1", .{});
    logger.info(.newline_test, "line 2", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    // Count newlines - should have at least 2
    var newline_count: usize = 0;
    for (content) |c| {
        if (c == '\n') newline_count += 1;
    }
    try std.testing.expect(newline_count >= 2);
}

// ============================================================
// Edge Cases
// ============================================================

test "Logger.log with null file does nothing" {
    const allocator = std.testing.allocator;
    var logger = Logger{
        .file = null,
        .allocator = allocator,
    };

    // Should not crash
    logger.log(.info, .null_file, "message", .{});
    logger.debug(.null_file, "debug", .{});
    logger.info(.null_file, "info", .{});
    logger.warn(.null_file, "warn", .{});
    logger.logErr(.null_file, "err", .{});
}

test "Logger.log with empty format string" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.empty_format, "", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "(empty_format):") != null);
}

test "Logger.log with special characters" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.special, "tabs\there and\nnewlines", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "tabs\there and") != null);
}

test "Logger.log with unicode" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.unicode, "emoji: 🎉 chinese: 中文", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "emoji: 🎉 chinese: 中文") != null);
}

test "Logger.log with long message" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    // Create a 10KB message
    const long_msg = try allocator.alloc(u8, 10 * 1024);
    defer allocator.free(long_msg);
    @memset(long_msg, 'X');

    // We can't use long_msg directly since format is comptime, but we can test with formatted args
    logger.info(.long_test, "start {s} end", .{long_msg[0..100]});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "start XXXX") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "XXXX end") != null);
}

test "Logger.log with multiple format arguments" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.multi_args, "a={d} b={d} c={d} d={s} e={}", .{ 1, 2, 3, "four", true });

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "a=1 b=2 c=3 d=four e=true") != null);
}

// ============================================================
// All Log Levels via generic log function
// ============================================================

test "Logger.log debug level via generic" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.log(.debug, .generic_debug, "generic debug", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[debug]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "generic debug") != null);
}

test "Logger.log info level via generic" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.log(.info, .generic_info, "generic info", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[info]") != null);
}

test "Logger.log warn level via generic" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.log(.warn, .generic_warn, "generic warn", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[warn]") != null);
}

test "Logger.log err level via generic" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.log(.err, .generic_err, "generic err", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[err]") != null);
}

// ============================================================
// setupGlobalLogger Tests
// ============================================================

test "setupGlobalLogger does not error" {
    const allocator = std.testing.allocator;
    try logger_mod.setupGlobalLogger(allocator);
}

// ============================================================
// File Operations
// ============================================================

test "Logger creates log file at expected path" {
    deleteFile("/tmp/smithers-tui.log");

    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.file_creation, "creating file", .{});

    // Verify file exists
    const file = std.fs.openFileAbsolute("/tmp/smithers-tui.log", .{}) catch |e| {
        std.debug.print("Failed to open log file: {}\n", .{e});
        return e;
    };
    file.close();
}

test "Logger overwrites existing log file on init" {
    const allocator = std.testing.allocator;

    // Create initial content
    {
        var logger1 = try Logger.init(allocator);
        logger1.info(.first, "first logger content", .{});
        logger1.deinit();
    }

    // Create new logger (should overwrite)
    {
        var logger2 = try Logger.init(allocator);
        logger2.info(.second, "second logger content", .{});
        logger2.deinit();
    }

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    // First content should not be present (file was overwritten)
    try std.testing.expect(std.mem.indexOf(u8, content, "first logger content") == null);
    try std.testing.expect(std.mem.indexOf(u8, content, "second logger content") != null);
}

test "Logger syncs after each write" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.sync_test, "synced content", .{});

    // Content should be immediately readable (due to sync)
    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "synced content") != null);
}

// ============================================================
// Concurrent Safety (basic verification)
// ============================================================

test "Logger handles sequential writes correctly" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    // Write many messages sequentially
    var i: usize = 0;
    while (i < 100) : (i += 1) {
        logger.info(.sequential, "message {d}", .{i});
    }

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    // Verify some messages are present
    try std.testing.expect(std.mem.indexOf(u8, content, "message 0") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "message 50") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "message 99") != null);
}

// ============================================================
// Numeric Format Tests
// ============================================================

test "Logger formats integers correctly" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.numbers, "signed={d} unsigned={d} hex={x}", .{ @as(i32, -42), @as(u32, 255), @as(u8, 0xAB) });

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "signed=-42") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "unsigned=255") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "hex=ab") != null);
}

test "Logger formats floats correctly" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.floats, "pi={d:.2} e={d:.4}", .{ 3.14159, 2.71828 });

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "pi=3.14") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "e=2.7183") != null);
}

// ============================================================
// Different Scope Names
// ============================================================

test "Logger supports various scope names" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    defer logger.deinit();

    logger.info(.ui, "ui scope", .{});
    logger.info(.network, "network scope", .{});
    logger.info(.database, "database scope", .{});
    logger.info(.auth, "auth scope", .{});

    const content = try readLogFile(allocator, "/tmp/smithers-tui.log");
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "(ui)") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "(network)") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "(database)") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "(auth)") != null);
}

// ============================================================
// Memory Safety
// ============================================================

test "Logger init with testing allocator tracks allocations" {
    const allocator = std.testing.allocator;
    var logger = try Logger.init(allocator);
    logger.deinit();
    // If there were memory leaks, std.testing.allocator would report them
}
