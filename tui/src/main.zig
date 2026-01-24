const std = @import("std");
const vaxis = @import("vaxis");

// File-based logging
var log_file: ?std.fs.File = null;

pub const std_options: std.Options = .{
    .log_level = .warn,
    .logFn = fileLog,
};

fn fileLog(
    comptime level: std.log.Level,
    comptime scope: @TypeOf(.enum_literal),
    comptime format: []const u8,
    args: anytype,
) void {
    const f = log_file orelse return;
    const scope_prefix = if (scope == .default) "" else "(" ++ @tagName(scope) ++ ")";
    const prefix = "[" ++ comptime level.asText() ++ "]" ++ scope_prefix ++ " ";
    var buf: [1024]u8 = undefined;
    const msg = std.fmt.bufPrint(&buf, prefix ++ format ++ "\n", args) catch return;
    _ = f.write(msg) catch {};
}

const EventLoop = @import("event_loop.zig").EventLoop;
const Event = @import("event.zig").Event;
const db = @import("db.zig");
const logo = @import("components/logo.zig");
const Input = @import("components/input.zig").Input;
const ChatHistory = @import("components/chat_history.zig").ChatHistory;
const Header = @import("ui/header.zig").Header;
const StatusBar = @import("ui/status.zig").StatusBar;
const ToolRegistry = @import("agent/tools/registry.zig").ToolRegistry;
const ToolExecutor = @import("agent/tool_executor.zig").ToolExecutor;

pub const panic = vaxis.panic_handler;

const spinner_frames = [_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" };

// Layout constants
const HEADER_HEIGHT: u16 = 1;
const INPUT_HEIGHT: u16 = 5;
const STATUS_HEIGHT: u16 = 1;

const help_message =
    \\## Keybindings
    \\
    \\**Editing:** Ctrl+K kill→end | Ctrl+U kill→start | Ctrl+W kill word | Ctrl+Y yank
    \\
    \\**Navigation:** ↑/↓ scroll chat | PgUp/PgDn fast scroll | Ctrl+A line start | Alt+B/F word nav
    \\
    \\**Session:** Ctrl+B,c new tab | Ctrl+B,n/p next/prev | Ctrl+B,0-9 switch
    \\
    \\**Other:** Ctrl+E editor | Ctrl+L redraw | Ctrl+Z suspend | Esc interrupt
    \\
    \\## Commands
    \\
    \\- `/help` - Show this help
    \\- `/clear` - Clear chat history
    \\- `/new` - Start new conversation
    \\- `/model` - Show current AI model
    \\- `/status` - Show session status
    \\- `/diff` - Show git diff
    \\- `/exit` - Exit the application
;

/// Open external editor for composing a message
fn openExternalEditor(alloc: std.mem.Allocator, event_loop: *EventLoop, input: *Input) ![]u8 {
    const editor_cmd = std.posix.getenv("EDITOR") orelse std.posix.getenv("VISUAL") orelse "vi";
    
    // Create temp file with current input content
    const tmp_path = "/tmp/smithers-edit.txt";
    {
        const file = try std.fs.createFileAbsolute(tmp_path, .{});
        defer file.close();
        
        const current_text = try input.getText();
        defer alloc.free(current_text);
        if (current_text.len > 0) {
            try file.writeAll(current_text);
        }
    }
    
    // Exit alt screen and restore terminal
    try event_loop.vx.exitAltScreen(event_loop.tty.writer());
    event_loop.loop.stop();
    event_loop.tty.deinit();
    
    // Run the editor
    var child = std.process.Child.init(&.{ editor_cmd, tmp_path }, alloc);
    child.stdin_behavior = .Inherit;
    child.stdout_behavior = .Inherit;
    child.stderr_behavior = .Inherit;
    
    try child.spawn();
    _ = try child.wait();
    
    // Restore terminal
    event_loop.tty = try vaxis.Tty.init(&event_loop.tty_buffer);
    event_loop.loop = .{ .tty = &event_loop.tty, .vaxis = &event_loop.vx };
    try event_loop.loop.init();
    try event_loop.loop.start();
    try event_loop.vx.enterAltScreen(event_loop.tty.writer());
    
    // Read the edited content
    const file = try std.fs.openFileAbsolute(tmp_path, .{});
    defer file.close();
    const content = try file.readToEndAlloc(alloc, 1024 * 1024);
    
    // Clear input after successful edit
    input.clear();
    
    // Clean up temp file
    std.fs.deleteFileAbsolute(tmp_path) catch {};
    
    // Trim trailing whitespace
    const trimmed = std.mem.trimRight(u8, content, " \t\n\r");
    if (trimmed.len < content.len) {
        const result = try alloc.dupe(u8, trimmed);
        alloc.free(content);
        return result;
    }
    
    return content;
}

/// Run git diff and return the output
fn runGitDiff(alloc: std.mem.Allocator) ![]u8 {
    var child = std.process.Child.init(&.{ "git", "diff", "--stat" }, alloc);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;
    
    try child.spawn();
    const result = try child.wait();
    
    if (result.Exited == 0) {
        if (child.stdout) |stdout| {
            const output = try stdout.readToEndAlloc(alloc, 64 * 1024);
            if (output.len == 0) {
                alloc.free(output);
                return try alloc.dupe(u8, "");
            }
            return output;
        }
    }
    
    // Try to get full diff if stat was empty
    var child2 = std.process.Child.init(&.{ "git", "diff" }, alloc);
    child2.stdout_behavior = .Pipe;
    child2.stderr_behavior = .Pipe;
    
    try child2.spawn();
    _ = try child2.wait();
    
    if (child2.stdout) |stdout| {
        const output = try stdout.readToEndAlloc(alloc, 64 * 1024);
        // Truncate if too long
        if (output.len > 4096) {
            const truncated = try std.fmt.allocPrint(alloc, "{s}\n\n... (truncated, {d} bytes total)", .{output[0..4000], output.len});
            alloc.free(output);
            return truncated;
        }
        return output;
    }
    
    return try alloc.dupe(u8, "");
}

const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};

