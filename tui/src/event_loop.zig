const std = @import("std");
const vaxis = @import("vaxis");
const obs = @import("obs.zig");

/// Generic EventLoop for dependency injection of terminal backend
pub fn EventLoop(comptime Vaxis: type, comptime Tty: type, comptime Event: type) type {
    return struct {
        allocator: std.mem.Allocator,
        tty: Tty,
        vx: Vaxis,
        loop: vaxis.Loop(Event),
        tty_buffer: [1024]u8,
        last_trace_id: obs.TraceId = 0,

        const Self = @This();

        pub fn init(allocator: std.mem.Allocator) !Self {
            var self: Self = .{
                .allocator = allocator,
                .tty_buffer = undefined,
                .tty = undefined,
                .vx = undefined,
                .loop = undefined,
            };

            self.tty = try Tty.init(&self.tty_buffer);
            errdefer self.tty.deinit();

            self.vx = try Vaxis.init(allocator, .{});
            errdefer self.vx.deinit(allocator, self.tty.writer());

            self.loop = .{ .tty = &self.tty, .vaxis = &self.vx };
            // NOTE: Don't call loop.init() here - pointers become dangling after return
            // loop.init() must be called in start() after struct has stable address

            return self;
        }

        pub fn deinit(self: *Self) void {
            self.loop.stop();
            self.vx.exitAltScreen(self.tty.writer()) catch {};
            self.vx.deinit(self.allocator, self.tty.writer());
            self.tty.deinit();
        }

        pub fn start(self: *Self) !void {
            // Re-point loop to stable self address (init() creates dangling ptrs)
            self.loop.tty = &self.tty;
            self.loop.vaxis = &self.vx;
            try self.loop.init(); // Register signal handlers with stable ptr
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
            try self.vx.setMouseMode(self.tty.writer(), true);
            const ws = try self.getWinsize();
            try self.resize(ws);
        }

        pub fn getWinsize(self: *Self) !vaxis.Winsize {
            return Tty.getWinsize(self.tty.fd);
        }

        pub fn stop(self: *Self) void {
            self.loop.stop();
        }

        pub fn nextEvent(self: *Self) Event {
            const ev = self.loop.nextEvent();
            self.traceEvent(ev, "nextEvent");
            return ev;
        }

        pub fn tryEvent(self: *Self) ?Event {
            const ev = self.loop.tryEvent();
            if (ev) |e| {
                self.traceEvent(e, "tryEvent");
            }
            return ev;
        }

        /// Get last trace ID for correlation
        pub fn lastTraceId(self: *Self) obs.TraceId {
            return self.last_trace_id;
        }

        fn traceEvent(self: *Self, ev: Event, source: []const u8) void {
            if (!obs.global.enabled(.debug)) return;

            self.last_trace_id = obs.global.newTrace();
            var buf: [128]u8 = undefined;
            var fbs = std.io.fixedBufferStream(&buf);
            const w = fbs.writer();

            switch (ev) {
                .key_press => |key| {
                    w.print("key cp={d} text={s}", .{
                        key.codepoint,
                        if (key.text) |t| t else "(null)",
                    }) catch {};
                },
                .mouse => |m| {
                    w.print("mouse x={d} y={d}", .{ m.col, m.row }) catch {};
                },
                .winsize => |ws| {
                    w.print("winsize {d}x{d}", .{ ws.cols, ws.rows }) catch {};
                },
            }

            obs.global.log(.debug, self.last_trace_id, 0, @src(), source, buf[0..fbs.pos]);
        }

        pub fn resize(self: *Self, ws: vaxis.Winsize) !void {
            try self.vx.resize(self.allocator, self.tty.writer(), ws);
        }

        pub fn window(self: *Self) vaxis.Window {
            return self.vx.window();
        }

        pub fn render(self: *Self) !void {
            try self.vx.render(self.tty.writer());
        }

        pub fn suspendTui(self: *Self) !void {
            self.loop.stop();
            const writer = self.tty.writer();
            try writer.writeAll("\x1b[?1049l\x1b[?25h");
            try writer.flush();
            self.tty.deinit();
            const pid: i32 = 0;
            _ = std.c.kill(pid, std.posix.SIG.TSTP);
            self.tty = try Tty.init(&self.tty_buffer);
            self.loop = .{ .tty = &self.tty, .vaxis = &self.vx };
            try self.loop.init();
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
        }

        /// Reinitialize TTY after external process (e.g., editor)
        pub fn reinitTty(self: *Self) !void {
            self.tty = try Tty.init(&self.tty_buffer);
            self.loop = .{ .tty = &self.tty, .vaxis = &self.vx };
            try self.loop.init();
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
        }
    };
}



