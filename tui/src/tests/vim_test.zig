const std = @import("std");
const vim_mod = @import("../editor/vim.zig");

const Vim = vim_mod.Vim;
const Mode = vim_mod.Mode;
const MoveDir = vim_mod.MoveDir;
const NormalResult = vim_mod.NormalResult;

// ============================================================================
// Mode.label tests
// ============================================================================

test "Mode.label - normal mode returns NORMAL" {
    try std.testing.expectEqualStrings("NORMAL", Mode.normal.label());
}

test "Mode.label - insert mode returns INSERT" {
    try std.testing.expectEqualStrings("INSERT", Mode.insert.label());
}

// ============================================================================
// Vim initialization tests
// ============================================================================

test "Vim default state - starts in insert mode" {
    const vim = Vim{};
    try std.testing.expect(vim.isInsert());
    try std.testing.expect(!vim.isNormal());
    try std.testing.expectEqual(Mode.insert, vim.mode);
}

test "Vim default state - no pending g" {
    const vim = Vim{};
    try std.testing.expect(!vim.pending_g);
}

// ============================================================================
// Mode switching tests
// ============================================================================

test "Vim enterNormal switches to normal mode" {
    var vim = Vim{};
    try std.testing.expect(vim.isInsert());

    vim.enterNormal();
    try std.testing.expect(vim.isNormal());
    try std.testing.expect(!vim.isInsert());
    try std.testing.expectEqual(Mode.normal, vim.mode);
}

test "Vim enterInsert switches to insert mode" {
    var vim = Vim{};
    vim.enterNormal();
    try std.testing.expect(vim.isNormal());

    vim.enterInsert();
    try std.testing.expect(vim.isInsert());
    try std.testing.expect(!vim.isNormal());
    try std.testing.expectEqual(Mode.insert, vim.mode);
}

test "Vim enterNormal clears pending_g" {
    var vim = Vim{};
    vim.enterNormal();
    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    vim.enterNormal();
    try std.testing.expect(!vim.pending_g);
}

test "Vim enterInsert clears pending_g" {
    var vim = Vim{};
    vim.enterNormal();
    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    vim.enterInsert();
    try std.testing.expect(!vim.pending_g);
}

test "Vim mode switching round trip" {
    var vim = Vim{};
    try std.testing.expect(vim.isInsert());

    vim.enterNormal();
    try std.testing.expect(vim.isNormal());

    vim.enterInsert();
    try std.testing.expect(vim.isInsert());

    vim.enterNormal();
    try std.testing.expect(vim.isNormal());
}

// ============================================================================
// Insert mode entry keys tests
// ============================================================================

test "Vim processNormal 'i' returns insert" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('i');
    try std.testing.expectEqual(NormalResult.insert, result);
}

test "Vim processNormal 'a' returns append" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('a');
    try std.testing.expectEqual(NormalResult.append, result);
}

test "Vim processNormal 'A' returns move to line_end" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('A');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.line_end, result.move);
}

test "Vim processNormal 'I' returns move to first_non_blank" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('I');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.first_non_blank, result.move);
}

// ============================================================================
// Movement keys tests
// ============================================================================

test "Vim processNormal 'h' returns move left" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('h');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.left, result.move);
}

test "Vim processNormal 'j' returns move down" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('j');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.down, result.move);
}

test "Vim processNormal 'k' returns move up" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('k');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.up, result.move);
}

test "Vim processNormal 'l' returns move right" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('l');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.right, result.move);
}

test "Vim processNormal '0' returns move to line_start" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('0');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.line_start, result.move);
}

test "Vim processNormal '$' returns move to line_end" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('$');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.line_end, result.move);
}

test "Vim processNormal '^' returns move to first_non_blank" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('^');
    try std.testing.expect(result == .move);
    try std.testing.expectEqual(MoveDir.first_non_blank, result.move);
}

// ============================================================================
// Word movement tests
// ============================================================================

test "Vim processNormal 'w' returns word_forward" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('w');
    try std.testing.expectEqual(NormalResult.word_forward, result);
}

test "Vim processNormal 'W' returns word_forward" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('W');
    try std.testing.expectEqual(NormalResult.word_forward, result);
}

test "Vim processNormal 'b' returns word_backward" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('b');
    try std.testing.expectEqual(NormalResult.word_backward, result);
}

test "Vim processNormal 'B' returns word_backward" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('B');
    try std.testing.expectEqual(NormalResult.word_backward, result);
}

// ============================================================================
// Editing commands tests
// ============================================================================

test "Vim processNormal 'x' returns delete_char" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('x');
    try std.testing.expectEqual(NormalResult.delete_char, result);
}

test "Vim processNormal 'D' returns delete_to_end" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('D');
    try std.testing.expectEqual(NormalResult.delete_to_end, result);
}

test "Vim processNormal 'u' returns undo" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('u');
    try std.testing.expectEqual(NormalResult.undo, result);
}

test "Vim processNormal 'p' returns yank" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('p');
    try std.testing.expectEqual(NormalResult.yank, result);
}

test "Vim processNormal 'J' returns join_lines" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('J');
    try std.testing.expectEqual(NormalResult.join_lines, result);
}

test "Vim processNormal Ctrl+R (0x12) returns redo" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal(0x12);
    try std.testing.expectEqual(NormalResult.redo, result);
}

// ============================================================================
// Navigation commands tests
// ============================================================================

test "Vim processNormal 'G' returns goto_last" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal('G');
    try std.testing.expectEqual(NormalResult.goto_last, result);
}

test "Vim processNormal 'gg' sequence returns goto_first" {
    var vim = Vim{};
    vim.enterNormal();

    const first_g = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.unhandled, first_g);
    try std.testing.expect(vim.pending_g);

    const second_g = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.goto_first, second_g);
    try std.testing.expect(!vim.pending_g);
}

