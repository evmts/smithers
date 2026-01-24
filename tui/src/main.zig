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
const AgentLoop = @import("agent/loop.zig").AgentLoop;
const Layout = @import("layout.zig").Layout;
const loading_mod = @import("loading.zig");
const KeyHandler = @import("keys/handler.zig").KeyHandler;
const KeyContext = @import("keys/handler.zig").KeyContext;

pub const panic = vaxis.panic_handler;

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

    var loading = loading_mod.LoadingState{};
    var key_handler = KeyHandler.init(alloc);
    var agent_loop = AgentLoop.init(alloc, &loading);

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
                        const raw_row: i16 = mouse.row - @as(i16, Layout.HEADER_HEIGHT);
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

                    var ctx = KeyContext{
                        .input = &input,
                        .chat_history = &chat_history,
                        .database = &database,
                        .status_bar = &status_bar,
                        .event_loop = &event_loop,
                        .loading = &loading,
                        .has_ai = has_ai,
                    };

                    const action = try key_handler.handleKey(key, &ctx);
                    switch (action) {
                        .exit => return,
                        .suspend_tui => try event_loop.suspendTui(),
                        .redraw => try event_loop.render(),
                        .reload_chat => try chat_history.reload(&database),
                        .start_ai_query => |_| {},
                        .none => {},
                    }
                },
            }
        }

        // Process agent loop (streaming, tool execution, continuations)
        _ = try agent_loop.tick(&database, &chat_history);

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
        const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
        const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
        const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
        const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;
        
        // Draw header at top
        const header_win = win.child(.{
            .x_off = 0,
            .y_off = 0,
            .width = win.width,
            .height = Layout.HEADER_HEIGHT,
        });
        header.draw(header_win, &database);
        
        // Draw chat area or logo
        if (chat_history.hasConversation() or loading.is_loading) {
            const chat_win = win.child(.{
                .x_off = 0,
                .y_off = Layout.HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            chat_history.draw(chat_win);
        } else {
            const content_win = win.child(.{
                .x_off = 0,
                .y_off = Layout.HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            logo.draw(content_win);
        }

        // Status bar at bottom
        if (loading.is_loading) {
            status_bar.setCustomStatus(" Smithers is thinking...");
        } else if (now - key_handler.last_ctrl_c < 1500 and key_handler.last_ctrl_c > 0) {
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
            .height = Layout.INPUT_HEIGHT,
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
