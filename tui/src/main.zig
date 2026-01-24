const std = @import("std");
const vaxis = @import("vaxis");
const sqlite = @import("sqlite");

const app_mod = @import("app.zig");
const db = @import("db.zig");
const event_loop_mod = @import("event_loop.zig");
const renderer_mod = @import("rendering/renderer.zig");
const anthropic = @import("agent/anthropic_provider.zig");
const environment_mod = @import("environment.zig");
const clock_mod = @import("clock.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");

/// Production App - all dependencies explicitly wired
const App = app_mod.App(
    db.Database(sqlite.Db),
    event_loop_mod.EventLoop(vaxis.Vaxis, vaxis.Tty),
    renderer_mod.Renderer(renderer_mod.VaxisBackend),
    anthropic.AnthropicStreamingProvider,
    environment_mod.Environment(environment_mod.PosixEnv),
    clock_mod.Clock(clock_mod.StdClock),
    tool_executor_mod.ToolExecutor(tool_executor_mod.BuiltinRegistryFactory),
);

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

pub const panic = vaxis.panic_handler;

pub fn main() !void {
    log_file = std.fs.createFileAbsolute("/tmp/smithers-tui.log", .{ .truncate = true }) catch null;
    defer if (log_file) |f| f.close();

    std.log.debug("=== Smithers TUI starting ===", .{});

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();

    var app = try App.init(gpa.allocator());
    defer app.deinit();
    try app.run();
}

test {
    _ = @import("commands/select_list.zig");
    _ = @import("commands/command_popup.zig");
    _ = @import("commands/slash_command.zig");
}