test "Vim pending_g cancelled by other key" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    const result = vim.processNormal('x');
    try std.testing.expectEqual(NormalResult.unhandled, result);
    try std.testing.expect(!vim.pending_g);
}

test "Vim pending_g cancelled by movement key" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    const result = vim.processNormal('j');
    try std.testing.expectEqual(NormalResult.unhandled, result);
    try std.testing.expect(!vim.pending_g);
}

test "Vim pending_g cancelled by insert key" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    const result = vim.processNormal('i');
    try std.testing.expectEqual(NormalResult.unhandled, result);
    try std.testing.expect(!vim.pending_g);
}

test "Vim pending_g cancelled by escape" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    const result = vim.processNormal(0x1B);
    try std.testing.expectEqual(NormalResult.unhandled, result);
    try std.testing.expect(!vim.pending_g);
}

// ============================================================================
// Escape key tests
// ============================================================================

test "Vim processNormal escape (0x1B) returns escape" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal(0x1B);
    try std.testing.expectEqual(NormalResult.escape, result);
}

// ============================================================================
// Unhandled keys tests
// ============================================================================

test "Vim processNormal unknown key returns unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('q'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('z'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('n'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('m'));
}

test "Vim processNormal digit keys (except 0) return unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('1'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('2'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('9'));
}

test "Vim processNormal symbols return unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('!'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('@'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('#'));
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal('%'));
}

test "Vim processNormal unicode codepoints return unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x1F600)); // emoji
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x4E2D)); // chinese character
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x00E9)); // é
}

test "Vim processNormal control characters (except Ctrl+R) return unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x01)); // Ctrl+A
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x02)); // Ctrl+B
    try std.testing.expectEqual(NormalResult.unhandled, vim.processNormal(0x03)); // Ctrl+C
}

// ============================================================================
// State consistency tests
// ============================================================================

test "Vim mode does not change after processNormal" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('i');
    try std.testing.expect(vim.isNormal());

    _ = vim.processNormal('a');
    try std.testing.expect(vim.isNormal());

    _ = vim.processNormal('h');
    try std.testing.expect(vim.isNormal());
}

test "Vim multiple gg sequences work correctly" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    var result = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.goto_first, result);

    _ = vim.processNormal('g');
    result = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.goto_first, result);

    _ = vim.processNormal('g');
    result = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.goto_first, result);
}

test "Vim interleaved pending_g and mode switch" {
    var vim = Vim{};
    vim.enterNormal();

    _ = vim.processNormal('g');
    try std.testing.expect(vim.pending_g);

    vim.enterInsert();
    try std.testing.expect(!vim.pending_g);

    vim.enterNormal();
    try std.testing.expect(!vim.pending_g);

    _ = vim.processNormal('g');
    const result = vim.processNormal('g');
    try std.testing.expectEqual(NormalResult.goto_first, result);
}

// ============================================================================
// Boundary condition tests
// ============================================================================

test "Vim processNormal null codepoint returns unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal(0);
    try std.testing.expectEqual(NormalResult.unhandled, result);
}

test "Vim processNormal max u21 codepoint returns unhandled" {
    var vim = Vim{};
    vim.enterNormal();

    const result = vim.processNormal(std.math.maxInt(u21));
    try std.testing.expectEqual(NormalResult.unhandled, result);
}

// ============================================================================
// NormalResult union tag tests
// ============================================================================

test "NormalResult move variant contains correct MoveDir" {
    var vim = Vim{};
    vim.enterNormal();

    const dirs = [_]struct { key: u21, expected: MoveDir }{
        .{ .key = 'h', .expected = .left },
        .{ .key = 'j', .expected = .down },
        .{ .key = 'k', .expected = .up },
        .{ .key = 'l', .expected = .right },
        .{ .key = '0', .expected = .line_start },
        .{ .key = '$', .expected = .line_end },
        .{ .key = '^', .expected = .first_non_blank },
    };

    for (dirs) |d| {
        const result = vim.processNormal(d.key);
        try std.testing.expect(result == .move);
        try std.testing.expectEqual(d.expected, result.move);
    }
}

// ============================================================================
// All handled keys enumeration test
// ============================================================================

test "Vim all handled keys return expected results" {
    var vim = Vim{};
    vim.enterNormal();

    const expected = [_]struct { key: u21, tag: std.meta.Tag(NormalResult) }{
        .{ .key = 'i', .tag = .insert },
        .{ .key = 'a', .tag = .append },
        .{ .key = 'A', .tag = .move },
        .{ .key = 'I', .tag = .move },
        .{ .key = 'h', .tag = .move },
        .{ .key = 'j', .tag = .move },
        .{ .key = 'k', .tag = .move },
        .{ .key = 'l', .tag = .move },
        .{ .key = '0', .tag = .move },
        .{ .key = '$', .tag = .move },
        .{ .key = '^', .tag = .move },
        .{ .key = 'w', .tag = .word_forward },
        .{ .key = 'W', .tag = .word_forward },
        .{ .key = 'b', .tag = .word_backward },
        .{ .key = 'B', .tag = .word_backward },
        .{ .key = 'x', .tag = .delete_char },
        .{ .key = 'D', .tag = .delete_to_end },
        .{ .key = 'u', .tag = .undo },
        .{ .key = 'p', .tag = .yank },
        .{ .key = 'J', .tag = .join_lines },
        .{ .key = 'G', .tag = .goto_last },
        .{ .key = 0x12, .tag = .redo },
        .{ .key = 0x1B, .tag = .escape },
    };

    for (expected) |e| {
        const result = vim.processNormal(e.key);
        try std.testing.expectEqual(e.tag, std.meta.activeTag(result));
    }
}
