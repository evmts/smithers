const vaxis = @import("vaxis");

// Layout constants used throughout the TUI
pub const HEADER_HEIGHT = 3;
pub const STATUS_HEIGHT = 1;
pub const MIN_INPUT_HEIGHT = 3;

// Color scheme
pub const Colors = struct {
    pub const primary = vaxis.Color.rgb(100, 149, 237);
    pub const secondary = vaxis.Color.rgb(128, 128, 128);
    pub const success = vaxis.Color.rgb(34, 139, 34);
    pub const warning = vaxis.Color.rgb(255, 165, 0);
    pub const error = vaxis.Color.rgb(220, 20, 60);
    pub const background = vaxis.Color.rgb(24, 24, 37);
    pub const text = vaxis.Color.rgb(202, 211, 245);
    pub const muted = vaxis.Color.rgb(147, 153, 178);
};

// Layout helper functions
pub fn calculateChatHeight(total_height: u16) u16 {
    const available = total_height - HEADER_HEIGHT - STATUS_HEIGHT - MIN_INPUT_HEIGHT;
    return @max(1, available);
}

pub fn calculateInputHeight(total_height: u16, desired_input_height: u16) u16 {
    const max_input = total_height - HEADER_HEIGHT - STATUS_HEIGHT - 1; // Leave at least 1 row for chat
    return @min(desired_input_height, max_input);
}