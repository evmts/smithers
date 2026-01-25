const std = @import("std");
const db = @import("../db.zig");
const obs = @import("../obs.zig");

pub const CompactionSettings = struct {
    enabled: bool = true,
    reserve_tokens: u64 = 16384,
    keep_recent_tokens: u64 = 20000,
    model_context_limit: u64 = 200000, // Claude default
};

pub const DEFAULT_SETTINGS = CompactionSettings{};

pub const CompactionDetails = struct {
    read_files: []const []const u8,
    modified_files: []const []const u8,

    pub fn toJson(self: CompactionDetails, allocator: std.mem.Allocator) ![]const u8 {
        var buf = std.ArrayListUnmanaged(u8){};
        errdefer buf.deinit(allocator);

        try buf.appendSlice(allocator, "{\"readFiles\":[");
        for (self.read_files, 0..) |f, i| {
            if (i > 0) try buf.append(allocator, ',');
            const escaped = try std.json.Stringify.valueAlloc(allocator, f, .{});
            defer allocator.free(escaped);
            try buf.appendSlice(allocator, escaped);
        }
        try buf.appendSlice(allocator, "],\"modifiedFiles\":[");
        for (self.modified_files, 0..) |f, i| {
            if (i > 0) try buf.append(allocator, ',');
            const escaped = try std.json.Stringify.valueAlloc(allocator, f, .{});
            defer allocator.free(escaped);
            try buf.appendSlice(allocator, escaped);
        }
        try buf.appendSlice(allocator, "]}");
        return buf.toOwnedSlice(allocator);
    }
};

/// Estimate token count using chars/4 heuristic (conservative overestimate)
pub fn estimateTokens(content: []const u8) u64 {
    return (content.len + 3) / 4;
}

/// Estimate total context tokens from messages
pub fn estimateContextTokens(messages: []const db.Message) u64 {
    var total: u64 = 0;
    for (messages) |msg| {
        total += estimateTokens(msg.content);
        if (msg.tool_name) |tn| total += estimateTokens(tn);
        if (msg.tool_input) |ti| total += estimateTokens(ti);
    }
    return total;
}

/// Check if compaction should trigger based on context usage
pub fn shouldCompact(context_tokens: u64, settings: CompactionSettings) bool {
    if (!settings.enabled) return false;
    return context_tokens > settings.model_context_limit - settings.reserve_tokens;
}

/// Result of finding a cut point for compaction
pub const CutPointResult = struct {
    first_kept_idx: usize,
    first_kept_msg_id: i64,
    tokens_to_summarize: u64,
    tokens_before: u64,
};

/// Find the cut point that preserves approximately keep_recent_tokens
/// Returns index of first message to keep
pub fn findCutPoint(messages: []const db.Message, settings: CompactionSettings) ?CutPointResult {
    if (messages.len == 0) return null;

    const total_tokens = estimateContextTokens(messages);
    if (total_tokens <= settings.keep_recent_tokens) return null;

    var running_tokens: u64 = 0;
    var cut_idx: usize = messages.len;

    // Walk backwards from end, accumulating tokens until we hit keep_recent_tokens
    var i: usize = messages.len;
    while (i > 0) {
        i -= 1;
        const msg = messages[i];
        var msg_tokens: u64 = estimateTokens(msg.content);
        if (msg.tool_name) |tn| msg_tokens += estimateTokens(tn);
        if (msg.tool_input) |ti| msg_tokens += estimateTokens(ti);

        if (running_tokens + msg_tokens > settings.keep_recent_tokens) {
            cut_idx = i + 1;
            break;
        }
        running_tokens += msg_tokens;
    }

    // Ensure we don't cut at the very start (need at least one message to summarize)
    if (cut_idx == 0 or cut_idx >= messages.len) return null;

    // Try to align to turn boundary (user message)
    // Walk forward to find next user message
    var aligned_idx = cut_idx;
    while (aligned_idx < messages.len and messages[aligned_idx].role != .user) {
        aligned_idx += 1;
    }
    if (aligned_idx < messages.len) {
        cut_idx = aligned_idx;
    }

    // Calculate tokens to summarize
    var tokens_to_summarize: u64 = 0;
    for (messages[0..cut_idx]) |msg| {
        tokens_to_summarize += estimateTokens(msg.content);
        if (msg.tool_name) |tn| tokens_to_summarize += estimateTokens(tn);
        if (msg.tool_input) |ti| tokens_to_summarize += estimateTokens(ti);
    }

    return .{
        .first_kept_idx = cut_idx,
        .first_kept_msg_id = messages[cut_idx].id,
        .tokens_to_summarize = tokens_to_summarize,
        .tokens_before = total_tokens,
    };
}

