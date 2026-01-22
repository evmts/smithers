// God-Agent Configuration Management
// Phase 9: Config file loading and management

const std = @import("std");

pub const ConfigError = error{
    FileNotFound,
    ParseError,
    InvalidValue,
};

/// Global configuration structure
pub const GlobalConfig = struct {
    // Model settings
    model: []const u8 = "claude-sonnet-4",
    thinking_level: ThinkingLevel = .medium,
    max_turns: u32 = 100,

    // Tool settings
    enabled_tools: ?[]const []const u8 = null,
    disabled_tools: ?[]const []const u8 = null,

    // UI settings
    color: bool = true,

    // Session settings
    session_dir: ?[]const u8 = null,

    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) GlobalConfig {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *GlobalConfig) void {
        _ = self;
        // Free any allocated strings if needed
    }
};

pub const ThinkingLevel = enum {
    off,
    low,
    medium,
    high,

    pub fn fromString(s: []const u8) ?ThinkingLevel {
        if (std.mem.eql(u8, s, "off")) return .off;
        if (std.mem.eql(u8, s, "low")) return .low;
        if (std.mem.eql(u8, s, "medium")) return .medium;
        if (std.mem.eql(u8, s, "high")) return .high;
        return null;
    }

    pub fn toString(self: ThinkingLevel) []const u8 {
        return switch (self) {
            .off => "off",
            .low => "low",
            .medium => "medium",
            .high => "high",
        };
    }
};

/// Configuration file paths (in order of precedence)
pub const ConfigPaths = struct {
    /// User config: ~/.config/god-agent/config.json
    user: []const u8,
    /// Project config: .god-agent/config.json
    project: []const u8,

    pub fn getDefault(allocator: std.mem.Allocator) !ConfigPaths {
        const home = std.posix.getenv("HOME") orelse "/tmp";
        const user_path = try std.fmt.allocPrint(allocator, "{s}/.config/god-agent/config.json", .{home});

        return .{
            .user = user_path,
            .project = ".god-agent/config.json",
        };
    }
};

/// Load configuration from file
pub fn loadFromFile(allocator: std.mem.Allocator, path: []const u8) !GlobalConfig {
    const file = std.fs.cwd().openFile(path, .{}) catch |err| switch (err) {
        error.FileNotFound => return GlobalConfig.init(allocator),
        else => return err,
    };
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(content);

    return parseConfig(allocator, content);
}

/// Parse configuration from JSON string
pub fn parseConfig(allocator: std.mem.Allocator, content: []const u8) !GlobalConfig {
    var config = GlobalConfig.init(allocator);

    // Simple JSON parsing for key config values
    if (extractJsonStringComptime(content, "model")) |model| {
        config.model = model;
    }

    if (extractJsonStringComptime(content, "thinking_level")) |level| {
        if (ThinkingLevel.fromString(level)) |tl| {
            config.thinking_level = tl;
        }
    }

    if (extractJsonNumberComptime(content, "max_turns")) |turns| {
        config.max_turns = @intCast(turns);
    }

    if (extractJsonBoolComptime(content, "color")) |color| {
        config.color = color;
    }

    return config;
}

/// Extract a string value from JSON with comptime key
fn extractJsonStringComptime(content: []const u8, comptime key: []const u8) ?[]const u8 {
    const pattern = "\"" ++ key ++ "\"";
    const key_pos = std.mem.indexOf(u8, content, pattern) orelse return null;

    // Find the colon after the key
    const after_key = content[key_pos + pattern.len ..];
    const colon_pos = std.mem.indexOf(u8, after_key, ":") orelse return null;

    // Find the opening quote
    const after_colon = after_key[colon_pos + 1 ..];
    const quote_start = std.mem.indexOf(u8, after_colon, "\"") orelse return null;

    // Find the closing quote
    const value_start = after_colon[quote_start + 1 ..];
    const quote_end = std.mem.indexOf(u8, value_start, "\"") orelse return null;

    return value_start[0..quote_end];
}

/// Extract a number value from JSON with comptime key
fn extractJsonNumberComptime(content: []const u8, comptime key: []const u8) ?i64 {
    const pattern = "\"" ++ key ++ "\"";
    const key_pos = std.mem.indexOf(u8, content, pattern) orelse return null;

    const after_key = content[key_pos + pattern.len ..];
    const colon_pos = std.mem.indexOf(u8, after_key, ":") orelse return null;

    const after_colon = std.mem.trim(u8, after_key[colon_pos + 1 ..], " \t\n");

    // Find the end of the number
    var end: usize = 0;
    for (after_colon) |c| {
        if (c >= '0' and c <= '9') {
            end += 1;
        } else {
            break;
        }
    }

    if (end == 0) return null;
    return std.fmt.parseInt(i64, after_colon[0..end], 10) catch null;
}

