// Session Management per God-TUI spec §12
// NDJSON persistence with tree structure, compaction, crash recovery

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// ============ Entry Types ============

pub const EntryType = enum {
    session,
    message,
    compaction,
    branch_summary,
    custom,
    label,
    session_info,
    thinking_level_change,
    model_change,
};

pub const Role = enum {
    user,
    assistant,
    tool_result,
    bash_execution,
    custom,

    pub fn toString(self: Role) []const u8 {
        return switch (self) {
            .user => "user",
            .assistant => "assistant",
            .tool_result => "toolResult",
            .bash_execution => "bashExecution",
            .custom => "custom",
        };
    }

    pub fn fromString(s: []const u8) ?Role {
        if (std.mem.eql(u8, s, "user")) return .user;
        if (std.mem.eql(u8, s, "assistant")) return .assistant;
        if (std.mem.eql(u8, s, "toolResult")) return .tool_result;
        if (std.mem.eql(u8, s, "bashExecution")) return .bash_execution;
        if (std.mem.eql(u8, s, "custom")) return .custom;
        return null;
    }
};

// ============ Entry Structures ============

pub const SessionHeader = struct {
    version: u8 = 3,
    id: []const u8,
    timestamp: []const u8,
    cwd: []const u8,
    parent_session: ?[]const u8 = null,
    leaf_id: ?[]const u8 = null, // Spec: tracks current position in tree

    pub fn deinit(self: *SessionHeader, allocator: Allocator) void {
        allocator.free(self.id);
        allocator.free(self.timestamp);
        allocator.free(self.cwd);
        if (self.parent_session) |p| allocator.free(p);
        if (self.leaf_id) |l| allocator.free(l);
    }
};

pub const MessageEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    role: Role,
    content: []const u8,

    pub fn deinit(self: *MessageEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        allocator.free(self.content);
    }
};

pub const CompactionEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    summary: []const u8,
    first_kept_entry_id: []const u8,
    tokens_before: u32,

    pub fn deinit(self: *CompactionEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        allocator.free(self.summary);
        allocator.free(self.first_kept_entry_id);
    }
};

pub const BranchSummaryEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    from_id: []const u8,
    summary: []const u8,

    pub fn deinit(self: *BranchSummaryEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        allocator.free(self.from_id);
        allocator.free(self.summary);
    }
};

pub const CustomEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    custom_type: []const u8,
    data: ?[]const u8,

    pub fn deinit(self: *CustomEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        allocator.free(self.custom_type);
        if (self.data) |d| allocator.free(d);
    }
};

pub const LabelEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    target_id: []const u8,
    label: ?[]const u8,

    pub fn deinit(self: *LabelEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        allocator.free(self.target_id);
        if (self.label) |l| allocator.free(l);
    }
};

pub const SessionInfoEntry = struct {
    id: []const u8,
    parent_id: ?[]const u8,
    timestamp: []const u8,
    name: ?[]const u8,

    pub fn deinit(self: *SessionInfoEntry, allocator: Allocator) void {
        allocator.free(self.id);
        if (self.parent_id) |p| allocator.free(p);
        allocator.free(self.timestamp);
        if (self.name) |n| allocator.free(n);
    }
};

pub const Entry = union(EntryType) {
    session: SessionHeader,
    message: MessageEntry,
    compaction: CompactionEntry,
    branch_summary: BranchSummaryEntry,
    custom: CustomEntry,
    label: LabelEntry,
    session_info: SessionInfoEntry,
    thinking_level_change: void,
    model_change: void,

    pub fn getId(self: *const Entry) ?[]const u8 {
        return switch (self.*) {
            .session => null,
            .message => |m| m.id,
            .compaction => |c| c.id,
            .branch_summary => |b| b.id,
            .custom => |c| c.id,
            .label => |l| l.id,
            .session_info => |s| s.id,
            else => null,
        };
    }

    pub fn getParentId(self: *const Entry) ?[]const u8 {
        return switch (self.*) {
            .session => null,
            .message => |m| m.parent_id,
            .compaction => |c| c.parent_id,
            .branch_summary => |b| b.parent_id,
            .custom => |c| c.parent_id,
            .label => |l| l.parent_id,
            .session_info => |s| s.parent_id,
            else => null,
        };
    }

    pub fn deinit(self: *Entry, allocator: Allocator) void {
        switch (self.*) {
            .session => |*h| h.deinit(allocator),
            .message => |*m| m.deinit(allocator),
            .compaction => |*c| c.deinit(allocator),
            .branch_summary => |*b| b.deinit(allocator),
            .custom => |*c| c.deinit(allocator),
            .label => |*l| l.deinit(allocator),
            .session_info => |*s| s.deinit(allocator),
            else => {},
        }
    }
};

