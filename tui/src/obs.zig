///! Observability module for Smithers TUI
///! Provides structured JSON logging, event tracing, and crash diagnostics.
///!
///! Enable via: SMITHERS_DEBUG_LEVEL=debug|trace|info|warn|error
///! Output: /tmp/smithers-debug.log (JSON Lines format)
const std = @import("std");
const builtin = @import("builtin");

/// Debug levels - higher = more verbose
pub const Level = enum(u3) {
    off = 0,
    err = 1,
    warn = 2,
    info = 3,
    debug = 4,
    trace = 5,

    pub fn fromString(s: []const u8) Level {
        if (std.mem.eql(u8, s, "trace")) return .trace;
        if (std.mem.eql(u8, s, "debug")) return .debug;
        if (std.mem.eql(u8, s, "info")) return .info;
        if (std.mem.eql(u8, s, "warn")) return .warn;
        if (std.mem.eql(u8, s, "error")) return .err;
        return .off;
    }
};

/// Trace/Span IDs for correlating events
pub const TraceId = u64;
pub const SpanId = u64;

/// A single log/trace record stored in ring buffer
pub const Record = struct {
    timestamp_ms: i64,
    level: Level,
    trace_id: TraceId,
    span_id: SpanId,
    parent_span_id: SpanId,
    event_type: [64]u8,
    event_type_len: u8,
    file: [64]u8,
    file_len: u8,
    line: u32,
    func: [64]u8,
    func_len: u8,
    message: [256]u8,
    message_len: u16,
};

/// Ring buffer for crash dumps - stores last N records
pub fn RingBuffer(comptime capacity: usize) type {
    return struct {
        items: [capacity]Record = undefined,
        head: usize = 0,
        count: usize = 0,

        const Self = @This();

        pub fn push(self: *Self, record: Record) void {
            self.items[self.head] = record;
            self.head = (self.head + 1) % capacity;
            if (self.count < capacity) self.count += 1;
        }

        pub fn dump(self: *Self, writer: anytype) void {
            if (self.count == 0) return;
            const start = if (self.count < capacity) 0 else self.head;
            var i: usize = 0;
            while (i < self.count) : (i += 1) {
                const idx = (start + i) % capacity;
                const rec = &self.items[idx];
                self.writeRecord(writer, rec);
            }
        }

        fn writeRecord(_: *Self, writer: anytype, rec: *const Record) void {
            writer.print("{{\"ts\":{d},\"lvl\":\"{s}\",\"tid\":{d},\"sid\":{d},\"psid\":{d},\"type\":\"{s}\",\"src\":{{\"file\":\"{s}\",\"line\":{d},\"fn\":\"{s}\"}},\"msg\":\"{s}\"}}\n", .{
                rec.timestamp_ms,
                @tagName(rec.level),
                rec.trace_id,
                rec.span_id,
                rec.parent_span_id,
                rec.event_type[0..rec.event_type_len],
                rec.file[0..rec.file_len],
                rec.line,
                rec.func[0..rec.func_len],
                rec.message[0..rec.message_len],
            }) catch {};
        }
    };
}

/// Active span for timing
pub const Span = struct {
    trace_id: TraceId,
    span_id: SpanId,
    parent_span_id: SpanId,
    start_ms: i64,
    name: []const u8,
};