/// Extract file operations from messages for tracking
pub const FileOperations = struct {
    read: std.StringHashMap(void),
    written: std.StringHashMap(void),
    edited: std.StringHashMap(void),

    pub fn init(allocator: std.mem.Allocator) FileOperations {
        return .{
            .read = std.StringHashMap(void).init(allocator),
            .written = std.StringHashMap(void).init(allocator),
            .edited = std.StringHashMap(void).init(allocator),
        };
    }

    pub fn deinit(self: *FileOperations) void {
        self.read.deinit();
        self.written.deinit();
        self.edited.deinit();
    }

    pub fn addRead(self: *FileOperations, path: []const u8) !void {
        try self.read.put(path, {});
    }

    pub fn addWritten(self: *FileOperations, path: []const u8) !void {
        try self.written.put(path, {});
    }

    pub fn addEdited(self: *FileOperations, path: []const u8) !void {
        try self.edited.put(path, {});
    }
};

/// Extract file operations from tool calls in messages
pub fn extractFileOperations(allocator: std.mem.Allocator, messages: []const db.Message) !FileOperations {
    var ops = FileOperations.init(allocator);
    errdefer ops.deinit();

    for (messages) |msg| {
        if (msg.tool_name == null or msg.tool_input == null) continue;

        const tool_name = msg.tool_name.?;
        const input_json = msg.tool_input.?;

        // Parse input JSON to extract path
        const parsed = std.json.parseFromSlice(std.json.Value, allocator, input_json, .{}) catch continue;
        defer parsed.deinit();

        const path_val = parsed.value.object.get("path") orelse continue;
        if (path_val != .string) continue;
        const path = path_val.string;

        if (std.mem.eql(u8, tool_name, "read_file")) {
            try ops.addRead(path);
        } else if (std.mem.eql(u8, tool_name, "write_file")) {
            try ops.addWritten(path);
        } else if (std.mem.eql(u8, tool_name, "edit_file")) {
            try ops.addEdited(path);
        }
    }

    return ops;
}

/// Serialize conversation for summarization prompt
pub fn serializeConversation(allocator: std.mem.Allocator, messages: []const db.Message) ![]const u8 {
    var buf = std.ArrayListUnmanaged(u8){};
    errdefer buf.deinit(allocator);

    for (messages) |msg| {
        const role_str = switch (msg.role) {
            .user => "[User]",
            .assistant => "[Assistant]",
            .system => "[System]",
        };
        try buf.appendSlice(allocator, role_str);
        try buf.appendSlice(allocator, ": ");
        try buf.appendSlice(allocator, msg.content);
        try buf.appendSlice(allocator, "\n\n");

        if (msg.tool_name) |tn| {
            try buf.appendSlice(allocator, "[Tool call]: ");
            try buf.appendSlice(allocator, tn);
            if (msg.tool_input) |ti| {
                try buf.append(allocator, '(');
                // Truncate long tool inputs
                const max_input_len: usize = 500;
                if (ti.len > max_input_len) {
                    try buf.appendSlice(allocator, ti[0..max_input_len]);
                    try buf.appendSlice(allocator, "...");
                } else {
                    try buf.appendSlice(allocator, ti);
                }
                try buf.append(allocator, ')');
            }
            try buf.appendSlice(allocator, "\n\n");
        }
    }

    return buf.toOwnedSlice(allocator);
}

