const std = @import("std");
const db = @import("../db.zig");
const md = @import("../markdown/parser.zig");
const selection_mod = @import("../selection.zig");
const clipboard_mod = @import("../clipboard.zig");
const layout = @import("../layout.zig");

/// Generic chat history display component
pub fn ChatHistory(comptime R: type) type {
    const Colors = layout.Colors(R);
    const Selection = selection_mod.Selection(clipboard_mod.Clipboard(clipboard_mod.SystemClipboard));

    const user_bar_color = Colors.Indexed.USER_BAR;
    const user_text_color = Colors.Indexed.USER_TEXT;
    const assistant_text_color = Colors.Indexed.ASSISTANT_TEXT;
    const system_text_color = Colors.Indexed.SYSTEM_TEXT;
    const dim_color = Colors.Indexed.DIM;
    const pending_color = Colors.Indexed.DIM; // Gray for pending messages
    const code_color = Colors.Indexed.CODE;
    const heading_color = Colors.Indexed.HEADING;
    const link_color = Colors.Indexed.LINK;
    const quote_color = Colors.Indexed.QUOTE;
    const selection_bg = Colors.Indexed.SELECTION_BG;
    return struct {
        allocator: std.mem.Allocator,
        messages: []db.Message,
        scroll_offset: u16,
        /// Current selection state
        selection: Selection,
        /// Last rendered renderer for text extraction
        last_renderer: ?R,

        const Self = @This();

        pub fn init(allocator: std.mem.Allocator) Self {
            return .{
                .allocator = allocator,
                .messages = &[_]db.Message{},
                .scroll_offset = 0,
                .selection = Selection.init(),
                .last_renderer = null,
            };
        }

        pub fn deinit(self: *Self) void {
            self.freeMessages();
        }

        fn freeMessages(self: *Self) void {
            if (self.messages.len > 0) {
                freeMessagesSlice(self.allocator, self.messages);
                self.messages = &[_]db.Message{};
            }
        }

        pub fn reload(self: *Self, database: anytype) !void {
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

        /// Get selected text - extracts from stored last_renderer after draw
        pub fn getSelectedText(self: *Self) ?[]const u8 {
            if (!self.selection.has_selection) return null;
            if (self.last_renderer == null) return null;

            const renderer = self.last_renderer.?;
            const win = renderer.window;
            // Get bounds in screen space
            const bounds = self.selection.getScreenBounds(self.scroll_offset);
            var result = std.ArrayListUnmanaged(u8){};

            // Iterate over visible rows only
            var row_i32: i32 = if (bounds.min_y < 0) 0 else bounds.min_y;
            while (row_i32 <= bounds.max_y and row_i32 < renderer.height()) : (row_i32 += 1) {
                const row: u16 = @intCast(row_i32);
                var start_col: u16 = 0;
                var end_col: u16 = renderer.width();

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

                // Extract text from cells (use underlying window for readCell)
                var col: u16 = start_col;
                while (col < end_col and col < renderer.width()) : (col += 1) {
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

        pub fn draw(self: *Self, renderer: R) void {
            // Store renderer for text extraction
            self.last_renderer = renderer;

            if (self.messages.len == 0) {
                const empty_msg = "No messages yet. Start chatting!";
                const msg_len: u16 = @intCast(empty_msg.len);
                const x: u16 = if (renderer.width() > msg_len) (renderer.width() - msg_len) / 2 else 0;
                const y: u16 = renderer.height() / 2;
                
                renderer.drawText(x, y, empty_msg, .{ .fg = .{ .index = dim_color } });
                return;
            }

            const text_width: u16 = if (renderer.width() > 6) renderer.width() - 6 else 1;
            
            // Render messages from bottom up
            var y: i32 = @as(i32, renderer.height()) - 1 + @as(i32, self.scroll_offset);
            
            var i: usize = self.messages.len;
            while (i > 0) : (i -= 1) {
                const msg = self.messages[i - 1];
                
                const content_lines = self.getMessageHeight(msg, text_width);
                const msg_height: i32 = @as(i32, content_lines) + 1; // +1 for spacing
                
                y -= msg_height;
                
                // Skip if entirely above or below viewport
                if (y + msg_height <= 0) continue;
                if (y >= renderer.height()) continue;
                
                // Calculate partial rendering params
                const skip_lines: u16 = if (y < 0) @intCast(-y) else 0;
                const win_y: u16 = if (y < 0) 0 else @intCast(y);
                self.drawMessage(renderer, msg, win_y, text_width, skip_lines);
            }

            // Apply selection highlighting as overlay
            if (self.selection.has_selection or self.selection.is_selecting) {
                self.applySelectionHighlight(renderer);
            }
        }

        /// Apply reverse video to selected cells
        fn applySelectionHighlight(self: *Self, renderer: R) void {
            const bounds = self.selection.getScreenBounds(self.scroll_offset);

            // Apply overlay to window
            var row_i32: i32 = if (bounds.min_y < 0) 0 else bounds.min_y;
            while (row_i32 <= bounds.max_y and row_i32 < renderer.height()) : (row_i32 += 1) {
                const row: u16 = @intCast(row_i32);
                var start_col: u16 = 0;
                var end_col: u16 = renderer.width();

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

                // Use window directly for cell modification
                const win = renderer.window;
                var col: u16 = start_col;
                while (col < end_col and col < renderer.width()) : (col += 1) {
                    if (win.readCell(col, row)) |cell| {
                        var new_style = cell.style;
                        new_style.bg = .{ .index = selection_bg };
                        win.writeCell(col, row, .{
                            .char = cell.char,
                            .style = new_style,
                        });
                    }
                }
            }
        }

        fn drawMessage(self: *Self, renderer: R, msg: db.Message, y: u16, text_width: u16, skip_lines: u16) void {
            const content = msg.content;
            const content_lines = self.getMessageHeight(msg, text_width);
            const is_pending = msg.status == .pending;

            switch (msg.role) {
                .user => self.drawUserMessage(renderer, content, y, content_lines, text_width, skip_lines, is_pending),
                .assistant => self.drawMarkdownMessage(renderer, content, y, text_width, skip_lines),
                .system => {
                    // Check if this is a read_file result for markdown
                    const is_read_file = if (msg.tool_name) |tn| std.mem.eql(u8, tn, "read_file") else false;
                    const is_markdown = if (is_read_file) blk: {
                        if (msg.tool_input) |ti| {
                            break :blk std.mem.endsWith(u8, ti, ".md") or std.mem.endsWith(u8, ti, ".mdx");
                        }
                        break :blk false;
                    } else false;

                    // Multi-line system messages (not tool results) also use markdown
                    const multi_line = std.mem.indexOf(u8, content, "\n") != null and msg.tool_name == null;

                    if (is_markdown or multi_line) {
                        self.drawMarkdownMessage(renderer, content, y, text_width, skip_lines);
                    } else if (msg.tool_name != null) {
                        // Code output (tool results)
                        self.drawCodeWithLineNumbers(renderer, content, y, text_width, skip_lines);
                    } else {
                        self.drawSystemMessage(renderer, content, y, text_width, skip_lines);
                    }
                },
            }
        }

        fn drawSystemMessage(self: *Self, renderer: R, content: []const u8, y: u16, text_width: u16, skip_lines: u16) void {
            _ = self;
            const content_lines = countLines(content, text_width);
            const visible_lines = content_lines -| skip_lines;
            if (visible_lines > 0) {
                // Center system messages
                const msg_len: u16 = @intCast(@min(content.len, text_width));
                const x_off: u16 = if (text_width > msg_len) (text_width - msg_len) / 2 + 2 else 2;
                const text_renderer = renderer.subRegion(x_off, y, msg_len, @min(visible_lines, renderer.height() -| y));
                _ = text_renderer.window.printSegment(.{ .text = content, .style = .{ .fg = .{ .index = system_text_color } } }, .{});
            }
        }

        fn drawUserMessage(self: *Self, renderer: R, content: []const u8, y: u16, content_lines: u16, text_width: u16, skip_lines: u16, is_pending: bool) void {
            _ = self;
            // Pending messages render in gray
            const bar_style: R.Style = .{ .fg = .{ .index = if (is_pending) pending_color else user_bar_color } };
            const text_style: R.Style = .{ .fg = .{ .index = if (is_pending) pending_color else user_text_color } };

            const visible_lines = content_lines -| skip_lines;
            const draw_height = @min(visible_lines, renderer.height() -| y);

            // Draw bar for visible portion (dashed for pending)
            const bar_char: []const u8 = if (is_pending) "┊" else "│";
            for (0..draw_height) |row| {
                renderer.drawCell(2, y + @as(u16, @intCast(row)), bar_char, bar_style);
            }

            // Use a sub-renderer that clips appropriately
            if (visible_lines > 0) {
                const text_renderer = renderer.subRegion(4, y, text_width, @min(visible_lines, renderer.height() -| y));
                // Skip to the right starting point in text by counting wrapped lines
                const start_text = skipWrappedLines(content, text_width, skip_lines);
                // For word wrapping, use underlying window's printSegment
                _ = text_renderer.window.printSegment(.{ .text = start_text, .style = text_style }, .{ .wrap = .word });
            }
        }

        fn drawMarkdownMessage(self: *Self, renderer: R, content: []const u8, y: u16, text_width: u16, skip_lines: u16) void {
            // Trim trailing whitespace to avoid extra blank lines
            const trimmed = std.mem.trimRight(u8, content, " \t\n\r");
            var parser = md.MarkdownParser.init(self.allocator);
            var result = parser.parse(trimmed) catch {
                // Fallback to plain text on parse error
                const total_lines = countLines(content, text_width);
                const visible_lines = total_lines -| skip_lines;
                if (visible_lines > 0) {
                    const text_renderer = renderer.subRegion(2, y, text_width + 2, @min(visible_lines, renderer.height() -| y));
                    const start_text = skipWrappedLines(content, text_width, skip_lines);
                    // For word wrapping, use underlying window's printSegment
                    _ = text_renderer.window.printSegment(.{
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

                if (row >= renderer.height()) break;

                // Calculate x offset based on line type
                var x_off: u16 = 2;
                var prefix: ?[]const u8 = null;
                var prefix_style: R.Style = .{};

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
                    renderer.drawText(x_off, row, p, prefix_style);
                    x_off += @intCast(p.len);
                }

                // Draw spans
                var col: u16 = x_off;
                for (line.spans) |span| {
                    if (col >= renderer.width()) break;

                    const style = self.mdStyleToVaxis(span.style, line.line_type);
                    const remaining_width = renderer.width() -| col;
                    const span_len: u16 = @intCast(@min(span.text.len, remaining_width));

                    if (span_len > 0) {
                        renderer.drawText(col, row, span.text[0..span_len], style);
                        col += span_len;
                    }
                }
                row += 1;
            }
        }

        fn mdStyleToVaxis(self: *Self, style: md.Style, line_type: md.LineType) R.Style {
            _ = self;
            var result: R.Style = .{};

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

        fn drawCodeWithLineNumbers(self: *Self, renderer: R, content: []const u8, y: u16, text_width: u16, skip_lines: u16) void {
            _ = self;
            const line_num_width: u16 = 6; // "00001 " = 6 chars
            const code_width = if (text_width > line_num_width) text_width - line_num_width else 1;

            const line_num_style: R.Style = .{ .fg = .{ .index = dim_color } };
            const code_style: R.Style = .{ .fg = .{ .index = code_color } };

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

                if (row >= renderer.height()) break;

                // Draw line number
                var num_buf: [8]u8 = undefined;
                const num_str = std.fmt.bufPrint(&num_buf, "{d:>5} ", .{line_num}) catch "     ";
                renderer.drawText(2, row, num_str, line_num_style);

                // Draw code content
                const display_line = if (line.len > code_width) line[0..code_width] else line;
                renderer.drawText(2 + line_num_width, row, display_line, code_style);

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
}

/// Free a messages slice (standalone helper to avoid type dependency)
fn freeMessagesSlice(allocator: std.mem.Allocator, messages: []db.Message) void {
    for (messages) |msg| {
        allocator.free(msg.content);
        if (msg.tool_name) |tn| allocator.free(tn);
        if (msg.tool_input) |ti| allocator.free(ti);
    }
    allocator.free(messages);
}