const StreamingState = struct {
    child: ?std.process.Child = null,
    message_id: ?i64 = null,
    accumulated_text: std.ArrayListUnmanaged(u8) = .{},
    tool_calls: std.ArrayListUnmanaged(ToolCallInfo) = .{},
    current_tool_id: ?[]const u8 = null,
    current_tool_name: ?[]const u8 = null,
    current_tool_input: std.ArrayListUnmanaged(u8) = .{},
    line_buffer: [8192]u8 = undefined,
    line_pos: usize = 0,
    is_done: bool = false,
    stop_reason: ?[]const u8 = null,
    alloc: std.mem.Allocator,

    fn init(alloc: std.mem.Allocator) StreamingState {
        return .{ .alloc = alloc, .current_tool_input = .{} };
    }

    fn deinit(self: *StreamingState) void {
        self.cleanup();
    }

    fn startStream(self: *StreamingState, api_key: []const u8, request_body: []const u8) !void {
        const auth_header = try std.fmt.allocPrint(self.alloc, "x-api-key: {s}", .{api_key});
        defer self.alloc.free(auth_header);

        var child = std.process.Child.init(&.{
            "curl", "-s", "-N", "-X", "POST", "https://api.anthropic.com/v1/messages",
            "-H", "content-type: application/json",
            "-H", "anthropic-version: 2023-06-01",
            "-H", auth_header,
            "-d", request_body,
        }, self.alloc);
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;

        try child.spawn();

        // Set stdout to non-blocking
        if (child.stdout) |stdout| {
            const fd = stdout.handle;
            const F_GETFL = 3;
            const F_SETFL = 4;
            const O_NONBLOCK: usize = 0x0004; // macOS value
            const flags = std.posix.fcntl(fd, F_GETFL, 0) catch 0;
            _ = std.posix.fcntl(fd, F_SETFL, flags | O_NONBLOCK) catch {};
        }

        self.child = child;
        self.is_done = false;
        self.line_pos = 0;
    }

    /// Poll for new data. Returns true if streaming is complete.
    fn poll(self: *StreamingState) !bool {
        const child = &(self.child orelse return true);
        const stdout = child.stdout orelse return true;

        // Try to read available data (non-blocking)
        var buf: [4096]u8 = undefined;
        const bytes_read = stdout.read(&buf) catch |err| {
            if (err == error.WouldBlock) return false;
            // EOF or error - check if process exited
            const term = child.wait() catch return true;
            _ = term;
            self.is_done = true;
            return true;
        };

        if (bytes_read == 0) {
            // EOF - process done
            _ = child.wait() catch {};
            self.is_done = true;
            return true;
        }

        // Process received data byte by byte looking for newlines
        for (buf[0..bytes_read]) |byte| {
            if (byte == '\n') {
                // Process the line
                const line = self.line_buffer[0..self.line_pos];
                try self.processLine(line);
                self.line_pos = 0;
            } else if (self.line_pos < self.line_buffer.len - 1) {
                self.line_buffer[self.line_pos] = byte;
                self.line_pos += 1;
            }
        }

        return false;
    }

    fn processLine(self: *StreamingState, line: []const u8) !void {
        // SSE format: "data: {...}"
        if (!std.mem.startsWith(u8, line, "data: ")) return;
        const data = line[6..];
        if (std.mem.eql(u8, data, "[DONE]")) {
            self.is_done = true;
            return;
        }

        // Parse JSON event
        const parsed = std.json.parseFromSlice(std.json.Value, self.alloc, data, .{}) catch return;
        defer parsed.deinit();

        if (parsed.value != .object) return;

        const type_val = parsed.value.object.get("type") orelse return;
        if (type_val != .string) return;
        const event_type = type_val.string;

        // Handle message_delta for stop_reason
        if (std.mem.eql(u8, event_type, "message_delta")) {
            if (parsed.value.object.get("delta")) |delta| {
                if (delta == .object) {
                    if (delta.object.get("stop_reason")) |sr| {
                        if (sr == .string) {
                            self.stop_reason = self.alloc.dupe(u8, sr.string) catch null;
                        }
                    }
                }
            }
            return;
        }

        // Handle content_block_start for tool_use
        if (std.mem.eql(u8, event_type, "content_block_start")) {
            if (parsed.value.object.get("content_block")) |block| {
                if (block == .object) {
                    if (block.object.get("type")) |bt| {
                        if (bt == .string and std.mem.eql(u8, bt.string, "tool_use")) {
                            // Start of a tool call
                            if (block.object.get("id")) |id| {
                                if (id == .string) {
                                    self.current_tool_id = self.alloc.dupe(u8, id.string) catch null;
                                }
                            }
                            if (block.object.get("name")) |name| {
                                if (name == .string) {
                                    self.current_tool_name = self.alloc.dupe(u8, name.string) catch null;
                                }
                            }
                            self.current_tool_input.clearRetainingCapacity();
                        }
                    }
                }
            }
            return;
        }

        // Handle content_block_delta
        if (std.mem.eql(u8, event_type, "content_block_delta")) {
            const delta = parsed.value.object.get("delta") orelse return;
            if (delta != .object) return;

            if (delta.object.get("type")) |dt| {
                if (dt == .string) {
                    if (std.mem.eql(u8, dt.string, "text_delta")) {
                        // Text content
                        if (delta.object.get("text")) |text| {
                            if (text == .string) {
                                try self.accumulated_text.appendSlice(self.alloc, text.string);
                            }
                        }
                    } else if (std.mem.eql(u8, dt.string, "input_json_delta")) {
                        // Tool input JSON fragment
                        if (delta.object.get("partial_json")) |pj| {
                            if (pj == .string) {
                                try self.current_tool_input.appendSlice(self.alloc, pj.string);
                            }
                        }
                    }
                }
            }
            return;
        }

        // Handle content_block_stop - finalize tool call
        if (std.mem.eql(u8, event_type, "content_block_stop")) {
            if (self.current_tool_id != null and self.current_tool_name != null) {
                try self.tool_calls.append(self.alloc, .{
                    .id = self.current_tool_id.?,
                    .name = self.current_tool_name.?,
                    .input_json = try self.alloc.dupe(u8, self.current_tool_input.items),
                });
                self.current_tool_id = null;
                self.current_tool_name = null;
                self.current_tool_input.clearRetainingCapacity();
            }
            return;
        }
    }

    fn getText(self: *StreamingState) []const u8 {
        return self.accumulated_text.items;
    }

    fn hasToolCalls(self: *StreamingState) bool {
        return self.tool_calls.items.len > 0;
    }

    fn cleanup(self: *StreamingState) void {
        if (self.child) |*child| {
            _ = child.kill() catch {};
            _ = child.wait() catch {};
        }
        self.child = null;
        self.accumulated_text.deinit(self.alloc);
        self.accumulated_text = .{};
        for (self.tool_calls.items) |tc| {
            self.alloc.free(tc.id);
            self.alloc.free(tc.name);
            self.alloc.free(tc.input_json);
        }
        self.tool_calls.deinit(self.alloc);
        self.tool_calls = .{};
        self.current_tool_input.deinit(self.alloc);
        self.current_tool_input = .{};
        if (self.current_tool_id) |id| self.alloc.free(id);
        if (self.current_tool_name) |name| self.alloc.free(name);
        if (self.stop_reason) |sr| self.alloc.free(sr);
        self.current_tool_id = null;
        self.current_tool_name = null;
        self.stop_reason = null;
        self.message_id = null;
        self.is_done = false;
        self.line_pos = 0;
    }
};

