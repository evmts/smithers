/// Layout constants and styling for the TUI
pub const Layout = struct {
    /// Chat input area height
    pub const INPUT_HEIGHT = 5;
    
    /// Header height  
    pub const HEADER_HEIGHT = 1;
    
    /// Status bar height
    pub const STATUS_HEIGHT = 1;
    
    /// Minimum terminal width required
    pub const MIN_WIDTH = 80;
    
    /// Minimum terminal height required  
    pub const MIN_HEIGHT = 24;
    
    /// Chat history top margin
    pub const CHAT_TOP_MARGIN = 1;
    
    /// Chat history side margins
    pub const CHAT_SIDE_MARGIN = 2;
    
    /// Input field padding
    pub const INPUT_PADDING = 1;
    
    /// Maximum width for chat messages (responsive)
    pub fn maxChatWidth(terminal_width: u16) u16 {
        return @min(terminal_width - (CHAT_SIDE_MARGIN * 2), 120);
    }
    
    /// Calculate chat history area height
    pub fn chatHistoryHeight(terminal_height: u16) u16 {
        return terminal_height - INPUT_HEIGHT - HEADER_HEIGHT - STATUS_HEIGHT - CHAT_TOP_MARGIN;
    }
};

/// Color scheme for the application (generic over Renderer)
pub fn Colors(comptime R: type) type {
    return struct {
        pub const PRIMARY = R.Color{ .rgb = .{ 0x88, 0x99, 0xAA } };
        pub const SECONDARY = R.Color{ .rgb = .{ 0x66, 0x77, 0x88 } };
        pub const SUCCESS = R.Color{ .rgb = .{ 0x55, 0xAA, 0x55 } };
        pub const ERROR = R.Color{ .rgb = .{ 0xDD, 0x55, 0x55 } };
        pub const WARNING = R.Color{ .rgb = .{ 0xFF, 0xBB, 0x33 } };
        pub const MUTED = R.Color{ .rgb = .{ 0x55, 0x55, 0x55 } };
        pub const BACKGROUND = R.Color{ .rgb = .{ 0x1A, 0x1A, 0x1A } };
        pub const FOREGROUND = R.Color{ .rgb = .{ 0xCC, 0xCC, 0xCC } };
        
        // Chat-specific colors
        pub const USER_MESSAGE = R.Color{ .rgb = .{ 0x77, 0xAA, 0xFF } };
        pub const ASSISTANT_MESSAGE = R.Color{ .rgb = .{ 0xAA, 0xFF, 0x77 } };
        pub const SYSTEM_MESSAGE = R.Color{ .rgb = .{ 0xFF, 0xAA, 0x77 } };
        pub const TOOL_MESSAGE = R.Color{ .rgb = .{ 0xFF, 0x77, 0xAA } };

        // ANSI 256 indexed colors for terminal rendering
        pub const Indexed = struct {
            // Chat history colors
            pub const USER_BAR: u8 = 10;
            pub const USER_TEXT: u8 = 10;
            pub const ASSISTANT_TEXT: u8 = 15;
            pub const SYSTEM_TEXT: u8 = 214;
            pub const DIM: u8 = 243;
            pub const CODE: u8 = 14;
            pub const HEADING: u8 = 75;
            pub const LINK: u8 = 12;
            pub const QUOTE: u8 = 2;
            pub const SELECTION_BG: u8 = 24;

            // Header colors
            pub const HEADER_BG: u8 = 235;
            pub const TITLE: u8 = 75;
            pub const SEPARATOR: u8 = 243;
            pub const MODEL: u8 = 114;
            pub const TAB: u8 = 252;
            pub const TAB_ACTIVE: u8 = 75;
            pub const TAB_BG_ACTIVE: u8 = 238;

            // Status bar colors
            pub const STATUS_BG: u8 = 236;
            pub const STATUS_FG: u8 = 252;
            pub const KEY_HINT: u8 = 75;
            pub const SPINNER: u8 = 114;
        };
    };
}

/// Style presets for common UI elements (generic over Renderer)
pub fn Styles(comptime R: type) type {
    const C = Colors(R);
    return struct {
        pub const header = R.Style{
            .fg = C.FOREGROUND,
            .bg = C.PRIMARY,
            .bold = true,
        };
        
        pub const status_bar = R.Style{
            .fg = C.FOREGROUND,
            .bg = C.SECONDARY,
        };
        
        pub const input_active = R.Style{
            .fg = C.FOREGROUND,
            .bg = C.BACKGROUND,
            .ul_style = .single,
        };
        
        pub const input_inactive = R.Style{
            .fg = C.MUTED,
            .bg = C.BACKGROUND,
        };
        
        pub const user_message = R.Style{
            .fg = C.USER_MESSAGE,
            .bold = true,
        };
        
        pub const assistant_message = R.Style{
            .fg = C.ASSISTANT_MESSAGE,
        };
        
        pub const system_message = R.Style{
            .fg = C.SYSTEM_MESSAGE,
            .italic = true,
        };
        
        pub const tool_message = R.Style{
            .fg = C.TOOL_MESSAGE,
            .dim = true,
        };
        
        pub const error_message = R.Style{
            .fg = C.ERROR,
            .bold = true,
        };
        
        pub const loading = R.Style{
            .fg = C.WARNING,
            .dim = true,
        };
    };
}
