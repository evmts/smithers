const std = @import("std");
const vaxis = @import("vaxis");
const db = @import("../db.zig");
const md = @import("../markdown/parser.zig");
const Selection = @import("../selection.zig").Selection;
const Colors = @import("../layout.zig").Colors;

const user_bar_color = Colors.Indexed.USER_BAR;
const user_text_color = Colors.Indexed.USER_TEXT;
const assistant_text_color = Colors.Indexed.ASSISTANT_TEXT;
const system_text_color = Colors.Indexed.SYSTEM_TEXT;
const dim_color = Colors.Indexed.DIM;
const code_color = Colors.Indexed.CODE;
const heading_color = Colors.Indexed.HEADING;
const link_color = Colors.Indexed.LINK;
const quote_color = Colors.Indexed.QUOTE;
const selection_bg = Colors.Indexed.SELECTION_BG;

/// Chat history display component
pub const ChatHistory = struct {
    allocator: std.mem.Allocator,
    messages: []db.Message,
    scroll_offset: u16,
    /// Current selection state
    selection: Selection,
    /// Last rendered window for text extraction
    last_window: ?vaxis.Window,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .allocator = allocator,
            .messages = &[_]db.Message{},
            .scroll_offset = 0,
            .selection = Selection.init(),
            .last_window = null,
        };
    }

    pub fn deinit(self: *Self) void {
        self.freeMessages();
    }

    fn freeMessages(self: *Self) void {
        if (self.messages.len > 0) {
            db.DefaultDatabase.freeMessages(self.allocator, self.messages);
            self.messages = &[_]db.Message{};
        }
    }

    pub fn reload(self: *Self, database: *db.DefaultDatabase) !void {
        self.freeMessages();
        self.messages = try database.getMessages(self.allocator);
        self.scrollToBottom();
    }

    pub fn scrollUp(self: *Self, lines: u16) void {
        self.scroll_offset +|= lines;
    }

    pub fn scrollDown(self: *Self, lines: u16) void {
        self.scroll_offset -|= lines;
    }

    pub fn scrollToBottom(self: *Self) void {
        self.scroll_offset = 0;
    }

    /// Scroll up by one message (jumps to previous message boundary)
    pub fn scrollUpMessage(self: *Self, text_width: u16) void {
        if (self.messages.len == 0) return;
        
        // Find current message at top of view and scroll to previous
        var cumulative_height: u16 = 0;
        var i: usize = self.messages.len;
        while (i > 0) : (i -= 1) {
            const msg = self.messages[i - 1];
            const msg_height = countLines(msg.content, text_width) + 1;
            
            if (cumulative_height >= self.scroll_offset) {
                // This is the first visible message, scroll to show the one before it
                self.scroll_offset = cumulative_height + msg_height;
                return;
            }
            cumulative_height += msg_height;
        }
        // Already at top
        self.scroll_offset = cumulative_height;
    }

    /// Scroll down by one message
    pub fn scrollDownMessage(self: *Self, text_width: u16) void {
        if (self.messages.len == 0 or self.scroll_offset == 0) return;
        
        // Find message at current offset and scroll down by its height
        var cumulative_height: u16 = 0;
        var i: usize = self.messages.len;
        while (i > 0) : (i -= 1) {
            const msg = self.messages[i - 1];
            const msg_height = countLines(msg.content, text_width) + 1;
            cumulative_height += msg_height;
            
            if (cumulative_height >= self.scroll_offset) {
                // Scroll down to previous message boundary
                if (cumulative_height > msg_height) {
                    self.scroll_offset = cumulative_height - msg_height;
                } else {
                    self.scroll_offset = 0;
                }
                return;
            }
        }
        self.scroll_offset = 0;
    }

    /// Returns true if there are user or assistant messages (not just system messages)
    pub fn hasConversation(self: *const Self) bool {
        for (self.messages) |msg| {
            if (msg.role == .user or msg.role == .assistant) return true;
        }
        return false;
    }

    // === Selection methods ===

    pub fn startSelection(self: *Self, x: u16, y: u16) void {
        self.selection.start(x, y, self.scroll_offset);
    }

    pub fn updateSelection(self: *Self, x: u16, y: u16) void {
        self.selection.update(x, y, self.scroll_offset);
    }

    pub fn endSelection(self: *Self) void {
        self.selection.end();
    }

    pub fn clearSelection(self: *Self) void {
        self.selection.clear();
    }

    pub fn hasSelection(self: *const Self) bool {
        return self.selection.has_selection;
    }

    pub fn isSelecting(self: *const Self) bool {
        return self.selection.is_selecting;
    }

    /// Get selected text - extracts from stored last_window after draw
    pub fn getSelectedText(self: *Self) ?[]const u8 {
        if (!self.selection.has_selection) return null;
        if (self.last_window == null) return null;

        const win = self.last_window.?;
        // Get bounds in screen space
        const bounds = self.selection.getScreenBounds(self.scroll_offset);
        var result = std.ArrayListUnmanaged(u8){};

        // Iterate over visible rows only
        var row_i32: i32 = if (bounds.min_y < 0) 0 else bounds.min_y;
        while (row_i32 <= bounds.max_y and row_i32 < win.height) : (row_i32 += 1) {
            const row: u16 = @intCast(row_i32);
            var start_col: u16 = 0;
            var end_col: u16 = win.width;

            if (bounds.min_y == bounds.max_y) {
                start_col = bounds.min_x;
                end_col = bounds.max_x + 1;
            } else if (row_i32 == bounds.min_y) {
                const sel_start = if (self.selection.anchor_y <= self.selection.focus_y)
                    self.selection.anchor_x
                else
                    self.selection.focus_x;
                start_col = sel_start;
            } else if (row_i32 == bounds.max_y) {
                const sel_end = if (self.selection.anchor_y <= self.selection.focus_y)
                    self.selection.focus_x
                else
                    self.selection.anchor_x;
                end_col = sel_end + 1;
            }

            // Extract text from cells
            var col: u16 = start_col;
            while (col < end_col and col < win.width) : (col += 1) {
                if (win.readCell(col, row)) |cell| {
                    if (cell.char.grapheme.len > 0 and cell.char.grapheme[0] != 0) {
                        result.appendSlice(self.allocator, cell.char.grapheme) catch {};
                    }
                }
            }

            if (row_i32 < bounds.max_y) {
                result.append(self.allocator, '\n') catch {};
            }
        }

        if (result.items.len == 0) return null;
        return result.toOwnedSlice(self.allocator) catch null;
    }

    pub fn draw(self: *Self, win: vaxis.Window) void {
        // Store window for text extraction
        self.last_window = win;

        if (self.messages.len == 0) {
            const empty_msg = "No messages yet. Start chatting!";
            const msg_len: u16 = @intCast(empty_msg.len);
            const x: u16 = if (win.width > msg_len) (win.width - msg_len) / 2 else 0;
            const y: u16 = win.height / 2;
            
            const empty_win = win.child(.{
                .x_off = x,
                .y_off = y,
                .width = msg_len,
                .height = 1,
            });
            _ = empty_win.printSegment(.{
                .text = empty_msg,
                .style = .{ .fg = .{ .index = dim_color } },
            }, .{});
            return;
        }

        const text_width: u16 = if (win.width > 6) win.width - 6 else 1;
        
        // Render messages from bottom up
        var y: i32 = @as(i32, win.height) - 1 + @as(i32, self.scroll_offset);
        
        var i: usize = self.messages.len;
        while (i > 0) : (i -= 1) {
            const msg = self.messages[i - 1];
            
            const content_lines = self.getMessageHeight(msg, text_width);
            const msg_height: i32 = @as(i32, content_lines) + 1; // +1 for spacing
            
            y -= msg_height;
            
            // Skip if entirely above or below viewport
            if (y + msg_height <= 0) continue;
            if (y >= win.height) continue;
            
            // Calculate partial rendering params
            const skip_lines: u16 = if (y < 0) @intCast(-y) else 0;
            const win_y: u16 = if (y < 0) 0 else @intCast(y);
            self.drawMessage(win, msg, win_y, text_width, skip_lines);
        }

        // Apply selection highlighting as overlay
        if (self.selection.has_selection or self.selection.is_selecting) {
            self.applySelectionHighlight(win);
        }
    }

    /// Apply reverse video to selected cells
    fn applySelectionHighlight(self: *Self, win: vaxis.Window) void {
        // Get bounds in screen space (adjusted for current scroll)
        const content_bounds = self.selection.getBounds();
        const bounds = self.selection.getScreenBounds(self.scroll_offset);
        std.log.warn("applySelectionHighlight: scroll={d} content=({d},{d})-({d},{d}) screen=({d},{d})-({d},{d})", .{
            self.scroll_offset,
            content_bounds.min_x, content_bounds.min_y, content_bounds.max_x, content_bounds.max_y,
            bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y,
        });

        // Only process visible rows
        var row_i32: i32 = if (bounds.min_y < 0) 0 else bounds.min_y;
        while (row_i32 <= bounds.max_y and row_i32 < win.height) : (row_i32 += 1) {
            const row: u16 = @intCast(row_i32);
            var start_col: u16 = 0;
            var end_col: u16 = win.width;

            if (bounds.min_y == bounds.max_y) {
                // Single line
                start_col = bounds.min_x;
                end_col = bounds.max_x + 1;
            } else if (row_i32 == bounds.min_y) {
                // First line of multi-line
                const sel_start = if (self.selection.anchor_y <= self.selection.focus_y)
                    self.selection.anchor_x
                else
                    self.selection.focus_x;
                start_col = sel_start;
            } else if (row_i32 == bounds.max_y) {
                // Last line of multi-line
                const sel_end = if (self.selection.anchor_y <= self.selection.focus_y)
                    self.selection.focus_x
                else
                    self.selection.anchor_x;
                end_col = sel_end + 1;
            }

            var col: u16 = start_col;
            while (col < end_col and col < win.width) : (col += 1) {
                // Read current cell and apply reverse
                if (win.readCell(col, row)) |cell| {
                    var new_style = cell.style;
                    new_style.reverse = true;
                    new_style.bg = .{ .index = selection_bg };
                    win.writeCell(col, row, .{
                        .char = cell.char,
                        .style = new_style,
                    });
                }
            }
        }
    }

    fn drawMessage(self: *Self, win: vaxis.Window, msg: db.Message, y: u16, text_width: u16, skip_lines: u16) void {
        const content_lines = countLines(msg.content, text_width);
        
        switch (msg.role) {
            .user => {
                self.drawUserMessage(win, msg.content, y, text_width, content_lines, skip_lines);
            },
            .assistant => {
                self.drawMarkdownMessage(win, msg.content, y, text_width, skip_lines);
            },
            .system => {
                // Check if this is a tool-related message
                const is_tool_msg = msg.tool_name != null or std.mem.startsWith(u8, msg.content, "🔧");
                const is_read_file = if (msg.tool_name) |tn| std.mem.eql(u8, tn, "read_file") else false;
                const is_markdown = if (is_read_file) blk: {
                    if (msg.tool_input) |ti| {
                        break :blk std.mem.endsWith(u8, ti, ".md") or std.mem.endsWith(u8, ti, ".mdx");
                    }
                    break :blk false;
                } else false;

                if (is_markdown) {
                    self.drawMarkdownMessage(win, msg.content, y, text_width, skip_lines);
                } else if (is_read_file) {
                    // Non-markdown file: render with line numbers
                    self.drawCodeWithLineNumbers(win, msg.content, y, text_width, skip_lines);
                } else if (std.mem.indexOf(u8, msg.content, "\n") != null) {
                    // Multi-line: render with markdown like assistant
                    self.drawMarkdownMessage(win, msg.content, y, text_width, skip_lines);
                } else if (is_tool_msg) {
                    // Tool-related single line: left-aligned (skip if above viewport)
                    if (skip_lines == 0) {
                        const sys_win = win.child(.{
                            .x_off = 2,
                            .y_off = y,
                            .width = text_width,
                            .height = 1,
                        });
                        const style: vaxis.Style = .{ .fg = .{ .index = system_text_color } };
                        _ = sys_win.printSegment(.{ .text = msg.content, .style = style }, .{});
                    }
                } else {
                    // Single line status message: centered (skip if above viewport)
                    if (skip_lines == 0) {
                        const msg_len: u16 = @intCast(@min(msg.content.len, win.width -| 4));
                        const x_off: u16 = if (win.width > msg_len) (win.width - msg_len) / 2 else 2;

                        const sys_win = win.child(.{
                            .x_off = x_off,
                            .y_off = y,
                            .width = msg_len,
                            .height = 1,
                        });

                        const style: vaxis.Style = .{ .fg = .{ .index = system_text_color } };
                        _ = sys_win.printSegment(.{ .text = msg.content, .style = style }, .{});
                    }
                }
            },
        }
    }

    fn drawUserMessage(self: *Self, win: vaxis.Window, content: []const u8, y: u16, text_width: u16, content_lines: u16, skip_lines: u16) void {
        _ = self;
        const bar_style: vaxis.Style = .{ .fg = .{ .index = user_bar_color } };
        const text_style: vaxis.Style = .{ .fg = .{ .index = user_text_color } };

        // Draw vertical bar for visible lines only
        var row: u16 = skip_lines;
        while (row < content_lines) : (row += 1) {
            const win_row = y + row - skip_lines;
            if (win_row >= win.height) break;
            win.writeCell(2, win_row, .{
                .char = .{ .grapheme = "│", .width = 1 },
                .style = bar_style,
            });
        }

        // For partial rendering, we need to find the text that corresponds to visible lines
        // Use a child window that clips appropriately
        const visible_lines = content_lines -| skip_lines;
        if (visible_lines > 0) {
            const text_win = win.child(.{
                .x_off = 4,
                .y_off = y,
                .width = text_width,
                .height = @min(visible_lines, win.height -| y),
            });
            // Skip to the right starting point in text by counting wrapped lines
            const start_text = skipWrappedLines(content, text_width, skip_lines);
            _ = text_win.printSegment(.{ .text = start_text, .style = text_style }, .{ .wrap = .word });
        }
    }

    fn drawMarkdownMessage(self: *Self, win: vaxis.Window, content: []const u8, y: u16, text_width: u16, skip_lines: u16) void {
        // Trim trailing whitespace to avoid extra blank lines
        const trimmed = std.mem.trimRight(u8, content, " \t\n\r");
        var parser = md.MarkdownParser.init(self.allocator);
        var result = parser.parse(trimmed) catch {
            // Fallback to plain text on parse error
            const total_lines = countLines(content, text_width);
            const visible_lines = total_lines -| skip_lines;
            if (visible_lines > 0) {
                const text_win = win.child(.{
                    .x_off = 2,
                    .y_off = y,
                    .width = text_width + 2,
                    .height = @min(visible_lines, win.height -| y),
                });
                const start_text = skipWrappedLines(content, text_width, skip_lines);
                _ = text_win.printSegment(.{
                    .text = start_text,
                    .style = .{ .fg = .{ .index = assistant_text_color } },
                }, .{ .wrap = .word });
            }
            return;
        };
        defer result.deinit();

        var row: u16 = y;
        var line_idx: u16 = 0;
        for (result.lines) |line| {
            defer line_idx += 1;

            // Skip lines that are above viewport
            if (line_idx < skip_lines) continue;

            if (row >= win.height) break;

            // Calculate x offset based on line type
            var x_off: u16 = 2;
            var prefix: ?[]const u8 = null;
            var prefix_style: vaxis.Style = .{};

            switch (line.line_type) {
                .blockquote => {
                    prefix = "│ ";
                    prefix_style = .{ .fg = .{ .index = quote_color } };
                },
                .unordered_list => {
                    x_off += line.indent_level * 2;
                    prefix = "• ";
                    prefix_style = .{ .fg = .{ .index = assistant_text_color } };
                },
                .ordered_list => {
                    x_off += line.indent_level * 2;
                    prefix = "· ";
                    prefix_style = .{ .fg = .{ .index = assistant_text_color } };
                },
                .code_block => {
                    prefix = "  ";
                    prefix_style = .{};
                },
                .heading1, .heading2, .heading3, .heading4 => {
                    // Headings get no prefix but use heading color
                },
                .paragraph => {},
            }

            // Draw prefix if any
            if (prefix) |p| {
                const prefix_win = win.child(.{
                    .x_off = x_off,
                    .y_off = row,
                    .width = @intCast(p.len),
                    .height = 1,
                });
                _ = prefix_win.printSegment(.{ .text = p, .style = prefix_style }, .{});
                x_off += @intCast(p.len);
            }

            // Draw spans
            var col: u16 = x_off;
            for (line.spans) |span| {
                if (col >= win.width) break;

                const style = self.mdStyleToVaxis(span.style, line.line_type);
                const remaining_width = win.width -| col;
                const span_len: u16 = @intCast(@min(span.text.len, remaining_width));

                if (span_len > 0) {
                    const span_win = win.child(.{
                        .x_off = col,
                        .y_off = row,
                        .width = span_len,
                        .height = 1,
                    });
                    _ = span_win.printSegment(.{
                        .text = span.text[0..span_len],
                        .style = style,
                    }, .{});
                    col += span_len;
                }
            }
            row += 1;
        }
    }

    fn mdStyleToVaxis(self: *Self, style: md.Style, line_type: md.LineType) vaxis.Style {
        _ = self;
        var result: vaxis.Style = .{};

        // Set color based on style and line type
        if (style.color == md.Color.cyan) {
            result.fg = .{ .index = code_color };
        } else if (style.color == md.Color.blue) {
            result.fg = .{ .index = link_color };
        } else if (style.color == md.Color.green) {
            result.fg = .{ .index = quote_color };
        } else {
            // Default color based on line type
            result.fg = switch (line_type) {
                .heading1, .heading2, .heading3, .heading4 => .{ .index = heading_color },
                .code_block => .{ .index = code_color },
                .blockquote => .{ .index = quote_color },
                else => .{ .index = assistant_text_color },
            };
        }

        result.bold = style.bold;
        result.italic = style.italic;
        // Note: vaxis Style doesn't have underline, skip it

        return result;
    }

    fn drawCodeWithLineNumbers(self: *Self, win: vaxis.Window, content: []const u8, y: u16, text_width: u16, skip_lines: u16) void {
        _ = self;
        const line_num_width: u16 = 6; // "00001 " = 6 chars
        const code_width = if (text_width > line_num_width) text_width - line_num_width else 1;

        const line_num_style: vaxis.Style = .{ .fg = .{ .index = dim_color } };
        const code_style: vaxis.Style = .{ .fg = .{ .index = code_color } };

        var line_iter = std.mem.splitScalar(u8, content, '\n');
        var row: u16 = y;
        var line_num: usize = 1;
        var line_idx: u16 = 0;

        while (line_iter.next()) |line| {
            defer {
                line_num += 1;
                line_idx += 1;
            }

            // Skip lines that are above viewport
            if (line_idx < skip_lines) continue;

            if (row >= win.height) break;

            // Draw line number
            var num_buf: [8]u8 = undefined;
            const num_str = std.fmt.bufPrint(&num_buf, "{d:>5} ", .{line_num}) catch "     ";
            const num_win = win.child(.{
                .x_off = 2,
                .y_off = row,
                .width = line_num_width,
                .height = 1,
            });
            _ = num_win.printSegment(.{ .text = num_str, .style = line_num_style }, .{});

            // Draw code content
            const code_win = win.child(.{
                .x_off = 2 + line_num_width,
                .y_off = row,
                .width = code_width,
                .height = 1,
            });
            const display_line = if (line.len > code_width) line[0..code_width] else line;
            _ = code_win.printSegment(.{ .text = display_line, .style = code_style }, .{});

            row += 1;
        }
    }

    fn getMessageHeight(self: *Self, msg: db.Message, text_width: u16) u16 {
        // Determine if this message uses markdown rendering
        const uses_markdown = switch (msg.role) {
            .assistant => true,
            .system => blk: {
                const is_read_file = if (msg.tool_name) |tn| std.mem.eql(u8, tn, "read_file") else false;
                if (is_read_file) {
                    if (msg.tool_input) |ti| {
                        break :blk std.mem.endsWith(u8, ti, ".md") or std.mem.endsWith(u8, ti, ".mdx");
                    }
                }
                // Multi-line system messages also use markdown
                break :blk std.mem.indexOf(u8, msg.content, "\n") != null and msg.tool_name == null;
            },
            .user => false,
        };

        if (uses_markdown) {
            // Trim trailing whitespace to match rendering behavior
            const trimmed = std.mem.trimRight(u8, msg.content, " \t\n\r");
            var parser = md.MarkdownParser.init(self.allocator);
            var result = parser.parse(trimmed) catch {
                return countLines(msg.content, text_width);
            };
            defer result.deinit();
            return @intCast(result.lines.len);
        }

        return countLines(msg.content, text_width);
    }

    fn countLines(text: []const u8, width: u16) u16 {
        if (width == 0) return 1;
        if (text.len == 0) return 1;

        // Trim trailing newlines to match markdown parser behavior
        var trimmed = text;
        while (trimmed.len > 0 and trimmed[trimmed.len - 1] == '\n') {
            trimmed = trimmed[0 .. trimmed.len - 1];
        }
        if (trimmed.len == 0) return 1;

        var lines: u16 = 1;
        var col: u16 = 0;

        for (trimmed) |c| {
            if (c == '\n') {
                lines += 1;
                col = 0;
            } else {
                col += 1;
                if (col >= width) {
                    lines += 1;
                    col = 0;
                }
            }
        }

        return lines;
    }

    /// Skip N wrapped lines and return the remaining text
    fn skipWrappedLines(text: []const u8, width: u16, skip: u16) []const u8 {
        if (width == 0 or skip == 0) return text;
        if (text.len == 0) return text;

        var lines_skipped: u16 = 0;
        var col: u16 = 0;
        var i: usize = 0;

        while (i < text.len and lines_skipped < skip) {
            const c = text[i];
            if (c == '\n') {
                lines_skipped += 1;
                col = 0;
                i += 1;
            } else {
                col += 1;
                i += 1;
                if (col >= width) {
                    lines_skipped += 1;
                    col = 0;
                }
            }
        }

        return if (i < text.len) text[i..] else "";
    }
};
