const vaxis = @import("vaxis");

/// Application events - wraps vaxis events with app-specific events
pub const Event = union(enum) {
    key_press: vaxis.Key,
    winsize: vaxis.Winsize,
    mouse: vaxis.Mouse,
    
    /// Check if this is a quit event (Ctrl+C)
    pub fn isQuit(self: Event) bool {
        return switch (self) {
            .key_press => |key| key.matches('c', .{ .ctrl = true }),
            else => false,
        };
    }
    
    /// Check if this is an enter key press
    pub fn isEnter(self: Event) bool {
        return switch (self) {
            .key_press => |key| key.matches(vaxis.Key.enter, .{}),
            else => false,
        };
    }
};