/// Global observability instance
pub const Obs = struct {
    level: Level,
    file: ?std.fs.File,
    next_trace_id: std.atomic.Value(u64),
    next_span_id: std.atomic.Value(u64),
    ring: RingBuffer(2048),
    lock: std.Thread.Mutex,
    write_buf: [4096]u8,

    const Self = @This();

    /// Initialize from environment
    pub fn init() Self {
        const level_str = std.posix.getenv("SMITHERS_DEBUG_LEVEL") orelse "";
        const level = Level.fromString(level_str);

        var file: ?std.fs.File = null;
        if (level != .off) {
            file = std.fs.createFileAbsolute("/tmp/smithers-debug.log", .{ .truncate = true }) catch null;
        }

        return .{
            .level = level,
            .file = file,
            .next_trace_id = std.atomic.Value(u64).init(1),
            .next_span_id = std.atomic.Value(u64).init(1),
            .ring = .{},
            .lock = .{},
            .write_buf = undefined,
        };
    }

    pub fn deinit(self: *Self) void {
        if (self.file) |f| f.close();
    }

    /// Check if level is enabled (for guarding expensive operations)
    pub inline fn enabled(self: *Self, lvl: Level) bool {
        return @intFromEnum(self.level) >= @intFromEnum(lvl);
    }

    /// Create new trace ID
    pub fn newTrace(self: *Self) TraceId {
        return self.next_trace_id.fetchAdd(1, .monotonic);
    }

    /// Begin a span
    pub fn spanBegin(self: *Self, trace_id: TraceId, parent: ?SpanId, src: std.builtin.SourceLocation, name: []const u8) Span {
        const sid = self.next_span_id.fetchAdd(1, .monotonic);
        const span = Span{
            .trace_id = trace_id,
            .span_id = sid,
            .parent_span_id = parent orelse 0,
            .start_ms = std.time.milliTimestamp(),
            .name = name,
        };

        if (self.enabled(.trace)) {
            self.logInternal(.trace, trace_id, sid, parent orelse 0, src, "span.begin", name);
        }

        return span;
    }

    /// End a span
    pub fn spanEnd(self: *Self, span: *const Span, src: std.builtin.SourceLocation) void {
        if (!self.enabled(.trace)) return;
        const duration = std.time.milliTimestamp() - span.start_ms;
        var buf: [64]u8 = undefined;
        const msg = std.fmt.bufPrint(&buf, "{s} duration_ms={d}", .{ span.name, duration }) catch span.name;
        self.logInternal(.trace, span.trace_id, span.span_id, span.parent_span_id, src, "span.end", msg);
    }

    /// Log with trace context
    pub fn log(self: *Self, lvl: Level, trace_id: TraceId, span_id: SpanId, src: std.builtin.SourceLocation, event_type: []const u8, msg: []const u8) void {
        if (!self.enabled(lvl)) return;
        self.logInternal(lvl, trace_id, span_id, 0, src, event_type, msg);
    }

    /// Simple log without trace context
    pub fn logSimple(self: *Self, lvl: Level, src: std.builtin.SourceLocation, event_type: []const u8, msg: []const u8) void {
        if (!self.enabled(lvl)) return;
        self.logInternal(lvl, 0, 0, 0, src, event_type, msg);
    }

    fn logInternal(self: *Self, lvl: Level, trace_id: TraceId, span_id: SpanId, parent_span_id: SpanId, src: std.builtin.SourceLocation, event_type: []const u8, msg: []const u8) void {
        const ts = std.time.milliTimestamp();

        // Build record for ring buffer
        var rec = Record{
            .timestamp_ms = ts,
            .level = lvl,
            .trace_id = trace_id,
            .span_id = span_id,
            .parent_span_id = parent_span_id,
            .event_type = undefined,
            .event_type_len = 0,
            .file = undefined,
            .file_len = 0,
            .line = src.line,
            .func = undefined,
            .func_len = 0,
            .message = undefined,
            .message_len = 0,
        };

        // Copy strings with bounds
        const et_len = @min(event_type.len, 64);
        @memcpy(rec.event_type[0..et_len], event_type[0..et_len]);
        rec.event_type_len = @intCast(et_len);

        const file_name = std.fs.path.basename(src.file);
        const f_len = @min(file_name.len, 64);
        @memcpy(rec.file[0..f_len], file_name[0..f_len]);
        rec.file_len = @intCast(f_len);

        const fn_len = @min(src.fn_name.len, 64);
        @memcpy(rec.func[0..fn_len], src.fn_name[0..fn_len]);
        rec.func_len = @intCast(fn_len);

        const m_len = @min(msg.len, 256);
        @memcpy(rec.message[0..m_len], msg[0..m_len]);
        rec.message_len = @intCast(m_len);

        // Lock for thread safety
        self.lock.lock();
        defer self.lock.unlock();

        // Store in ring buffer
        self.ring.push(rec);

        // Write to file using fixed buffer
        if (self.file) |f| {
            const escaped_msg = escapeJson(msg);
            const written = std.fmt.bufPrint(&self.write_buf, "{{\"ts\":{d},\"lvl\":\"{s}\",\"tid\":{d},\"sid\":{d},\"type\":\"{s}\",\"src\":{{\"file\":\"{s}\",\"line\":{d},\"fn\":\"{s}\"}},\"msg\":\"{s}\"}}\n", .{
                ts,
                @tagName(lvl),
                trace_id,
                span_id,
                event_type,
                file_name,
                src.line,
                src.fn_name,
                escaped_msg,
            }) catch return;
            _ = f.write(written) catch {};
        }
    }

    /// Dump ring buffer (for crash/panic)
    pub fn dumpRing(self: *Self, writer: anytype) void {
        self.lock.lock();
        defer self.lock.unlock();
        writer.print("\n=== SMITHERS DEBUG RING BUFFER ({d} records) ===\n", .{self.ring.count}) catch {};
        self.ring.dump(writer);
    }

    /// Dump to stderr on panic
    pub fn panicDump(self: *Self) void {
        const stderr = std.io.getStdErr().writer();
        self.dumpRing(stderr);
    }
};

