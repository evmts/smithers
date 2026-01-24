// Loader Component for Smithers TUI
// Braille spinner animation with 80ms frame interval

const std = @import("std");
const DefaultRenderer = @import("../rendering/renderer.zig").DefaultRenderer;

pub const SPINNER_FRAMES = [_][]const u8{
    "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
};

pub const FRAME_INTERVAL_MS: i64 = 80;

const spinner_color: u8 = 114; // Green

pub const LoaderStyle = struct {
    label: ?[]const u8 = null,
    label_position: enum { left, right } = .right,
    color: u8 = spinner_color,
};

pub const Loader = struct {
    frame_index: u8 = 0,
    style: LoaderStyle = .{},
    last_frame_time: i64 = 0,
    running: bool = true,

    const Self = @This();
    const FRAME_COUNT: u8 = SPINNER_FRAMES.len;

    pub fn init() Self {
        return .{
            .last_frame_time = std.time.milliTimestamp(),
        };
    }

    pub fn initWithLabel(label: []const u8) Self {
        return .{
            .style = .{ .label = label },
            .last_frame_time = std.time.milliTimestamp(),
        };
    }

    pub fn setLabel(self: *Self, label: ?[]const u8) void {
        self.style.label = label;
    }

    pub fn setRunning(self: *Self, running: bool) void {
        self.running = running;
    }

    pub fn isRunning(self: *const Self) bool {
        return self.running;
    }

    pub fn tick(self: *Self) bool {
        if (!self.running) return false;

        const now = std.time.milliTimestamp();
        const elapsed = now - self.last_frame_time;
        if (elapsed >= FRAME_INTERVAL_MS) {
            self.frame_index = (self.frame_index + 1) % FRAME_COUNT;
            self.last_frame_time = now;
            return true;
        }
        return false;
    }

    pub fn advance(self: *Self) void {
        self.frame_index = (self.frame_index + 1) % FRAME_COUNT;
        self.last_frame_time = std.time.milliTimestamp();
    }

    pub fn currentFrame(self: *const Self) []const u8 {
        return SPINNER_FRAMES[self.frame_index];
    }

    pub fn draw(self: *const Self, renderer: DefaultRenderer) void {
        const spin_style: DefaultRenderer.Style = .{ .fg = .{ .index = self.style.color } };
        const text_style: DefaultRenderer.Style = .{};
        const win_width = renderer.width();

        var x: u16 = 0;

        if (self.style.label) |label| {
            if (self.style.label_position == .left) {
                const label_len: u16 = @intCast(@min(label.len, win_width -| 3));
                renderer.drawText(x, 0, label[0..label_len], text_style);
                x += label_len + 1;

                renderer.drawText(x, 0, self.currentFrame(), spin_style);
            } else {
                renderer.drawText(x, 0, self.currentFrame(), spin_style);
                x += 2;

                const label_len: u16 = @intCast(@min(label.len, win_width -| x));
                renderer.drawText(x, 0, label[0..label_len], text_style);
            }
        } else {
            renderer.drawText(0, 0, self.currentFrame(), spin_style);
        }
    }

    pub fn width(self: *const Self) u16 {
        const spinner_width: u16 = 2;
        if (self.style.label) |label| {
            return spinner_width + 1 + @as(u16, @intCast(label.len));
        }
        return spinner_width;
    }
};