// ============ Session ============

pub const Session = struct {
    header: SessionHeader,
    entries: ArrayListUnmanaged(Entry),
    index: std.StringHashMapUnmanaged(*Entry),
    leaf_id: ?[]const u8 = null,
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator, header: SessionHeader) Self {
        return .{
            .header = header,
            .entries = .{},
            .index = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.header.deinit(self.allocator);
        for (self.entries.items) |*entry| {
            entry.deinit(self.allocator);
        }
        self.entries.deinit(self.allocator);
        self.index.deinit(self.allocator);
        if (self.leaf_id) |l| self.allocator.free(l);
    }

    pub fn addEntry(self: *Self, entry: Entry) !void {
        try self.entries.append(self.allocator, entry);
        const ptr = &self.entries.items[self.entries.items.len - 1];

        if (ptr.getId()) |id| {
            try self.index.put(self.allocator, id, ptr);
        }

        // Update leaf
        if (self.leaf_id) |l| self.allocator.free(l);
        if (ptr.getId()) |id| {
            self.leaf_id = try self.allocator.dupe(u8, id);
        } else {
            self.leaf_id = null;
        }
    }

    pub fn getEntry(self: *const Self, id: []const u8) ?*Entry {
        return self.index.get(id);
    }

    /// Get linear branch from root to leaf
    pub fn getBranch(self: *const Self) ![]Entry {
        if (self.leaf_id == null) return &[_]Entry{};

        var path = ArrayListUnmanaged(*Entry){};
        defer path.deinit(self.allocator);

        var current_id: ?[]const u8 = self.leaf_id;
        while (current_id) |id| {
            if (self.index.get(id)) |entry| {
                try path.append(self.allocator, entry);
                current_id = entry.getParentId();
            } else {
                break;
            }
        }

        // Reverse to get root->leaf order
        var result = try self.allocator.alloc(Entry, path.items.len);
        for (path.items, 0..) |entry, i| {
            result[path.items.len - 1 - i] = entry.*;
        }

        return result;
    }

    /// Find path between two entries
    pub fn findPath(self: *const Self, from_id: []const u8, to_id: []const u8) !?[][]const u8 {
        // Build ancestor set for 'to'
        var to_ancestors = std.StringHashMapUnmanaged(void){};
        defer to_ancestors.deinit(self.allocator);

        var current: ?[]const u8 = to_id;
        while (current) |id| {
            try to_ancestors.put(self.allocator, id, {});
            if (self.index.get(id)) |entry| {
                current = entry.getParentId();
            } else {
                break;
            }
        }

        // Find common ancestor from 'from'
        current = from_id;
        while (current) |id| {
            if (to_ancestors.contains(id)) {
                // Found common ancestor
                // Build path: from -> ancestor -> to
                var path = ArrayListUnmanaged([]const u8){};
                defer path.deinit(self.allocator);

                // Path from 'from' to ancestor (reversed)
                var temp = ArrayListUnmanaged([]const u8){};
                defer temp.deinit(self.allocator);

                var c: ?[]const u8 = from_id;
                while (c) |cid| {
                    try temp.append(self.allocator, cid);
                    if (std.mem.eql(u8, cid, id)) break;
                    if (self.index.get(cid)) |entry| {
                        c = entry.getParentId();
                    } else {
                        break;
                    }
                }

                // Reverse into path
                var i = temp.items.len;
                while (i > 0) {
                    i -= 1;
                    try path.append(self.allocator, temp.items[i]);
                }

                // Path from ancestor to 'to'
                temp.clearRetainingCapacity();
                c = to_id;
                while (c) |cid| {
                    if (std.mem.eql(u8, cid, id)) break;
                    try temp.append(self.allocator, cid);
                    if (self.index.get(cid)) |entry| {
                        c = entry.getParentId();
                    } else {
                        break;
                    }
                }

                // Reverse and append
                i = temp.items.len;
                while (i > 0) {
                    i -= 1;
                    try path.append(self.allocator, temp.items[i]);
                }

                return try path.toOwnedSlice(self.allocator);
            }

            if (self.index.get(id)) |entry| {
                current = entry.getParentId();
            } else {
                break;
            }
        }

        return null;
    }
};

