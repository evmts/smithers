const std = @import("std");
const vaxis = @import("vaxis");
const Event = @import("event.zig").Event;

/// Encapsulates the vaxis event loop, TTY, and rendering
pub const EventLoop = struct {
    allocator: std.mem.Allocator,
    tty: vaxis.Tty,
    vx: vaxis.Vaxis,
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

        self.tty = try vaxis.Tty.init(&self.tty_buffer);
        errdefer self.tty.deinit();

        self.vx = try vaxis.init(allocator, .{});
        errdefer self.vx.deinit(allocator, self.tty.writer());

        self.loop = .{ .tty = &self.tty, .vaxis = &self.vx };
        try self.loop.init();

        return self;
    }

    pub fn deinit(self: *Self) void {
        // Stop loop first and wait for read thread to finish
        self.loop.stop();
        
        // Exit alt screen before restoring terminal
        self.vx.exitAltScreen(self.tty.writer()) catch {};
        
        self.vx.deinit(self.allocator, self.tty.writer());
        self.tty.deinit();
    }

    pub fn start(self: *Self) !void {
        try self.loop.start();
        try self.vx.enterAltScreen(self.tty.writer());
        
        // Enable mouse mode for scroll wheel
        // Hold Shift while selecting to copy text (terminal passthrough)
        try self.vx.setMouseMode(self.tty.writer(), true);
        
        // Get initial window size and resize immediately
        const ws = try self.getWinsize();
        try self.resize(ws);
    }
    
    /// Get current terminal window size
    pub fn getWinsize(self: *Self) !vaxis.Winsize {
        return vaxis.Tty.getWinsize(self.tty.fd);
    }

    pub fn stop(self: *Self) void {
        self.loop.stop();
    }

    /// Block until next event
    pub fn nextEvent(self: *Self) Event {
        return self.loop.nextEvent();
    }

    /// Poll for event without blocking
    pub fn tryEvent(self: *Self) ?Event {
        return self.loop.tryEvent();
    }

    /// Handle window resize
    pub fn resize(self: *Self, ws: vaxis.Winsize) !void {
        try self.vx.resize(self.allocator, self.tty.writer(), ws);
    }

    /// Get the root window for rendering
    pub fn window(self: *Self) vaxis.Window {
        return self.vx.window();
    }

    /// Render the current frame
    pub fn render(self: *Self) !void {
        try self.vx.render(self.tty.writer());
    }
    
    /// Suspend the TUI (like Ctrl+Z in vim)
    pub fn suspendTui(self: *Self) !void {
        // Stop the loop first
        self.loop.stop();
        
        // Exit alt screen and show cursor
        const writer = self.tty.writer();
        try writer.writeAll("\x1b[?1049l\x1b[?25h");
        try writer.flush();
        
        // Restore terminal to original state (cooked mode)
        self.tty.deinit();
        
        // Send SIGTSTP to process group (like codex does with libc::kill(0, SIGTSTP))
        const pid: i32 = 0; // 0 means current process group
        _ = std.c.kill(pid, std.posix.SIG.TSTP);
        
        // After resume - reinit everything
        self.tty = try vaxis.Tty.init(&self.tty_buffer);
        self.loop = .{ .tty = &self.tty, .vaxis = &self.vx };
        try self.loop.init();
        try self.loop.start();
        try self.vx.enterAltScreen(self.tty.writer());
    }
};