/// Stored tool result for building continuation
const ToolResultInfo = struct {
    tool_id: []const u8,
    tool_name: []const u8,
    content: []const u8,
    success: bool,
    input_json: []const u8,
};

const LoadingState = struct {
    is_loading: bool = false,
    start_time: i64 = 0,
    spinner_frame: usize = 0,
    pending_query: ?[]const u8 = null,
    streaming: ?StreamingState = null,
    /// Pending tool continuation - JSON for next API call
    pending_continuation: ?[]const u8 = null,
    
    // Async tool execution state
    tool_executor: ?ToolExecutor = null,
    /// Queue of tools waiting to execute
    pending_tools: std.ArrayListUnmanaged(ToolCallInfo) = .{},
    /// Current tool index being executed
    current_tool_idx: usize = 0,
    /// Collected tool results
    tool_results: std.ArrayListUnmanaged(ToolResultInfo) = .{},
    /// Assistant content JSON being built
    assistant_content_json: ?[]const u8 = null,

    fn startLoading(self: *LoadingState) void {
        self.is_loading = true;
        self.start_time = std.time.milliTimestamp();
        self.spinner_frame = 0;
    }

    fn tick(self: *LoadingState) void {
        if (self.is_loading) {
            self.spinner_frame = (self.spinner_frame + 1) % spinner_frames.len;
        }
    }

    fn getSpinner(self: *LoadingState) []const u8 {
        return spinner_frames[self.spinner_frame];
    }
    
    fn hasToolsToExecute(self: *LoadingState) bool {
        return self.pending_tools.items.len > 0 and self.current_tool_idx < self.pending_tools.items.len;
    }
    
    fn isExecutingTool(self: *LoadingState) bool {
        if (self.tool_executor) |*exec| {
            return exec.isRunning();
        }
        return false;
    }

    fn cleanup(self: *LoadingState, alloc: std.mem.Allocator) void {
        if (self.pending_query) |q| alloc.free(q);
        self.pending_query = null;
        if (self.pending_continuation) |c| alloc.free(c);
        self.pending_continuation = null;
        if (self.streaming) |*s| s.cleanup();
        self.streaming = null;
        if (self.tool_executor) |*exec| exec.deinit();
        self.tool_executor = null;
        // Free tool results
        for (self.tool_results.items) |tr| {
            alloc.free(tr.tool_id);
            alloc.free(tr.tool_name);
            alloc.free(tr.content);
            alloc.free(tr.input_json);
        }
        self.tool_results.deinit(alloc);
        self.tool_results = .{};
        self.pending_tools.deinit(alloc);
        self.pending_tools = .{};
        self.current_tool_idx = 0;
        if (self.assistant_content_json) |a| alloc.free(a);
        self.assistant_content_json = null;
        self.is_loading = false;
    }
};