// ============ Session Manager ============

pub const SessionManager = struct {
    allocator: Allocator,
    session_dir: []const u8,

    const Self = @This();

    pub fn init(allocator: Allocator, session_dir: []const u8) Self {
        return .{
            .allocator = allocator,
            .session_dir = session_dir,
        };
    }

    pub fn deinit(self: *Self) void {
        _ = self;
    }

    /// Generate unique 8-char hex ID
    pub fn generateId(self: *Self, existing: *const std.StringHashMapUnmanaged(*Entry)) ![]u8 {
        var prng = std.Random.DefaultPrng.init(@intCast(std.time.timestamp()));
        const random = prng.random();

        var attempts: usize = 0;
        while (attempts < 100) : (attempts += 1) {
            var id: [8]u8 = undefined;
            for (&id) |*c| {
                const v = random.int(u8) & 0x0F;
                c.* = if (v < 10) '0' + v else 'a' + (v - 10);
            }

            if (!existing.contains(&id)) {
                return try self.allocator.dupe(u8, &id);
            }
        }

        return error.IdGenerationFailed;
    }

    /// Create new session
    pub fn create(self: *Self, cwd: []const u8) !Session {
        var prng = std.Random.DefaultPrng.init(@intCast(std.time.timestamp()));
        const random = prng.random();

        var uuid: [36]u8 = undefined;
        var buf_idx: usize = 0;
        var i: usize = 0;
        while (i < 32) : (i += 1) {
            if (i == 8 or i == 12 or i == 16 or i == 20) {
                uuid[buf_idx] = '-';
                buf_idx += 1;
            }
            const v = random.int(u8) & 0x0F;
            uuid[buf_idx] = if (v < 10) '0' + v else 'a' + (v - 10);
            buf_idx += 1;
        }

        const timestamp = try self.getTimestamp();

        const header = SessionHeader{
            .id = try self.allocator.dupe(u8, &uuid),
            .timestamp = timestamp,
            .cwd = try self.allocator.dupe(u8, cwd),
        };

        return Session.init(self.allocator, header);
    }

    /// Load session from file
    pub fn load(self: *Self, path: []const u8) !Session {
        const file = try std.fs.cwd().openFile(path, .{});
        defer file.close();

        const content = try file.readToEndAlloc(self.allocator, 1024 * 1024 * 100);
        defer self.allocator.free(content);

        var lines = std.mem.splitScalar(u8, content, '\n');
        var header: ?SessionHeader = null;
        var entries = ArrayListUnmanaged(Entry){};
        var index = std.StringHashMapUnmanaged(*Entry){};

        while (lines.next()) |line| {
            if (line.len == 0) continue;

            const entry = self.parseEntry(line) catch {
                // Skip malformed lines (crash recovery)
                continue;
            };

            if (entry) |e| {
                if (e == .session) {
                    header = e.session;
                } else {
                    try entries.append(self.allocator, e);
                    const ptr = &entries.items[entries.items.len - 1];
                    if (ptr.getId()) |id| {
                        try index.put(self.allocator, id, ptr);
                    }
                }
            }
        }

        if (header == null) {
            return error.MissingHeader;
        }

        var session = Session{
            .header = header.?,
            .entries = entries,
            .index = index,
            .allocator = self.allocator,
        };

        // Set leaf from header if present, otherwise use last entry
        if (session.header.leaf_id) |leaf| {
            session.leaf_id = try self.allocator.dupe(u8, leaf);
        } else if (entries.items.len > 0) {
            if (entries.items[entries.items.len - 1].getId()) |id| {
                session.leaf_id = try self.allocator.dupe(u8, id);
            }
        }

        return session;
    }

    /// Save session to file
    pub fn save(self: *Self, session: *const Session, path: []const u8) !void {
        const file = try std.fs.cwd().createFile(path, .{});
        defer file.close();

        const writer = file.writer();

        // Write header with leafId
        try self.serializeHeader(&session.header, session, writer);

        // Write entries
        for (session.entries.items) |entry| {
            try self.serializeEntry(&entry, writer);
        }
    }

    /// Append entry to file
    pub fn appendEntry(self: *Self, path: []const u8, entry: *const Entry) !void {
        const file = try std.fs.cwd().openFile(path, .{ .mode = .write_only });
        defer file.close();

        try file.seekFromEnd(0);
        try self.serializeEntry(entry, file.writer());
    }

    fn parseEntry(self: *Self, line: []const u8) !?Entry {
        // Simple JSON parsing - production would use proper JSON parser
        if (std.mem.indexOf(u8, line, "\"type\":\"session\"")) |_| {
            return Entry{ .session = try self.parseSessionHeader(line) };
        } else if (std.mem.indexOf(u8, line, "\"type\":\"message\"")) |_| {
            return Entry{ .message = try self.parseMessageEntry(line) };
        } else if (std.mem.indexOf(u8, line, "\"type\":\"compaction\"")) |_| {
            return Entry{ .compaction = try self.parseCompactionEntry(line) };
        } else if (std.mem.indexOf(u8, line, "\"type\":\"custom\"")) |_| {
            return Entry{ .custom = try self.parseCustomEntry(line) };
        }
        return null;
    }

    fn parseSessionHeader(self: *Self, line: []const u8) !SessionHeader {
        return SessionHeader{
            .id = try self.extractJsonString(line, "\"id\":\"") orelse return error.MissingField,
            .timestamp = try self.extractJsonString(line, "\"timestamp\":\"") orelse return error.MissingField,
            .cwd = try self.extractJsonString(line, "\"cwd\":\"") orelse return error.MissingField,
            .leaf_id = try self.extractJsonString(line, "\"leafId\":\""),
            .parent_session = try self.extractJsonString(line, "\"parentSession\":\""),
        };
    }

    fn parseMessageEntry(self: *Self, line: []const u8) !MessageEntry {
        const role_str = try self.extractJsonString(line, "\"role\":\"") orelse return error.MissingField;
        defer self.allocator.free(role_str);

        return MessageEntry{
            .id = try self.extractJsonString(line, "\"id\":\"") orelse return error.MissingField,
            .parent_id = try self.extractJsonString(line, "\"parentId\":\""),
            .timestamp = try self.extractJsonString(line, "\"timestamp\":\"") orelse return error.MissingField,
            .role = Role.fromString(role_str) orelse .user,
            .content = try self.extractJsonString(line, "\"content\":\"") orelse try self.allocator.dupe(u8, ""),
        };
    }

    fn parseCompactionEntry(self: *Self, line: []const u8) !CompactionEntry {
        return CompactionEntry{
            .id = try self.extractJsonString(line, "\"id\":\"") orelse return error.MissingField,
            .parent_id = try self.extractJsonString(line, "\"parentId\":\""),
            .timestamp = try self.extractJsonString(line, "\"timestamp\":\"") orelse return error.MissingField,
            .summary = try self.extractJsonString(line, "\"summary\":\"") orelse try self.allocator.dupe(u8, ""),
            .first_kept_entry_id = try self.extractJsonString(line, "\"firstKeptEntryId\":\"") orelse try self.allocator.dupe(u8, ""),
            .tokens_before = 0,
        };
    }

    fn parseCustomEntry(self: *Self, line: []const u8) !CustomEntry {
        return CustomEntry{
            .id = try self.extractJsonString(line, "\"id\":\"") orelse return error.MissingField,
            .parent_id = try self.extractJsonString(line, "\"parentId\":\""),
            .timestamp = try self.extractJsonString(line, "\"timestamp\":\"") orelse return error.MissingField,
            .custom_type = try self.extractJsonString(line, "\"customType\":\"") orelse try self.allocator.dupe(u8, ""),
            .data = try self.extractJsonString(line, "\"data\":\""),
        };
    }

    fn extractJsonString(self: *Self, json: []const u8, key: []const u8) !?[]const u8 {
        const start = std.mem.indexOf(u8, json, key) orelse return null;
        const value_start = start + key.len;
        var end = value_start;
        while (end < json.len and json[end] != '"') : (end += 1) {}
        if (end > value_start) {
            return try self.allocator.dupe(u8, json[value_start..end]);
        }
        return null;
    }

    fn serializeHeader(self: *Self, header: *const SessionHeader, session: *const Session, writer: anytype) !void {
        _ = self;
        // Use current leaf_id from session, or header's stored leaf_id
        const leaf = session.leaf_id orelse header.leaf_id;

        try writer.writeAll("{\"type\":\"session\"");
        try writer.print(",\"version\":{d}", .{header.version});
        try writer.print(",\"id\":\"{s}\"", .{header.id});
        try writer.print(",\"timestamp\":\"{s}\"", .{header.timestamp});
        try writer.print(",\"cwd\":\"{s}\"", .{escapeJsonString(header.cwd)});
        if (leaf) |l| {
            try writer.print(",\"leafId\":\"{s}\"", .{l});
        }
        if (header.parent_session) |p| {
            try writer.print(",\"parentSession\":\"{s}\"", .{p});
        }
        try writer.writeAll("}\n");
    }

    /// Escape special JSON characters in strings
    /// Note: For production, should properly escape quotes, newlines, etc.
    fn escapeJsonString(s: []const u8) []const u8 {
        // Returns as-is for now (handles typical paths without special chars)
        return s;
    }

    fn serializeEntry(self: *Self, entry: *const Entry, writer: anytype) !void {
        _ = self;
        switch (entry.*) {
            .message => |m| {
                try writer.print(
                    \\{{"type":"message","id":"{s}",
                , .{m.id});
                if (m.parent_id) |p| {
                    try writer.print("\"parentId\":\"{s}\",", .{p});
                } else {
                    try writer.writeAll("\"parentId\":null,");
                }
                try writer.print(
                    \\"timestamp":"{s}","message":{{"role":"{s}","content":"{s}"}}}}
                , .{ m.timestamp, m.role.toString(), m.content });
                try writer.writeByte('\n');
            },
            .compaction => |c| {
                try writer.print(
                    \\{{"type":"compaction","id":"{s}",
                , .{c.id});
                if (c.parent_id) |p| {
                    try writer.print("\"parentId\":\"{s}\",", .{p});
                } else {
                    try writer.writeAll("\"parentId\":null,");
                }
                try writer.print(
                    \\"timestamp":"{s}","summary":"{s}","firstKeptEntryId":"{s}","tokensBefore":{d}}}
                , .{ c.timestamp, c.summary, c.first_kept_entry_id, c.tokens_before });
                try writer.writeByte('\n');
            },
            .custom => |c| {
                try writer.print(
                    \\{{"type":"custom","id":"{s}",
                , .{c.id});
                if (c.parent_id) |p| {
                    try writer.print("\"parentId\":\"{s}\",", .{p});
                } else {
                    try writer.writeAll("\"parentId\":null,");
                }
                try writer.print(
                    \\"timestamp":"{s}","customType":"{s}"
                , .{ c.timestamp, c.custom_type });
                if (c.data) |d| {
                    try writer.print(",\"data\":\"{s}\"", .{d});
                }
                try writer.writeAll("}\n");
            },
            else => {},
        }
    }

    fn getTimestamp(self: *Self) ![]u8 {
        // Simple timestamp - production would use proper ISO8601
        const ts = std.time.timestamp();
        return std.fmt.allocPrint(self.allocator, "{d}", .{ts});
    }
};

// ============ Tests ============

test "Session init/deinit" {
    const allocator = std.testing.allocator;

    const header = SessionHeader{
        .id = try allocator.dupe(u8, "test-id"),
        .timestamp = try allocator.dupe(u8, "2024-01-01"),
        .cwd = try allocator.dupe(u8, "/home/user"),
    };

    var session = Session.init(allocator, header);
    defer session.deinit();

    try std.testing.expectEqualStrings("test-id", session.header.id);
}

test "Session addEntry" {
    const allocator = std.testing.allocator;

    const header = SessionHeader{
        .id = try allocator.dupe(u8, "test-id"),
        .timestamp = try allocator.dupe(u8, "2024-01-01"),
        .cwd = try allocator.dupe(u8, "/home/user"),
    };

    var session = Session.init(allocator, header);
    defer session.deinit();

    const entry = Entry{
        .message = MessageEntry{
            .id = try allocator.dupe(u8, "msg1"),
            .parent_id = null,
            .timestamp = try allocator.dupe(u8, "2024-01-01"),
            .role = .user,
            .content = try allocator.dupe(u8, "Hello"),
        },
    };

    try session.addEntry(entry);

    try std.testing.expectEqual(@as(usize, 1), session.entries.items.len);
    try std.testing.expectEqualStrings("msg1", session.leaf_id.?);
}

test "Session getEntry" {
    const allocator = std.testing.allocator;

    const header = SessionHeader{
        .id = try allocator.dupe(u8, "test-id"),
        .timestamp = try allocator.dupe(u8, "2024-01-01"),
        .cwd = try allocator.dupe(u8, "/home/user"),
    };

    var session = Session.init(allocator, header);
    defer session.deinit();

    const entry = Entry{
        .message = MessageEntry{
            .id = try allocator.dupe(u8, "msg1"),
            .parent_id = null,
            .timestamp = try allocator.dupe(u8, "2024-01-01"),
            .role = .user,
            .content = try allocator.dupe(u8, "Hello"),
        },
    };

    try session.addEntry(entry);

    const found = session.getEntry("msg1");
    try std.testing.expect(found != null);
    try std.testing.expectEqualStrings("Hello", found.?.message.content);
}

test "Role fromString/toString" {
    try std.testing.expectEqual(Role.user, Role.fromString("user").?);
    try std.testing.expectEqual(Role.assistant, Role.fromString("assistant").?);
    try std.testing.expectEqual(Role.tool_result, Role.fromString("toolResult").?);

    try std.testing.expectEqualStrings("user", Role.user.toString());
    try std.testing.expectEqualStrings("assistant", Role.assistant.toString());
}

test "SessionManager create" {
    const allocator = std.testing.allocator;

    var manager = SessionManager.init(allocator, "/tmp/sessions");
    defer manager.deinit();

    var session = try manager.create("/home/user/project");
    defer session.deinit();

    try std.testing.expectEqual(@as(u8, 3), session.header.version);
    try std.testing.expectEqualStrings("/home/user/project", session.header.cwd);
    try std.testing.expectEqual(@as(usize, 36), session.header.id.len);
}

test "Entry getId/getParentId" {
    const allocator = std.testing.allocator;

    const entry = Entry{
        .message = MessageEntry{
            .id = try allocator.dupe(u8, "msg1"),
            .parent_id = try allocator.dupe(u8, "parent1"),
            .timestamp = try allocator.dupe(u8, "2024-01-01"),
            .role = .user,
            .content = try allocator.dupe(u8, "Hello"),
        },
    };
    defer @constCast(&entry).deinit(allocator);

    try std.testing.expectEqualStrings("msg1", entry.getId().?);
    try std.testing.expectEqualStrings("parent1", entry.getParentId().?);
}
