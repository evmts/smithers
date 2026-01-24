const DefaultRenderer = @import("rendering/renderer.zig").DefaultRenderer;

/// Generic Event type parameterized by Renderer
pub fn Event(comptime R: type) type {
    return union(enum) {
        key_press: R.Key,
        winsize: R.Winsize,
        mouse: R.Mouse,

        /// Check if this is a quit event (Ctrl+C)
        pub fn isQuit(self: @This()) bool {
            return switch (self) {
                .key_press => |key| key.matches('c', .{ .ctrl = true }),
                else => false,
            };
        }

        /// Check if this is an enter key press
        pub fn isEnter(self: @This()) bool {
            return switch (self) {
                .key_press => |key| key.matches(R.Key.enter, .{}),
                else => false,
            };
        }
    };
}

/// Default event type using DefaultRenderer
pub const DefaultEvent = Event(DefaultRenderer);
