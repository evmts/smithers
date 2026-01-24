const std = @import("std");
const vaxis = @import("vaxis");
const sqlite = @import("sqlite");

const app_mod = @import("app.zig");
const db = @import("db.zig");
const event_loop_mod = @import("event_loop.zig");
const event_mod = @import("event.zig");
const renderer_mod = @import("rendering/renderer.zig");
const anthropic = @import("agent/anthropic_provider.zig");
const environment_mod = @import("environment.zig");
const clock_mod = @import("clock.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");
const obs = @import("obs.zig");

const ProductionRenderer = renderer_mod.Renderer(renderer_mod.VaxisBackend);
const ProductionEvent = event_mod.Event(ProductionRenderer);

/// Production App - all dependencies explicitly wired
const App = app_mod.App(
    db.Database(sqlite.Db),
    event_loop_mod.EventLoop(vaxis.Vaxis, vaxis.Tty, ProductionEvent),
    ProductionRenderer,
    anthropic.AnthropicStreamingProvider,
    environment_mod.Environment(environment_mod.PosixEnv),
    clock_mod.Clock(clock_mod.StdClock),
    tool_executor_mod.ToolExecutor(tool_executor_mod.BuiltinRegistryFactory),
);

var log_file: ?std.fs.File = null;

pub const std_options: std.Options = .{
    .log_level = .debug,
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

pub const panic = vaxis.panic_handler;

pub fn main() !void {
    // Initialize observability first (reads SMITHERS_DEBUG_LEVEL)
    obs.initGlobal();
    defer obs.deinitGlobal();

    log_file = std.fs.createFileAbsolute("/tmp/smithers-tui.log", .{ .truncate = true }) catch null;
    defer if (log_file) |f| f.close();

    obs.global.logSimple(.info, @src(), "startup", "=== Smithers TUI starting ===");
    std.log.debug("=== Smithers TUI starting ===", .{});

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();

    obs.global.logSimple(.debug, @src(), "init", "Creating App...");
    var app = try App.init(gpa.allocator());
    defer app.deinit();

    obs.global.logSimple(.info, @src(), "run", "Starting main loop");
    try app.run();
}

test {
    _ = @import("commands/select_list.zig");
    _ = @import("commands/command_popup.zig");
    _ = @import("commands/slash_command.zig");
    _ = @import("tests/command_popup_test.zig");
    _ = @import("tests/event_test.zig");
    _ = @import("tests/tool_executor_test.zig");
    _ = @import("tests/provider_interface_test.zig");
    _ = @import("tests/registry_test.zig");
    _ = @import("tests/markdown_syntax_test.zig");
    _ = @import("tests/layout_test.zig");
    // _ = @import("tests/logger_test.zig"); // TODO: Fix for Zig 0.15.2 File.Writer API change
    // _ = @import("tests/write_file_test.zig"); // TODO: Fix for Zig 0.15.2 API changes
    _ = @import("tests/bash_tool_test.zig");
    _ = @import("tests/agent_test.zig");
    _ = @import("tests/grep_test.zig");
    // _ = @import("tests/glob_test.zig"); // TODO: Fix bus error in freeResult
    // _ = @import("tests/mouse_test.zig"); // TODO: Fix for Zig 0.15.2 API changes
    // _ = @import("tests/kill_ring_test.zig"); // TODO: Fix for Zig 0.15.2 API changes
    _ = @import("tests/editor_module_test.zig");
    _ = @import("tests/message_cell_test.zig");
    _ = @import("tests/print_test.zig");
    _ = @import("tests/interactive_test.zig");
    _ = @import("obs.zig");
}