pub const SUMMARIZATION_SYSTEM_PROMPT =
    \\You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.
    \\
    \\Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.
;

pub const SUMMARIZATION_USER_PROMPT_TEMPLATE =
    \\<conversation>
    \\{s}
    \\</conversation>
    \\
    \\Please summarize the above conversation using this exact format:
    \\
    \\## Original Request
    \\[What the user originally asked for]
    \\
    \\## Key Decisions
    \\- [Important decisions made during the conversation]
    \\
    \\## Work Completed
    \\- [Specific tasks that were accomplished]
    \\
    \\## Current State
    \\- [Where things stand now / any pending items]
    \\
    \\Be concise. Focus on information needed to continue the work.
;

/// Build the summarization prompt for the LLM
pub fn buildSummarizationPrompt(
    allocator: std.mem.Allocator,
    messages: []const db.Message,
    previous_summary: ?[]const u8,
) ![]const u8 {
    const conversation = try serializeConversation(allocator, messages);
    defer allocator.free(conversation);

    var buf = std.ArrayListUnmanaged(u8){};
    errdefer buf.deinit(allocator);

    if (previous_summary) |prev| {
        try buf.appendSlice(allocator, "## Previous Summary\n");
        try buf.appendSlice(allocator, prev);
        try buf.appendSlice(allocator, "\n\n---\n\n");
    }

    try buf.appendSlice(allocator, "<conversation>\n");
    try buf.appendSlice(allocator, conversation);
    try buf.appendSlice(allocator, "</conversation>\n\n");

    if (previous_summary != null) {
        try buf.appendSlice(allocator,
            \\Please UPDATE the previous summary with the new conversation content using this exact format:
            \\
        );
    } else {
        try buf.appendSlice(allocator,
            \\Please summarize the above conversation using this exact format:
            \\
        );
    }

    try buf.appendSlice(allocator,
        \\
        \\## Original Request
        \\[What the user originally asked for]
        \\
        \\## Key Decisions
        \\- [Important decisions made during the conversation]
        \\
        \\## Work Completed
        \\- [Specific tasks that were accomplished]
        \\
        \\## Current State
        \\- [Where things stand now / any pending items]
        \\
        \\Be concise. Focus on information needed to continue the work.
    );

    return buf.toOwnedSlice(allocator);
}

/// Format file operations for appending to summary
pub fn formatFileOperations(allocator: std.mem.Allocator, ops: *const FileOperations) ![]const u8 {
    var buf = std.ArrayListUnmanaged(u8){};
    errdefer buf.deinit(allocator);

    // Compute read-only files (read but not modified)
    var read_only = std.ArrayListUnmanaged([]const u8){};
    defer read_only.deinit(allocator);

    var iter = ops.read.keyIterator();
    while (iter.next()) |key| {
        if (!ops.written.contains(key.*) and !ops.edited.contains(key.*)) {
            try read_only.append(allocator, key.*);
        }
    }

    // Collect modified files
    var modified = std.ArrayListUnmanaged([]const u8){};
    defer modified.deinit(allocator);

    var written_iter = ops.written.keyIterator();
    while (written_iter.next()) |key| {
        try modified.append(allocator, key.*);
    }
    var edited_iter = ops.edited.keyIterator();
    while (edited_iter.next()) |key| {
        if (!ops.written.contains(key.*)) {
            try modified.append(allocator, key.*);
        }
    }

    if (read_only.items.len > 0) {
        try buf.appendSlice(allocator, "\n\n<read-files>\n");
        for (read_only.items) |path| {
            try buf.appendSlice(allocator, path);
            try buf.append(allocator, '\n');
        }
        try buf.appendSlice(allocator, "</read-files>");
    }

    if (modified.items.len > 0) {
        try buf.appendSlice(allocator, "\n\n<modified-files>\n");
        for (modified.items) |path| {
            try buf.appendSlice(allocator, path);
            try buf.append(allocator, '\n');
        }
        try buf.appendSlice(allocator, "</modified-files>");
    }

    return buf.toOwnedSlice(allocator);
}

