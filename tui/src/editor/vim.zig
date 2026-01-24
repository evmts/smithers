// Vim-like modal editing
// Manages mode state and normal mode key mappings

const std = @import("std");

pub const Mode = enum {
    normal,
    insert,

    pub fn label(self: Mode) []const u8 {
        return switch (self) {
            .normal => "NORMAL",
            .insert => "INSERT",
        };
    }
};

/// Result of processing a key in normal mode
pub const NormalResult = union(enum) {
    /// Switch to insert mode
    insert,
    /// Switch to insert mode after moving right (append)
    append,
    /// Move cursor
    move: MoveDir,
    /// Delete character at cursor
    delete_char,
    /// Delete to end of line
    delete_to_end,
    /// Delete word backward
    delete_word,
    /// Replace char (enters replace-one mode, not implemented yet)
    replace,
    /// Undo
    undo,
    /// Redo
    redo,
    /// Yank/paste
    yank,
    /// Join lines (J)
    join_lines,
    /// Go to first line (gg)
    goto_first,
    /// Go to last line (G)
    goto_last,
    /// Word forward
    word_forward,
    /// Word backward
    word_backward,
    /// Key not handled
    unhandled,
    /// Escape in normal mode (app should handle - e.g., abort)
    escape,
};

pub const MoveDir = enum {
    left,
    down,
    up,
    right,
    line_start,
    line_end,
    first_non_blank,
};

/// Vim mode state machine
pub const Vim = struct {
    mode: Mode = .insert, // Start in insert mode (like Pi)
    pending_g: bool = false, // Waiting for second 'g' in 'gg'

    const Self = @This();

    /// Process a key in normal mode
    /// Returns the action to take
    pub fn processNormal(self: *Self, codepoint: u21) NormalResult {
        // Handle pending 'g' for 'gg'
        if (self.pending_g) {
            self.pending_g = false;
            if (codepoint == 'g') {
                return .goto_first;
            }
            // 'g' followed by something else - ignore both
            return .unhandled;
        }

        return switch (codepoint) {
            // Mode switching
            'i' => .insert,
            'a' => .append,
            'A' => {
                // Append at end of line: move to end, then insert
                return .{ .move = .line_end };
            },
            'I' => {
                // Insert at first non-blank
                return .{ .move = .first_non_blank };
            },

            // Movement
            'h' => .{ .move = .left },
            'j' => .{ .move = .down },
            'k' => .{ .move = .up },
            'l' => .{ .move = .right },
            '0' => .{ .move = .line_start },
            '$' => .{ .move = .line_end },
            '^' => .{ .move = .first_non_blank },

            // Word movement
            'w', 'W' => .word_forward,
            'b', 'B' => .word_backward,

            // Editing
            'x' => .delete_char,
            'D' => .delete_to_end,
            'u' => .undo,
            'p' => .yank,
            'J' => .join_lines,

            // Navigation
            'g' => {
                self.pending_g = true;
                return .unhandled;
            },
            'G' => .goto_last,

            // Ctrl+R for redo (0x12)
            0x12 => .redo,

            // Escape in normal mode
            0x1B => .escape,

            else => .unhandled,
        };
    }

    /// Switch to insert mode
    pub fn enterInsert(self: *Self) void {
        self.mode = .insert;
        self.pending_g = false;
    }

    /// Switch to normal mode
    pub fn enterNormal(self: *Self) void {
        self.mode = .normal;
        self.pending_g = false;
    }

    /// Check if in insert mode
    pub fn isInsert(self: *const Self) bool {
        return self.mode == .insert;
    }

    /// Check if in normal mode
    pub fn isNormal(self: *const Self) bool {
        return self.mode == .normal;
    }
};

// ============ Tests ============

test "Vim mode switching" {
    var vim = Vim{};

    // Starts in insert mode
    try std.testing.expect(vim.isInsert());

    // Escape to normal
    vim.enterNormal();
    try std.testing.expect(vim.isNormal());

    // 'i' to insert
    const result = vim.processNormal('i');
    try std.testing.expect(result == .insert);
}

test "Vim movement keys" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expect(vim.processNormal('h') == .{ .move = .left });
    try std.testing.expect(vim.processNormal('j') == .{ .move = .down });
    try std.testing.expect(vim.processNormal('k') == .{ .move = .up });
    try std.testing.expect(vim.processNormal('l') == .{ .move = .right });
    try std.testing.expect(vim.processNormal('0') == .{ .move = .line_start });
    try std.testing.expect(vim.processNormal('$') == .{ .move = .line_end });
}

test "Vim gg sequence" {
    var vim = Vim{};
    vim.enterNormal();

    // First 'g' sets pending
    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    // Second 'g' triggers goto_first
    const result = vim.processNormal('g');
    try std.testing.expect(result == .goto_first);
    try std.testing.expect(!vim.pending_g);
}

test "Vim pending g cancelled" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    // Different key cancels pending
    _ = vim.processNormal('x');
    try std.testing.expect(!vim.pending_g);
}