/// Extract a boolean value from JSON with comptime key
fn extractJsonBoolComptime(content: []const u8, comptime key: []const u8) ?bool {
    const pattern = "\"" ++ key ++ "\"";
    const key_pos = std.mem.indexOf(u8, content, pattern) orelse return null;

    const after_key = content[key_pos + pattern.len ..];
    const colon_pos = std.mem.indexOf(u8, after_key, ":") orelse return null;

    const after_colon = std.mem.trim(u8, after_key[colon_pos + 1 ..], " \t\n");

    if (std.mem.startsWith(u8, after_colon, "true")) return true;
    if (std.mem.startsWith(u8, after_colon, "false")) return false;
    return null;
}

/// Save configuration to file
pub fn saveToFile(config: GlobalConfig, path: []const u8) !void {
    const dir_path = std.fs.path.dirname(path) orelse ".";
    std.fs.cwd().makePath(dir_path) catch {};

    const file = try std.fs.cwd().createFile(path, .{});
    defer file.close();

    var buf: [4096]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    const writer = fbs.writer();
    try writer.writeAll("{\n");
    try writer.print("  \"model\": \"{s}\",\n", .{config.model});
    try writer.print("  \"thinking_level\": \"{s}\",\n", .{config.thinking_level.toString()});
    try writer.print("  \"max_turns\": {d},\n", .{config.max_turns});
    try writer.print("  \"color\": {}\n", .{config.color});
    try writer.writeAll("}\n");

    _ = std.posix.write(file.handle, fbs.getWritten()) catch {};
}

// Tests
test "GlobalConfig defaults" {
    var config = GlobalConfig.init(std.testing.allocator);
    defer config.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4", config.model);
    try std.testing.expectEqual(ThinkingLevel.medium, config.thinking_level);
    try std.testing.expectEqual(@as(u32, 100), config.max_turns);
    try std.testing.expect(config.color);
}

test "ThinkingLevel fromString" {
    try std.testing.expectEqual(ThinkingLevel.off, ThinkingLevel.fromString("off"));
    try std.testing.expectEqual(ThinkingLevel.low, ThinkingLevel.fromString("low"));
    try std.testing.expectEqual(ThinkingLevel.medium, ThinkingLevel.fromString("medium"));
    try std.testing.expectEqual(ThinkingLevel.high, ThinkingLevel.fromString("high"));
    try std.testing.expectEqual(@as(?ThinkingLevel, null), ThinkingLevel.fromString("invalid"));
}

test "ThinkingLevel toString" {
    try std.testing.expectEqualStrings("off", ThinkingLevel.off.toString());
    try std.testing.expectEqualStrings("low", ThinkingLevel.low.toString());
    try std.testing.expectEqualStrings("medium", ThinkingLevel.medium.toString());
    try std.testing.expectEqualStrings("high", ThinkingLevel.high.toString());
}

test "parseConfig with model" {
    const json =
        \\{
        \\  "model": "claude-opus-4",
        \\  "max_turns": 50
        \\}
    ;
    const config = try parseConfig(std.testing.allocator, json);
    try std.testing.expectEqualStrings("claude-opus-4", config.model);
    try std.testing.expectEqual(@as(u32, 50), config.max_turns);
}

test "extractJsonStringComptime" {
    const json = "{\"model\": \"test-model\"}";
    const result = extractJsonStringComptime(json, "model");
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("test-model", result.?);
}

test "extractJsonNumberComptime" {
    const json = "{\"count\": 42}";
    const result = extractJsonNumberComptime(json, "count");
    try std.testing.expect(result != null);
    try std.testing.expectEqual(@as(i64, 42), result.?);
}

test "extractJsonBoolComptime" {
    const json_true = "{\"enabled\": true}";
    const json_false = "{\"enabled\": false}";

    try std.testing.expectEqual(@as(?bool, true), extractJsonBoolComptime(json_true, "enabled"));
    try std.testing.expectEqual(@as(?bool, false), extractJsonBoolComptime(json_false, "enabled"));
}
