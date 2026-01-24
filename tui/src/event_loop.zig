const std = @import("std");
const vaxis = @import("vaxis");
const Event = @import("event.zig").Event;

/// Generic EventLoop for dependency injection of terminal backend
pub fn EventLoop(comptime Vaxis: type, comptime Tty: type) type {
    return struct {
        allocator: std.mem.Allocator,
        tty: Tty,
        vx: Vaxis,
        loop: vaxis.Loop(Event),
        tty_buffer: [1024]u8,

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
            try self.loop.init();

            return self;
        }

        pub fn deinit(self: *Self) void {
            self.loop.stop();
            self.vx.exitAltScreen(self.tty.writer()) catch {};
            self.vx.deinit(self.allocator, self.tty.writer());
            self.tty.deinit();
        }

        pub fn start(self: *Self) !void {
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
            return self.loop.nextEvent();
        }

        pub fn tryEvent(self: *Self) ?Event {
            return self.loop.tryEvent();
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
    };
}

/// Default concrete type for production use
pub const DefaultEventLoop = EventLoop(vaxis.Vaxis, vaxis.Tty);