pub fn main() !void {
    // Open log file
    log_file = std.fs.createFileAbsolute("/tmp/smithers-tui.log", .{ .truncate = true }) catch null;
    defer if (log_file) |f| f.close();
    
    std.log.debug("=== Smithers TUI starting ===", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    // Use file-based database in ~/.smithers/
    const home = std.posix.getenv("HOME") orelse "/tmp";
    const db_path_slice = try std.fmt.allocPrint(alloc, "{s}/.smithers/chat.db", .{home});
    defer alloc.free(db_path_slice);
    const db_path = try alloc.dupeZ(u8, db_path_slice);
    defer alloc.free(db_path);

    // Ensure directory exists
    const dir_path = try std.fmt.allocPrint(alloc, "{s}/.smithers", .{home});
    defer alloc.free(dir_path);
    std.fs.makeDirAbsolute(dir_path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    var database = try db.Database.init(alloc, db_path);
    defer database.deinit();

    // Clean up ephemeral messages from previous sessions
    try database.deleteEphemeralMessages();

    var event_loop = try EventLoop.init(alloc);
    defer event_loop.deinit();

    try event_loop.start();

    var input = Input.init(alloc);
    defer input.deinit();

    var chat_history = ChatHistory.init(alloc);
    defer chat_history.deinit();

    // Load existing chat history
    try chat_history.reload(&database);

    const has_ai = std.posix.getenv("ANTHROPIC_API_KEY") != null;
    if (!has_ai) {
        _ = database.addMessage(.system, "Note: ANTHROPIC_API_KEY not set. Running in demo mode.") catch {};
    }

    const header = Header.init(alloc, "0.1.0", if (has_ai) "claude-sonnet-4" else "demo-mode");
    var status_bar = StatusBar.init();

    var loading = LoadingState{};
    var last_ctrl_c: i64 = 0;
    var prefix_mode: bool = false; // tmux-style Ctrl+B prefix mode

    // Main event loop
    var last_tick: i64 = std.time.milliTimestamp();
    
    while (true) {
        // Poll for events (non-blocking when loading)
        const maybe_event = if (loading.is_loading) 
            event_loop.tryEvent() 
        else 
            event_loop.nextEvent();

        if (maybe_event) |event| {
            std.log.debug("main: got event", .{});
            switch (event) {
                .winsize => |ws| {
                    std.log.debug("main: winsize event", .{});
                    try event_loop.resize(ws);
                },
                .mouse => |mouse| {
                    // Handle scroll wheel
                    if (mouse.button == .wheel_up) {
                        chat_history.scrollUp(3);
                    } else if (mouse.button == .wheel_down) {
                        chat_history.scrollDown(3);
                    }
                    // Handle text selection
                    else if (mouse.button == .left) {
                        const col: u16 = if (mouse.col >= 0) @intCast(mouse.col) else 0;
                        // Adjust row for header offset
                        const raw_row: i16 = mouse.row - @as(i16, HEADER_HEIGHT);
                        const row: u16 = if (raw_row >= 0) @intCast(raw_row) else 0;
                        
                        if (mouse.type == .press) {
                            // Start selection
                            chat_history.startSelection(col, row);
                        } else if (mouse.type == .drag) {
                            // Drag - update selection
                            chat_history.updateSelection(col, row);
                        } else if (mouse.type == .release) {
                            // End selection and copy if we have one
                            chat_history.endSelection();
                            if (chat_history.getSelectedText()) |text| {
                                defer alloc.free(text);
                                const selection_mod = @import("selection.zig");
                                selection_mod.copyToClipboard(alloc, text) catch {};
                            }
                        }
                    }
                },
                .key_press => |key| {
                    std.log.debug("main: key_press codepoint={d} text_is_null={}", .{key.codepoint, key.text == null});
                    if (key.text) |t| {
                        std.log.debug("main: text='{s}' len={d} ptr={*}", .{t, t.len, t.ptr});
                    }
                    // Ctrl+Z to suspend (like vim)
                    if (key.matches('z', .{ .ctrl = true })) {
                        try event_loop.suspendTui();
                        continue;
                    }
                    
                    // Ctrl+L - clear/redraw screen
                    if (key.matches('l', .{ .ctrl = true })) {
                        try event_loop.render();
                        continue;
                    }
                    
                    // Ctrl+E - open external editor for input
                    if (key.matches('e', .{ .ctrl = true })) {
                        if (openExternalEditor(alloc, &event_loop, &input)) |edited_text| {
                            defer alloc.free(edited_text);
                            if (edited_text.len > 0) {
                                // Submit the edited text as a message
                                _ = try database.addMessage(.user, edited_text);
                                try chat_history.reload(&database);
                                if (has_ai) {
                                    loading.pending_query = try alloc.dupe(u8, edited_text);
                                    loading.startLoading();
                                }
                            }
                        } else |_| {}
                        continue;
                    }
                    
                    // Escape - dismiss help or interrupt loading
                    if (key.matches(vaxis.Key.escape, .{})) {
                        if (status_bar.isHelpVisible()) {
                            status_bar.hideHelp();
                            continue;
                        }
                        if (loading.is_loading) {
                            loading.cleanup(alloc);
                            _ = try database.addMessage(.system, "Interrupted.");
                            try chat_history.reload(&database);
                        }
                        continue;
                    }
                    
                    // ? - show help message when input empty (ephemeral)
                    if (key.text) |text| {
                        if (text.len == 1 and text[0] == '?' and input.isEmpty()) {
                            _ = try database.addEphemeralMessage(.assistant, help_message);
                            try chat_history.reload(&database);
                        }
                    }
                    
                    // Ctrl+C - clear input, or exit if pressed twice
                    if (key.matches('c', .{ .ctrl = true })) {
                        if (!input.isEmpty()) {
                            // Clear input
                            input.clear();
                        } else {
                            // Input already empty - check for double Ctrl+C to exit
                            const now_ms = std.time.milliTimestamp();
                            if (now_ms - last_ctrl_c < 1500) {
                                // Double Ctrl+C - exit
                                return;
                            }
                            last_ctrl_c = now_ms;
                        }
                        continue;
                    }
                    
                    // Ctrl+D - exit if input is empty
                    if (key.matches('d', .{ .ctrl = true })) {
                        if (input.isEmpty()) {
                            return;
                        }
                        continue;
                    }
                    
                    // Ctrl+B - enter prefix mode (tmux-style)
                    if (key.matches('b', .{ .ctrl = true })) {
                        prefix_mode = true;
                        status_bar.setCustomStatus(" [Ctrl+B] c:new n:next p:prev 0-9:switch");
                        continue;
                    }
                    
                    // Handle prefix mode commands
                    if (prefix_mode) {
                        prefix_mode = false;
                        status_bar.setCustomStatus(null);
                        
                        // c - new tab
                        if (key.codepoint == 'c') {
                            const count = try database.getSessionCount();
                            var name_buf: [16]u8 = undefined;
                            const name = std.fmt.bufPrint(&name_buf, "tab-{d}", .{count + 1}) catch "new";
                            const new_id = try database.createSession(name);
                            database.switchSession(new_id);
                            try chat_history.reload(&database);
                            continue;
                        }
                        
                        // n - next tab
                        if (key.codepoint == 'n') {
                            const sessions = try database.getSessions(alloc);
                            defer db.Database.freeSessions(alloc, sessions);
                            if (sessions.len > 1) {
                                const current = database.getCurrentSessionId();
                                var next_id: ?i64 = null;
                                var first_id: ?i64 = null;
                                for (sessions, 0..) |s, i| {
                                    if (first_id == null) first_id = s.id;
                                    if (s.id == current and i + 1 < sessions.len) {
                                        next_id = sessions[i + 1].id;
                                        break;
                                    }
                                }
                                database.switchSession(next_id orelse first_id orelse current);
                                try chat_history.reload(&database);
                            }
                            continue;
                        }
                        
                        // p - previous tab
                        if (key.codepoint == 'p') {
                            const sessions = try database.getSessions(alloc);
                            defer db.Database.freeSessions(alloc, sessions);
                            if (sessions.len > 1) {
                                const current = database.getCurrentSessionId();
                                var prev_id: ?i64 = null;
                                for (sessions, 0..) |s, i| {
                                    if (s.id == current) {
                                        if (i > 0) {
                                            prev_id = sessions[i - 1].id;
                                        } else {
                                            prev_id = sessions[sessions.len - 1].id;
                                        }
                                        break;
                                    }
                                }
                                if (prev_id) |pid| {
                                    database.switchSession(pid);
                                    try chat_history.reload(&database);
                                }
                            }
                            continue;
                        }
                        
                        // 0-9 - switch to tab by number
                        if (key.codepoint >= '0' and key.codepoint <= '9') {
                            const tab_num = if (key.codepoint == '0') 9 else key.codepoint - '1';
                            const sessions = try database.getSessions(alloc);
                            defer db.Database.freeSessions(alloc, sessions);
                            if (tab_num < sessions.len) {
                                database.switchSession(sessions[tab_num].id);
                                try chat_history.reload(&database);
                            }
                            continue;
                        }
                        
                        // Any other key - just exit prefix mode (already done above)
                        continue;
                    }
                    
                    if (!loading.is_loading) {
                        // Arrow keys scroll 5 lines (~1 message), PageUp/PageDown scroll faster
                        if (key.matches(vaxis.Key.up, .{})) {
                            chat_history.scrollUp(5);
                            continue;
                        } else if (key.matches(vaxis.Key.down, .{})) {
                            chat_history.scrollDown(5);
                            continue;
                        } else if (key.matches(vaxis.Key.page_up, .{})) {
                            chat_history.scrollUp(20);
                            continue;
                        } else if (key.matches(vaxis.Key.page_down, .{})) {
                            chat_history.scrollDown(20);
                            continue;
                        } else if (try input.handleEvent(event)) |command| {
                            defer alloc.free(command);

                            if (std.mem.eql(u8, command, "/exit")) {
                                return;
                            } else if (std.mem.eql(u8, command, "/clear")) {
                                try database.clearMessages();
                                try chat_history.reload(&database);
                            } else if (std.mem.eql(u8, command, "/new")) {
                                try database.clearMessages();
                                _ = try database.addMessage(.system, "Started new conversation.");
                                try chat_history.reload(&database);
                            } else if (std.mem.eql(u8, command, "/help")) {
                                _ = try database.addEphemeralMessage(.assistant, help_message);
                                try chat_history.reload(&database);
                            } else if (std.mem.eql(u8, command, "/model")) {
                                _ = try database.addEphemeralMessage(.system, "Current model: claude-sonnet-4-20250514");
                                try chat_history.reload(&database);
                            } else if (std.mem.eql(u8, command, "/status")) {
                                const msgs = try database.getMessages(alloc);
                                defer db.Database.freeMessages(alloc, msgs);
                                const status_msg = try std.fmt.allocPrint(alloc, 
                                    "Session: {d} | Messages: {d} | AI: {s}", 
                                    .{database.getCurrentSessionId(), msgs.len, if (has_ai) "connected" else "demo"});
                                defer alloc.free(status_msg);
                                _ = try database.addEphemeralMessage(.system, status_msg);
                                try chat_history.reload(&database);
                            } else if (std.mem.eql(u8, command, "/diff")) {
                                // Run git diff and display result
                                const diff_result = runGitDiff(alloc) catch |err| blk: {
                                    break :blk try std.fmt.allocPrint(alloc, "Error running git diff: {s}", .{@errorName(err)});
                                };
                                defer alloc.free(diff_result);
                                if (diff_result.len > 0) {
                                    _ = try database.addEphemeralMessage(.assistant, diff_result);
                                } else {
                                    _ = try database.addEphemeralMessage(.system, "No uncommitted changes.");
                                }
                                try chat_history.reload(&database);
                            } else {
                                // Regular message - add to history and call AI
                                _ = try database.addMessage(.user, command);
                                try chat_history.reload(&database);
                                
                                if (has_ai) {
                                    // Store query for AI processing
                                    loading.pending_query = try alloc.dupe(u8, command);
                                    loading.startLoading();
                                } else {
                                    // Demo mode - just acknowledge
                                    _ = try database.addMessage(.assistant, "I'm running in demo mode (no API key). Set ANTHROPIC_API_KEY to enable AI responses.");
                                    try chat_history.reload(&database);
                                }
                            }
                        }
                    }
                },
            }
        }

        // Start streaming if we have a pending query but no active stream
        if (loading.pending_query != null and loading.streaming == null and loading.start_time > 0) {
            const elapsed = std.time.milliTimestamp() - loading.start_time;
            if (elapsed >= 50) {
                const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                    _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                    loading.cleanup(alloc);
                    try chat_history.reload(&database);
                    continue;
                };

                // Build messages JSON from DB
                const messages = database.getMessages(alloc) catch @constCast(&[_]db.Message{});
                defer if (messages.len > 0) db.Database.freeMessages(alloc, messages);

                var msg_buf = std.ArrayListUnmanaged(u8){};
                defer msg_buf.deinit(alloc);
                try msg_buf.append(alloc, '[');
                var first = true;
                for (messages) |msg| {
                    if (msg.role == .system or msg.ephemeral) continue;
                    if (!first) try msg_buf.append(alloc, ',');
                    first = false;
                    const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                    const escaped_content = std.json.Stringify.valueAlloc(alloc, msg.content, .{}) catch continue;
                    defer alloc.free(escaped_content);
                    const msg_json = std.fmt.allocPrint(alloc, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                    defer alloc.free(msg_json);
                    try msg_buf.appendSlice(alloc, msg_json);
                }
                try msg_buf.append(alloc, ']');

                // Tool definitions for the agent
                const tools_json =
                    \\[{"name":"read_file","description":"Read contents of a file with line numbers. Use offset/limit for pagination.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"},"offset":{"type":"integer","description":"Line to start from (0-indexed)"},"limit":{"type":"integer","description":"Max lines to read"}},"required":["path"]}},
                    \\{"name":"write_file","description":"Write content to a file. Creates parent dirs.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
                    \\{"name":"edit_file","description":"Edit file by replacing old_str with new_str. old_str must be unique.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_str":{"type":"string","description":"Text to find"},"new_str":{"type":"string","description":"Replacement text"}},"required":["path","old_str","new_str"]}},
                    \\{"name":"bash","description":"Execute bash command. Output truncated to 500 lines.","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
                    \\{"name":"glob","description":"Find files matching glob pattern (e.g. **/*.zig)","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Directory to search"}},"required":["pattern"]}},
                    \\{"name":"grep","description":"Search for pattern in files using ripgrep","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory to search"},"include":{"type":"string","description":"File glob filter"}},"required":["pattern"]}},
                    \\{"name":"list_dir","description":"List directory contents with optional depth","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"},"depth":{"type":"integer","description":"Recursion depth (1-3)"}}}}]
                ;

                const request_body = try std.fmt.allocPrint(alloc,
                    \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
                , .{msg_buf.items, tools_json});
                defer alloc.free(request_body);

                // Create placeholder message for streaming response
                const msg_id = try database.addMessage(.assistant, "▌");
                try chat_history.reload(&database);

                // Initialize streaming state
                loading.streaming = StreamingState.init(alloc);
                loading.streaming.?.message_id = msg_id;
                loading.streaming.?.startStream(api_key, request_body) catch |err| {
                    _ = std.log.err("Failed to start stream: {s}", .{@errorName(err)});
                    try database.updateMessageContent(msg_id, "Error: Failed to start API request");
                    loading.cleanup(alloc);
                    try chat_history.reload(&database);
                    continue;
                };

                // Clear pending query now that stream is started
                if (loading.pending_query) |q| alloc.free(q);
                loading.pending_query = null;
            }
        }

        // Start continuation stream if we have pending tool results
        if (loading.pending_continuation != null and loading.streaming == null and loading.start_time > 0) {
            const elapsed = std.time.milliTimestamp() - loading.start_time;
            if (elapsed >= 50) {
                const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                    _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                    loading.cleanup(alloc);
                    try chat_history.reload(&database);
                    continue;
                };

                // Tool definitions (same as initial request)
                const tools_json =
                    \\[{"name":"read_file","description":"Read contents of a file with line numbers. Use offset/limit for pagination.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"},"offset":{"type":"integer","description":"Line to start from (0-indexed)"},"limit":{"type":"integer","description":"Max lines to read"}},"required":["path"]}},
                    \\{"name":"write_file","description":"Write content to a file. Creates parent dirs.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
                    \\{"name":"edit_file","description":"Edit file by replacing old_str with new_str. old_str must be unique.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_str":{"type":"string","description":"Text to find"},"new_str":{"type":"string","description":"Replacement text"}},"required":["path","old_str","new_str"]}},
                    \\{"name":"bash","description":"Execute bash command. Output truncated to 500 lines.","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
                    \\{"name":"glob","description":"Find files matching glob pattern (e.g. **/*.zig)","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Directory to search"}},"required":["pattern"]}},
                    \\{"name":"grep","description":"Search for pattern in files using ripgrep","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory to search"},"include":{"type":"string","description":"File glob filter"}},"required":["pattern"]}},
                    \\{"name":"list_dir","description":"List directory contents with optional depth","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"},"depth":{"type":"integer","description":"Recursion depth (1-3)"}}}}]
                ;

                const request_body = try std.fmt.allocPrint(alloc,
                    \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
                , .{ loading.pending_continuation.?, tools_json });
                defer alloc.free(request_body);

                // Create placeholder message for continuation response
                const msg_id = try database.addMessage(.assistant, "▌");
                try chat_history.reload(&database);

                // Initialize streaming state
                loading.streaming = StreamingState.init(alloc);
                loading.streaming.?.message_id = msg_id;
                loading.streaming.?.startStream(api_key, request_body) catch |err| {
                    _ = std.log.err("Failed to start continuation stream: {s}", .{@errorName(err)});
                    try database.updateMessageContent(msg_id, "Error: Failed to continue after tool execution");
                    loading.cleanup(alloc);
                    try chat_history.reload(&database);
                    continue;
                };

                // Clear pending continuation now that stream is started
                if (loading.pending_continuation) |c| alloc.free(c);
                loading.pending_continuation = null;
            }
        }

        // Poll active stream for new data
        if (loading.streaming) |*stream| {
            const is_done = stream.poll() catch true;
            const text = stream.getText();

            // Update message in DB with current accumulated text
            if (stream.message_id) |msg_id| {
                if (text.len > 0) {
                    const display_text = if (is_done) text else blk: {
                        // Add cursor indicator while streaming
                        const with_cursor = std.fmt.allocPrint(alloc, "{s}▌", .{text}) catch text;
                        break :blk with_cursor;
                    };
                    database.updateMessageContent(msg_id, display_text) catch {};
                    if (!is_done and display_text.ptr != text.ptr) alloc.free(display_text);
                    try chat_history.reload(&database);
                } else if (is_done and !stream.hasToolCalls()) {
                    database.updateMessageContent(msg_id, "No response from AI.") catch {};
                    try chat_history.reload(&database);
                }
            }

            if (is_done) {
                // Check if we have tool calls to execute
                if (stream.hasToolCalls()) {
                    // Build assistant content JSON and queue tools for async execution
                    var assistant_content = std.ArrayListUnmanaged(u8){};
                    defer assistant_content.deinit(alloc);
                    try assistant_content.append(alloc, '[');

                    // Add text content if any
                    const assistant_text = stream.getText();
                    if (assistant_text.len > 0) {
                        const escaped_text = std.json.Stringify.valueAlloc(alloc, assistant_text, .{}) catch "";
                        defer alloc.free(escaped_text);
                        const text_block = std.fmt.allocPrint(alloc,
                            \\{{"type":"text","text":{s}}}
                        , .{escaped_text}) catch "";
                        defer alloc.free(text_block);
                        try assistant_content.appendSlice(alloc, text_block);
                    }

                    // Build tool_use blocks and queue tools
                    for (stream.tool_calls.items) |tc| {
                        if (assistant_content.items.len > 1) {
                            try assistant_content.append(alloc, ',');
                        }
                        const tool_use_block = std.fmt.allocPrint(alloc,
                            \\{{"type":"tool_use","id":"{s}","name":"{s}","input":{s}}}
                        , .{ tc.id, tc.name, if (tc.input_json.len > 0) tc.input_json else "{}" }) catch continue;
                        defer alloc.free(tool_use_block);
                        try assistant_content.appendSlice(alloc, tool_use_block);

                        // Queue tool for async execution
                        try loading.pending_tools.append(alloc, .{
                            .id = try alloc.dupe(u8, tc.id),
                            .name = try alloc.dupe(u8, tc.name),
                            .input_json = try alloc.dupe(u8, tc.input_json),
                        });
                    }

                    try assistant_content.append(alloc, ']');
                    loading.assistant_content_json = try alloc.dupe(u8, assistant_content.items);
                    loading.current_tool_idx = 0;

                    // Initialize tool executor
                    loading.tool_executor = ToolExecutor.init(alloc);

                    // Clean up stream but keep loading state active
                    if (loading.streaming) |*s| s.cleanup();
                    loading.streaming = null;
                } else {
                    loading.cleanup(alloc);
                }
            }
        }

        // Start next tool execution if we have pending tools and not currently running one
        if (loading.hasToolsToExecute() and !loading.isExecutingTool()) {
            const tc = loading.pending_tools.items[loading.current_tool_idx];

            // Show tool execution in chat
            const tool_msg = std.fmt.allocPrint(alloc, "🔧 Executing: {s}", .{tc.name}) catch "";
            defer alloc.free(tool_msg);
            _ = database.addMessage(.system, tool_msg) catch {};
            try chat_history.reload(&database);

            // Start async execution
            if (loading.tool_executor) |*exec| {
                exec.execute(tc.id, tc.name, tc.input_json) catch {};
            }
        }

        // Poll for tool completion
        if (loading.tool_executor) |*exec| {
            if (exec.poll()) |result| {
                const result_content = if (result.result.success)
                    result.result.content
                else
                    (result.result.error_message orelse "Tool failed");

                // Add tool result to chat
                if (result_content.len > 0) {
                    const display_content = if (result_content.len > 2000) blk: {
                        const truncated = std.fmt.allocPrint(alloc, "{s}\n\n... ({d} bytes total)", .{ result_content[0..1500], result_content.len }) catch result_content;
                        break :blk truncated;
                    } else result_content;
                    defer if (display_content.ptr != result_content.ptr) alloc.free(display_content);

                    const status_icon: []const u8 = if (result.result.success) "✓" else "✗";
                    const trimmed_content = std.mem.trimRight(u8, display_content, " \t\n\r");
                    const result_msg = std.fmt.allocPrint(alloc, "{s} {s}:\n{s}", .{ status_icon, result.tool_name, trimmed_content }) catch "";
                    defer alloc.free(result_msg);

                    // Get path for read_file markdown rendering
                    const tc = loading.pending_tools.items[loading.current_tool_idx];
                    var tool_input_str: []const u8 = "";
                    if (std.mem.eql(u8, tc.name, "read_file")) {
                        const maybe_parsed = std.json.parseFromSlice(std.json.Value, alloc, tc.input_json, .{}) catch null;
                        defer if (maybe_parsed) |p| p.deinit();
                        if (maybe_parsed) |p| {
                            if (p.value.object.get("path")) |path_val| {
                                if (path_val == .string) {
                                    tool_input_str = path_val.string;
                                }
                            }
                        }
                    }

                    _ = database.addToolResult(tc.name, tool_input_str, result_msg) catch {};
                    try chat_history.reload(&database);
                }

                // Store result for continuation
                try loading.tool_results.append(alloc, .{
                    .tool_id = result.tool_id,
                    .tool_name = result.tool_name,
                    .content = try alloc.dupe(u8, result_content),
                    .success = result.result.success,
                    .input_json = try alloc.dupe(u8, loading.pending_tools.items[loading.current_tool_idx].input_json),
                });

                loading.current_tool_idx += 1;

                // Check if all tools done
                if (!loading.hasToolsToExecute()) {
                    // Build continuation request
                    var tool_results_json = std.ArrayListUnmanaged(u8){};
                    defer tool_results_json.deinit(alloc);

                    for (loading.tool_results.items) |tr| {
                        if (tool_results_json.items.len > 0) {
                            tool_results_json.append(alloc, ',') catch {};
                        }
                        const escaped_result = std.json.Stringify.valueAlloc(alloc, tr.content, .{}) catch continue;
                        defer alloc.free(escaped_result);
                        const tr_json = std.fmt.allocPrint(alloc,
                            \\{{"type":"tool_result","tool_use_id":"{s}","content":{s}}}
                        , .{ tr.tool_id, escaped_result }) catch continue;
                        defer alloc.free(tr_json);
                        tool_results_json.appendSlice(alloc, tr_json) catch {};
                    }

                    // Build full message history
                    const messages = database.getMessages(alloc) catch @constCast(&[_]db.Message{});
                    defer if (messages.len > 0) db.Database.freeMessages(alloc, messages);

                    var msg_buf = std.ArrayListUnmanaged(u8){};
                    defer msg_buf.deinit(alloc);
                    try msg_buf.append(alloc, '[');
                    var first = true;

                    for (messages) |msg| {
                        if (msg.role == .system or msg.ephemeral) continue;
                        if (!first) try msg_buf.append(alloc, ',');
                        first = false;
                        const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                        const escaped_content = std.json.Stringify.valueAlloc(alloc, msg.content, .{}) catch continue;
                        defer alloc.free(escaped_content);
                        const msg_json = std.fmt.allocPrint(alloc, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                        defer alloc.free(msg_json);
                        try msg_buf.appendSlice(alloc, msg_json);
                    }

                    // Add assistant message with tool_use blocks
                    if (!first) try msg_buf.append(alloc, ',');
                    const assistant_msg = std.fmt.allocPrint(alloc,
                        \\{{"role":"assistant","content":{s}}}
                    , .{loading.assistant_content_json orelse "[]"}) catch "";
                    defer alloc.free(assistant_msg);
                    try msg_buf.appendSlice(alloc, assistant_msg);

                    // Add user message with tool_result blocks
                    const user_results_msg = std.fmt.allocPrint(alloc,
                        \\,{{"role":"user","content":[{s}]}}
                    , .{tool_results_json.items}) catch "";
                    defer alloc.free(user_results_msg);
                    try msg_buf.appendSlice(alloc, user_results_msg);

                    try msg_buf.append(alloc, ']');

                    // Store continuation and clean up tool state
                    loading.pending_continuation = try alloc.dupe(u8, msg_buf.items);
                    loading.start_time = std.time.milliTimestamp();

                    // Clean up tool execution state
                    if (loading.tool_executor) |*e| e.deinit();
                    loading.tool_executor = null;
                    for (loading.tool_results.items) |tr| {
                        alloc.free(tr.tool_id);
                        alloc.free(tr.tool_name);
                        alloc.free(tr.content);
                        alloc.free(tr.input_json);
                    }
                    loading.tool_results.deinit(alloc);
                    loading.tool_results = .{};
                    for (loading.pending_tools.items) |pt| {
                        alloc.free(pt.id);
                        alloc.free(pt.name);
                        alloc.free(pt.input_json);
                    }
                    loading.pending_tools.deinit(alloc);
                    loading.pending_tools = .{};
                    if (loading.assistant_content_json) |a| alloc.free(a);
                    loading.assistant_content_json = null;
                }
            }
        }

        // Tick spinner animation
        const now = std.time.milliTimestamp();
        if (now - last_tick >= 80) {
            loading.tick();
            status_bar.tickSpinner();
            last_tick = now;
        }
        
        // Sync status bar busy state with loading
        status_bar.setBusy(loading.is_loading);

        // Render
        const win = event_loop.window();
        win.clear();

        const height = win.height;

        // Layout: header, chat area, input box, status bar
        const chrome_height = HEADER_HEIGHT + INPUT_HEIGHT + STATUS_HEIGHT;
        const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
        const input_y: u16 = HEADER_HEIGHT + chat_height;
        const status_bar_y: u16 = input_y + INPUT_HEIGHT;
        
        // Draw header at top
        const header_win = win.child(.{
            .x_off = 0,
            .y_off = 0,
            .width = win.width,
            .height = HEADER_HEIGHT,
        });
        header.draw(header_win, &database);
        
        // Draw chat area or logo
        if (chat_history.hasConversation() or loading.is_loading) {
            const chat_win = win.child(.{
                .x_off = 0,
                .y_off = HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            chat_history.draw(chat_win);
        } else {
            const content_win = win.child(.{
                .x_off = 0,
                .y_off = HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            logo.draw(content_win);
        }

        // Status bar at bottom
        if (loading.is_loading) {
            status_bar.setCustomStatus(" Smithers is thinking...");
        } else if (now - last_ctrl_c < 1500 and last_ctrl_c > 0) {
            status_bar.setCustomStatus(" Press Ctrl+C again to exit, or Ctrl+D");
        } else {
            status_bar.setCustomStatus(null);
        }
        
        // Draw status bar
        const actual_status_height = status_bar.getHeight();
        const status_win = win.child(.{
            .x_off = 0,
            .y_off = if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y,
            .width = win.width,
            .height = actual_status_height,
        });
        status_bar.draw(status_win);

        // Draw input at bottom
        const input_win = win.child(.{
            .x_off = 0,
            .y_off = input_y,
            .width = win.width,
            .height = INPUT_HEIGHT,
        });
        input.drawInWindow(input_win);

        try event_loop.render();

        // Small sleep to avoid busy loop
        if (loading.is_loading) {
            std.Thread.sleep(16 * std.time.ns_per_ms);
        }
    }
}

test {
    _ = @import("commands/select_list.zig");
    _ = @import("commands/command_popup.zig");
    _ = @import("commands/slash_command.zig");
}