/// Thread-local buffer for JSON escaping
threadlocal var escape_buf: [512]u8 = undefined;

/// Escape JSON special characters into thread-local buffer
fn escapeJson(input: []const u8) []const u8 {
    var i: usize = 0;
    for (input) |c| {
        if (i + 2 >= escape_buf.len) break;
        switch (c) {
            '"' => {
                escape_buf[i] = '\\';
                escape_buf[i + 1] = '"';
                i += 2;
            },
            '\\' => {
                escape_buf[i] = '\\';
                escape_buf[i + 1] = '\\';
                i += 2;
            },
            '\n' => {
                escape_buf[i] = '\\';
                escape_buf[i + 1] = 'n';
                i += 2;
            },
            '\r' => {
                escape_buf[i] = '\\';
                escape_buf[i + 1] = 'r';
                i += 2;
            },
            '\t' => {
                escape_buf[i] = '\\';
                escape_buf[i + 1] = 't';
                i += 2;
            },
            else => {
                escape_buf[i] = c;
                i += 1;
            },
        }
    }
    return escape_buf[0..i];
}

/// Format helper for key events
pub fn fmtKey(codepoint: u21, ctrl: bool, alt: bool, shift: bool) [64]u8 {
    var buf: [64]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    const w = fbs.writer();
    w.print("cp={d}", .{codepoint}) catch {};
    if (ctrl) w.writeAll(" ctrl") catch {};
    if (alt) w.writeAll(" alt") catch {};
    if (shift) w.writeAll(" shift") catch {};
    const written = fbs.pos;
    @memset(buf[written..], 0);
    return buf;
}

pub fn fmtKeySlice(buf: *const [64]u8) []const u8 {
    var len: usize = 0;
    for (buf) |c| {
        if (c == 0) break;
        len += 1;
    }
    return buf[0..len];
}

/// Global instance - initialized in main
pub var global: Obs = undefined;
var global_initialized: bool = false;

pub fn initGlobal() void {
    if (!global_initialized) {
        global = Obs.init();
        global_initialized = true;
    }
}

pub fn deinitGlobal() void {
    if (global_initialized) {
        global.deinit();
        global_initialized = false;
    }
}

// ============ Tests ============

test "Level.fromString" {
    try std.testing.expectEqual(Level.trace, Level.fromString("trace"));
    try std.testing.expectEqual(Level.debug, Level.fromString("debug"));
    try std.testing.expectEqual(Level.info, Level.fromString("info"));
    try std.testing.expectEqual(Level.warn, Level.fromString("warn"));
    try std.testing.expectEqual(Level.err, Level.fromString("error"));
    try std.testing.expectEqual(Level.off, Level.fromString(""));
    try std.testing.expectEqual(Level.off, Level.fromString("invalid"));
}

test "RingBuffer push and wrap" {
    var ring = RingBuffer(4){};
    const rec = Record{
        .timestamp_ms = 12345,
        .level = .debug,
        .trace_id = 1,
        .span_id = 2,
        .parent_span_id = 0,
        .event_type = undefined,
        .event_type_len = 0,
        .file = undefined,
        .file_len = 0,
        .line = 10,
        .func = undefined,
        .func_len = 0,
        .message = undefined,
        .message_len = 0,
    };

    ring.push(rec);
    try std.testing.expectEqual(@as(usize, 1), ring.count);

    ring.push(rec);
    ring.push(rec);
    ring.push(rec);
    try std.testing.expectEqual(@as(usize, 4), ring.count);

    // Wrap around
    ring.push(rec);
    try std.testing.expectEqual(@as(usize, 4), ring.count);
    try std.testing.expectEqual(@as(usize, 1), ring.head);
}

test "Obs.enabled" {
    var o = Obs{
        .level = .debug,
        .file = null,
        .next_trace_id = std.atomic.Value(u64).init(1),
        .next_span_id = std.atomic.Value(u64).init(1),
        .ring = .{},
        .lock = .{},
        .write_buf = undefined,
    };

    try std.testing.expect(o.enabled(.err));
    try std.testing.expect(o.enabled(.warn));
    try std.testing.expect(o.enabled(.info));
    try std.testing.expect(o.enabled(.debug));
    try std.testing.expect(!o.enabled(.trace));
}

test "fmtKey formatting" {
    const buf = fmtKey('a', true, false, false);
    const slice = fmtKeySlice(&buf);
    try std.testing.expect(std.mem.indexOf(u8, slice, "cp=97") != null);
    try std.testing.expect(std.mem.indexOf(u8, slice, "ctrl") != null);
}