/// Compaction preparation result
pub const CompactionPreparation = struct {
    first_kept_msg_id: i64,
    messages_to_summarize: []const db.Message,
    tokens_before: u64,
    previous_summary: ?[]const u8,
    settings: CompactionSettings,

    pub fn deinit(self: *CompactionPreparation, allocator: std.mem.Allocator) void {
        _ = self;
        _ = allocator;
    }
};

/// Prepare compaction - analyze messages and determine what to summarize
pub fn prepareCompaction(
    allocator: std.mem.Allocator,
    messages: []const db.Message,
    previous_summary: ?[]const u8,
    settings: CompactionSettings,
) !?CompactionPreparation {
    _ = allocator;
    if (messages.len == 0) return null;

    const cut_point = findCutPoint(messages, settings) orelse return null;

    return CompactionPreparation{
        .first_kept_msg_id = cut_point.first_kept_msg_id,
        .messages_to_summarize = messages[0..cut_point.first_kept_idx],
        .tokens_before = cut_point.tokens_before,
        .previous_summary = previous_summary,
        .settings = settings,
    };
}

test "estimateTokens basic" {
    try std.testing.expectEqual(@as(u64, 1), estimateTokens("abc"));
    try std.testing.expectEqual(@as(u64, 1), estimateTokens("abcd"));
    try std.testing.expectEqual(@as(u64, 2), estimateTokens("abcde"));
    try std.testing.expectEqual(@as(u64, 0), estimateTokens(""));
}

test "estimateTokens longer strings" {
    const content = "a" ** 100;
    try std.testing.expectEqual(@as(u64, 25), estimateTokens(content));
}

test "estimateContextTokens sums messages" {
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "hello", .timestamp = 0 },
        .{ .id = 2, .role = .assistant, .content = "world", .timestamp = 0 },
    };
    const tokens = estimateContextTokens(&messages);
    try std.testing.expectEqual(@as(u64, 4), tokens); // 5/4 + 5/4 rounded
}

test "shouldCompact returns false when under limit" {
    const settings = CompactionSettings{
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(!shouldCompact(50000, settings));
}

test "shouldCompact returns true when over limit" {
    const settings = CompactionSettings{
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(shouldCompact(90000, settings));
}

test "shouldCompact respects enabled flag" {
    const settings = CompactionSettings{
        .enabled = false,
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(!shouldCompact(90000, settings));
}

test "findCutPoint returns null for empty messages" {
    const messages = [_]db.Message{};
    const settings = DEFAULT_SETTINGS;
    try std.testing.expect(findCutPoint(&messages, settings) == null);
}

test "findCutPoint returns null when under keep_recent_tokens" {
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "short", .timestamp = 0 },
    };
    const settings = CompactionSettings{
        .keep_recent_tokens = 10000,
    };
    try std.testing.expect(findCutPoint(&messages, settings) == null);
}

test "findCutPoint finds cut point when over limit" {
    // Create messages with enough content to exceed keep_recent_tokens
    const long_content = "x" ** 4000; // ~1000 tokens each
    var messages: [10]db.Message = undefined;
    for (&messages, 0..) |*msg, i| {
        msg.* = .{
            .id = @intCast(i + 1),
            .role = if (i % 2 == 0) .user else .assistant,
            .content = long_content,
            .timestamp = @intCast(i),
        };
    }

    const settings = CompactionSettings{
        .keep_recent_tokens = 2000, // Keep ~2 messages worth
    };

    const result = findCutPoint(&messages, settings);
    try std.testing.expect(result != null);
    try std.testing.expect(result.?.first_kept_idx > 0);
    try std.testing.expect(result.?.first_kept_idx < messages.len);
}

test "serializeConversation formats correctly" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "Hello", .timestamp = 0 },
        .{ .id = 2, .role = .assistant, .content = "Hi there!", .timestamp = 0 },
    };

    const result = try serializeConversation(allocator, &messages);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "[User]: Hello") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "[Assistant]: Hi there!") != null);
}
