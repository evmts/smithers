// CLI mode - non-interactive agent test using StdoutBackend
const std = @import("std");
const sqlite = @import("sqlite");

const db = @import("db.zig");
const anthropic = @import("agent/anthropic_provider.zig");
const loop_mod = @import("agent/loop.zig");
const loading_mod = @import("loading.zig");
const clock_mod = @import("clock.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");
const renderer_mod = @import("rendering/renderer.zig");
const chat_history_mod = @import("components/chat_history.zig");
const obs = @import("obs.zig");

// CLI types using StdoutBackend
const StdoutRenderer = renderer_mod.Renderer(renderer_mod.StdoutBackend);
const Database = db.Database(sqlite.Db);
const Clock = clock_mod.Clock(clock_mod.StdClock);
const ToolExec = tool_executor_mod.ToolExecutor(tool_executor_mod.BuiltinRegistryFactory);
const Loading = loading_mod.LoadingState(Clock, ToolExec);
const AgentLoop = loop_mod.AgentLoop(anthropic.AnthropicStreamingProvider, Loading, ToolExec, StdoutRenderer);
const ChatHistory = chat_history_mod.ChatHistory(StdoutRenderer);

pub fn runCli(alloc: std.mem.Allocator, prompt: []const u8) !void {
    obs.initGlobal();
    defer obs.deinitGlobal();

    obs.global.logSimple(.info, @src(), "cli.start", "=== CLI mode starting ===");
    std.debug.print("=== Smithers CLI Mode ===\n", .{});
    std.debug.print("Prompt: {s}\n\n", .{prompt});

    // Check API key
    const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
        std.debug.print("ERROR: ANTHROPIC_API_KEY not set\n", .{});
        return error.MissingApiKey;
    };
    std.debug.print("API key: {s}...{s} (len={d})\n", .{
        api_key[0..@min(4, api_key.len)],
        api_key[@max(api_key.len, 4) - 4 ..],
        api_key.len,
    });

    // Create in-memory database
    var database = try Database.init(alloc, ":memory:");
    defer database.deinit();

    // Add user message
    _ = try database.addMessage(.user, prompt);
    std.debug.print("Added user message to DB\n", .{});

    // Create chat history (for AgentLoop compatibility)
    var chat_history = ChatHistory.init(alloc);
    defer chat_history.deinit();
    try chat_history.reload(&database);

    // Create loading state
    var loading = Loading{};
    loading.pending_query = try alloc.dupe(u8, prompt);
    loading.startLoading();

    std.debug.print("Loading state: is_loading={} start_time={d}\n", .{
        loading.isLoading(),
        loading.start_time,
    });

    // Create agent loop
    var agent_loop = AgentLoop.init(alloc, &loading);

    // Tick loop with timeout
    const start = std.time.milliTimestamp();
    const timeout_ms: i64 = 120_000; // 2 minute timeout
    var tick_count: u64 = 0;

    std.debug.print("\n--- Starting agent loop ---\n", .{});

    while (loading.isLoading()) {
        tick_count += 1;
        const elapsed = std.time.milliTimestamp() - start;

        if (elapsed > timeout_ms) {
            std.debug.print("TIMEOUT after {d}ms\n", .{elapsed});
            break;
        }

        // Log state every 100 ticks
        if (tick_count % 100 == 0) {
            std.debug.print("tick #{d}: is_loading={} stream={} pending_q={} pending_cont={} tools={d}/{d} elapsed={d}ms\n", .{
                tick_count,
                loading.isLoading(),
                agent_loop.streaming != null,
                loading.pending_query != null,
                loading.pending_continuation != null,
                loading.current_tool_idx,
                loading.pending_tools.items.len,
                elapsed,
            });
        }

        const state_changed = agent_loop.tick(&database) catch |err| {
            std.debug.print("tick error: {s}\n", .{@errorName(err)});
            break;
        };

        // Reload chat history from DB when state changes (CLI is single-threaded)
        if (state_changed) {
            chat_history.reload(&database) catch {};
        }

        // Check streaming state
        if (agent_loop.streaming) |*stream| {
            if (tick_count % 50 == 0) {
                std.debug.print("  stream: text_len={d} tools={d} is_done={}\n", .{
                    stream.accumulated_text.items.len,
                    stream.tool_calls.items.len,
                    stream.is_done,
                });
            }
        }

        std.Thread.sleep(10 * std.time.ns_per_ms);
    }

    std.debug.print("\n--- Agent loop finished after {d} ticks ---\n", .{tick_count});

    // Get final messages from DB
    const messages = database.getMessages(alloc) catch @constCast(&[_]db.Message{});
    defer if (messages.len > 0) Database.freeMessages(alloc, messages);

    std.debug.print("\n=== Final Messages ({d}) ===\n", .{messages.len});
    for (messages, 0..) |msg, i| {
        const role_str: []const u8 = switch (msg.role) {
            .user => "USER",
            .assistant => "ASSISTANT",
            .system => "SYSTEM",
        };
        std.debug.print("\n[{d}] {s}:\n", .{ i, role_str });
        // Print full content for assistant messages
        if (msg.role == .assistant) {
            std.debug.print("{s}\n", .{msg.content});
        } else {
            const preview_len = @min(msg.content.len, 500);
            const suffix: []const u8 = if (msg.content.len > 500) "..." else "";
            std.debug.print("{s}{s}\n", .{ msg.content[0..preview_len], suffix });
        }
    }
}

pub fn printUsage() void {
    std.debug.print(
        \\Usage: smithers-tui [options] [prompt]
        \\
        \\Options:
        \\  --cli <prompt>   Run in CLI mode (non-interactive)
        \\  --help           Show this help
        \\
        \\Examples:
        \\  smithers-tui --cli "What is 2+2?"
        \\  smithers-tui --cli "Read the file main.zig"
        \\
    , .{});
}
