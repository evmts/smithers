// Session Management for Smithers TUI
// NDJSON persistence with tree structure, compatible with db.zig Message format

const std = @import("std");
const obs = @import("../obs.zig");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

pub const EntryType = enum {
    session,
    message,
    compaction,
    custom,
};

pub const Role = enum {
    user,
    assistant,
    system,
    tool_result,

    pub fn toString(self: Role) []const u8 {
        return switch (self) {
            .user => "user",
            .assistant => "assistant",
            .system => "system",
            .tool_result => "toolResult",
        };
    }

    pub fn fromString(s: []const u8) ?Role {
        if (std.mem.eql(u8, s, "user")) return .user;
        if (std.mem.eql(u8, s, "assistant")) return .assistant;
        if (std.mem.eql(u8, s, "system")) return .system;
        if (std.mem.eql(u8, s, "toolResult")) return .tool_result;
        return null;
    }
};

pub const SessionHeader = struct {
    version: u8 = 1,
    id: []const u8,
    timestamp: []const u8,
    cwd: []const u8,
    leaf_id: ?[]const u8 = null,
    name: ?[]const u8 = null,

    pub fn deinit(self: *SessionHeader, allocator: Allocator) void {
        allocator.free(self.id);
        allocator.free(self.timestamp);
        allocator.free(self.cwd);
        if (self.leaf_id) |l| allocator.free(l);
        if (self.name) |n| allocator.free(n);
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

pub const Entry = union(EntryType) {
    session: SessionHeader,
    message: MessageEntry,
    compaction: CompactionEntry,
    custom: CustomEntry,

    pub fn getId(self: *const Entry) ?[]const u8 {
        return switch (self.*) {
            .session => null,
            .message => |m| m.id,
            .compaction => |c| c.id,
            .custom => |c| c.id,
        };
    }

    pub fn getParentId(self: *const Entry) ?[]const u8 {
        return switch (self.*) {
            .session => null,
            .message => |m| m.parent_id,
            .compaction => |c| c.parent_id,
            .custom => |c| c.parent_id,
        };
    }

    pub fn deinit(self: *Entry, allocator: Allocator) void {
        switch (self.*) {
            .session => |*h| h.deinit(allocator),
            .message => |*m| m.deinit(allocator),
            .compaction => |*c| c.deinit(allocator),
            .custom => |*c| c.deinit(allocator),
        }
    }
};

pub const Session = struct {
    header: SessionHeader,
    entries: ArrayListUnmanaged(Entry),
    index: std.StringHashMapUnmanaged(usize),
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
        const idx = self.entries.items.len;
        try self.entries.append(self.allocator, entry);

        if (self.entries.items[idx].getId()) |id| {
            try self.index.put(self.allocator, id, idx);
        }

        if (self.leaf_id) |l| self.allocator.free(l);
        if (self.entries.items[idx].getId()) |id| {
            self.leaf_id = try self.allocator.dupe(u8, id);
        } else {
            self.leaf_id = null;
        }
    }

    pub fn getEntry(self: *const Self, id: []const u8) ?*Entry {
        const idx = self.index.get(id) orelse return null;
        return @constCast(&self.entries.items[idx]);
    }

    pub fn getBranch(self: *const Self) ![]Entry {
        if (self.leaf_id == null) return &[_]Entry{};

        var path = ArrayListUnmanaged(usize){};
        defer path.deinit(self.allocator);

        var current_id: ?[]const u8 = self.leaf_id;
        while (current_id) |id| {
            if (self.index.get(id)) |idx| {
                try path.append(self.allocator, idx);
                current_id = self.entries.items[idx].getParentId();
            } else {
                break;
            }
        }

        var result = try self.allocator.alloc(Entry, path.items.len);
        for (path.items, 0..) |idx, i| {
            result[path.items.len - 1 - i] = self.entries.items[idx];
        }

        return result;
    }
};

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

    fn generateUuid(self: *Self) ![]u8 {
        const ns = std.time.nanoTimestamp();
        const seed: u64 = @truncate(@as(u128, @bitCast(ns)));
        var prng = std.Random.DefaultPrng.init(seed);
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

        return try self.allocator.dupe(u8, &uuid);
    }

    fn getTimestamp(self: *Self) ![]u8 {
        const ts = std.time.timestamp();
        return std.fmt.allocPrint(self.allocator, "{d}", .{ts});
    }

    pub fn createSession(self: *Self, cwd: []const u8) !Session {
        const uuid = try self.generateUuid();
        const timestamp = try self.getTimestamp();

        const header = SessionHeader{
            .id = uuid,
            .timestamp = timestamp,
            .cwd = try self.allocator.dupe(u8, cwd),
        };

        return Session.init(self.allocator, header);
    }

    pub fn saveSession(self: *Self, session: *const Session) !void {
        try self.ensureSessionDir();

        var path_buf: [512]u8 = undefined;
        const path = try std.fmt.bufPrint(&path_buf, "{s}/{s}.ndjson", .{ self.session_dir, session.header.id });

        const file = try std.fs.cwd().createFile(path, .{});
        defer file.close();

        try self.serializeHeader(&session.header, session, file);

        for (session.entries.items) |entry| {
            try self.serializeEntry(&entry, file);
        }
    }

    pub fn loadSession(self: *Self, id: []const u8) !Session {
        var path_buf: [512]u8 = undefined;
        const path = try std.fmt.bufPrint(&path_buf, "{s}/{s}.ndjson", .{ self.session_dir, id });

        const file = try std.fs.cwd().openFile(path, .{});
        defer file.close();

        const content = try file.readToEndAlloc(self.allocator, 1024 * 1024 * 100);
        defer self.allocator.free(content);

        var lines = std.mem.splitScalar(u8, content, '\n');
        var header: ?SessionHeader = null;
        var entries = ArrayListUnmanaged(Entry){};
        errdefer {
            for (entries.items) |*e| e.deinit(self.allocator);
            entries.deinit(self.allocator);
        }
        var index = std.StringHashMapUnmanaged(usize){};
        errdefer index.deinit(self.allocator);

        var parse_errors: usize = 0;
        while (lines.next()) |line| {
            if (line.len == 0) continue;

            const entry = self.parseEntry(line) catch |err| {
                parse_errors += 1;
                var buf: [64]u8 = undefined;
                const msg = std.fmt.bufPrint(&buf, "parse error: {s}", .{@errorName(err)}) catch "parse error";
                obs.global.logSimple(.warn, @src(), "session.load", msg);
                continue;
            };

            if (entry) |e| {
                if (e == .session) {
                    header = e.session;
                } else {
                    const idx = entries.items.len;
                    try entries.append(self.allocator, e);
                    if (entries.items[idx].getId()) |entry_id| {
                        try index.put(self.allocator, entry_id, idx);
                    }
                }
            }
        }

        if (parse_errors > 0) {
            var buf: [64]u8 = undefined;
            const msg = std.fmt.bufPrint(&buf, "skipped {d} malformed entries", .{parse_errors}) catch "skipped entries";
            obs.global.logSimple(.warn, @src(), "session.load", msg);
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

        if (session.header.leaf_id) |leaf| {
            session.leaf_id = try self.allocator.dupe(u8, leaf);
        } else if (entries.items.len > 0) {
            if (entries.items[entries.items.len - 1].getId()) |last_id| {
                session.leaf_id = try self.allocator.dupe(u8, last_id);
            }
        }

        return session;
    }

    pub fn listSessions(self: *Self) ![]SessionHeader {
        var sessions = ArrayListUnmanaged(SessionHeader){};
        errdefer {
            for (sessions.items) |*s| s.deinit(self.allocator);
            sessions.deinit(self.allocator);
        }

        var dir = std.fs.cwd().openDir(self.session_dir, .{ .iterate = true }) catch |err| {
            if (err == error.FileNotFound) return sessions.toOwnedSlice(self.allocator);
            return err;
        };
        defer dir.close();

        var iter = dir.iterate();
        while (try iter.next()) |entry| {
            if (entry.kind != .file) continue;
            if (!std.mem.endsWith(u8, entry.name, ".ndjson")) continue;

            const id = entry.name[0 .. entry.name.len - 7];
            var session = self.loadSession(id) catch continue;
            const header_copy = SessionHeader{
                .version = session.header.version,
                .id = try self.allocator.dupe(u8, session.header.id),
                .timestamp = try self.allocator.dupe(u8, session.header.timestamp),
                .cwd = try self.allocator.dupe(u8, session.header.cwd),
                .leaf_id = if (session.header.leaf_id) |l| try self.allocator.dupe(u8, l) else null,
                .name = if (session.header.name) |n| try self.allocator.dupe(u8, n) else null,
            };
            session.deinit();
            try sessions.append(self.allocator, header_copy);
        }

        return sessions.toOwnedSlice(self.allocator);
    }

    pub fn deleteSession(self: *Self, id: []const u8) !void {
        var path_buf: [512]u8 = undefined;
        const path = try std.fmt.bufPrint(&path_buf, "{s}/{s}.ndjson", .{ self.session_dir, id });
        try std.fs.cwd().deleteFile(path);
    }

    fn ensureSessionDir(self: *Self) !void {
        std.fs.cwd().makePath(self.session_dir) catch |err| {
            if (err != error.PathAlreadyExists) return err;
        };
    }

    fn parseEntry(self: *Self, line: []const u8) !?Entry {
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
            .name = try self.extractJsonString(line, "\"name\":\""),
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

    fn serializeHeader(_: *Self, header: *const SessionHeader, session: *const Session, file: std.fs.File) !void {
        const leaf = session.leaf_id orelse header.leaf_id;

        var buf: [2048]u8 = undefined;
        var pos: usize = 0;

        const prefix = "{\"type\":\"session\"";
        @memcpy(buf[pos..][0..prefix.len], prefix);
        pos += prefix.len;

        const ver_str = try std.fmt.bufPrint(buf[pos..], ",\"version\":{d}", .{header.version});
        pos += ver_str.len;

        const id_str = try std.fmt.bufPrint(buf[pos..], ",\"id\":\"{s}\"", .{header.id});
        pos += id_str.len;

        const ts_str = try std.fmt.bufPrint(buf[pos..], ",\"timestamp\":\"{s}\"", .{header.timestamp});
        pos += ts_str.len;

        const cwd_str = try std.fmt.bufPrint(buf[pos..], ",\"cwd\":\"{s}\"", .{header.cwd});
        pos += cwd_str.len;

        if (leaf) |l| {
            const leaf_str = try std.fmt.bufPrint(buf[pos..], ",\"leafId\":\"{s}\"", .{l});
            pos += leaf_str.len;
        }
        if (header.name) |n| {
            const name_str = try std.fmt.bufPrint(buf[pos..], ",\"name\":\"{s}\"", .{n});
            pos += name_str.len;
        }

        @memcpy(buf[pos..][0..2], "}\n");
        pos += 2;

        try file.writeAll(buf[0..pos]);
    }

    fn serializeEntry(self: *Self, entry: *const Entry, file: std.fs.File) !void {
        var buf: [8192]u8 = undefined;
        var pos: usize = 0;

        switch (entry.*) {
            .message => |m| {
                const line = try std.fmt.allocPrint(self.allocator, "{{\"type\":\"message\",\"id\":\"{s}\",{s}\"timestamp\":\"{s}\",\"message\":{{\"role\":\"{s}\",\"content\":\"{s}\"}}}}\n", .{
                    m.id,
                    if (m.parent_id) |p| try std.fmt.allocPrint(self.allocator, "\"parentId\":\"{s}\",", .{p}) else "\"parentId\":null,",
                    m.timestamp,
                    m.role.toString(),
                    m.content,
                });
                defer self.allocator.free(line);
                try file.writeAll(line);
                return;
            },
            .compaction => |c| {
                const prefix = try std.fmt.bufPrint(&buf, "{{\"type\":\"compaction\",\"id\":\"{s}\",", .{c.id});
                pos = prefix.len;

                if (c.parent_id) |p| {
                    const parent_str = try std.fmt.bufPrint(buf[pos..], "\"parentId\":\"{s}\",", .{p});
                    pos += parent_str.len;
                } else {
                    const null_str = "\"parentId\":null,";
                    @memcpy(buf[pos..][0..null_str.len], null_str);
                    pos += null_str.len;
                }

                const rest = try std.fmt.bufPrint(buf[pos..], "\"timestamp\":\"{s}\",\"summary\":\"{s}\",\"firstKeptEntryId\":\"{s}\",\"tokensBefore\":{d}}}\n", .{ c.timestamp, c.summary, c.first_kept_entry_id, c.tokens_before });
                pos += rest.len;
            },
            .custom => |c| {
                const prefix = try std.fmt.bufPrint(&buf, "{{\"type\":\"custom\",\"id\":\"{s}\",", .{c.id});
                pos = prefix.len;

                if (c.parent_id) |p| {
                    const parent_str = try std.fmt.bufPrint(buf[pos..], "\"parentId\":\"{s}\",", .{p});
                    pos += parent_str.len;
                } else {
                    const null_str = "\"parentId\":null,";
                    @memcpy(buf[pos..][0..null_str.len], null_str);
                    pos += null_str.len;
                }

                const ts_str = try std.fmt.bufPrint(buf[pos..], "\"timestamp\":\"{s}\",\"customType\":\"{s}\"", .{ c.timestamp, c.custom_type });
                pos += ts_str.len;

                if (c.data) |d| {
                    const data_str = try std.fmt.bufPrint(buf[pos..], ",\"data\":\"{s}\"", .{d});
                    pos += data_str.len;
                }

                @memcpy(buf[pos..][0..2], "}\n");
                pos += 2;
            },
            .session => return,
        }

        try file.writeAll(buf[0..pos]);
    }
};

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
    try std.testing.expectEqual(Role.system, Role.fromString("system").?);
    try std.testing.expectEqual(Role.tool_result, Role.fromString("toolResult").?);

    try std.testing.expectEqualStrings("user", Role.user.toString());
    try std.testing.expectEqualStrings("assistant", Role.assistant.toString());
    try std.testing.expectEqualStrings("system", Role.system.toString());
}

test "SessionManager createSession" {
    const allocator = std.testing.allocator;

    var manager = SessionManager.init(allocator, "/tmp/smithers-test-sessions");
    defer manager.deinit();

    var session = try manager.createSession("/home/user/project");
    defer session.deinit();

    try std.testing.expectEqual(@as(u8, 1), session.header.version);
    try std.testing.expectEqualStrings("/home/user/project", session.header.cwd);
    try std.testing.expectEqual(@as(usize, 36), session.header.id.len);
}

test "SessionManager save/load roundtrip" {
    const allocator = std.testing.allocator;
    const test_dir = "/tmp/smithers-test-sessions-roundtrip";

    defer std.fs.cwd().deleteTree(test_dir) catch {};

    var manager = SessionManager.init(allocator, test_dir);
    defer manager.deinit();

    var session = try manager.createSession("/home/user/project");
    const session_id = try allocator.dupe(u8, session.header.id);
    defer allocator.free(session_id);

    const msg_entry = Entry{
        .message = MessageEntry{
            .id = try allocator.dupe(u8, "msg001"),
            .parent_id = null,
            .timestamp = try allocator.dupe(u8, "1700000000"),
            .role = .user,
            .content = try allocator.dupe(u8, "Test message"),
        },
    };
    try session.addEntry(msg_entry);

    try manager.saveSession(&session);
    session.deinit();

    var loaded = try manager.loadSession(session_id);
    defer loaded.deinit();

    try std.testing.expectEqualStrings(session_id, loaded.header.id);
    try std.testing.expectEqual(@as(usize, 1), loaded.entries.items.len);
    try std.testing.expectEqualStrings("Test message", loaded.entries.items[0].message.content);
}

test "SessionManager listSessions" {
    const allocator = std.testing.allocator;
    const test_dir = "/tmp/smithers-test-sessions-list";

    defer std.fs.cwd().deleteTree(test_dir) catch {};

    var manager = SessionManager.init(allocator, test_dir);
    defer manager.deinit();

    var s1 = try manager.createSession("/project1");
    try manager.saveSession(&s1);
    const id1 = try allocator.dupe(u8, s1.header.id);
    defer allocator.free(id1);
    s1.deinit();

    var s2 = try manager.createSession("/project2");
    try manager.saveSession(&s2);
    const id2 = try allocator.dupe(u8, s2.header.id);
    defer allocator.free(id2);
    s2.deinit();

    const sessions = try manager.listSessions();
    defer {
        for (sessions) |*s| @constCast(s).deinit(allocator);
        allocator.free(sessions);
    }

    try std.testing.expectEqual(@as(usize, 2), sessions.len);
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
