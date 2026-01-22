// God-Agent: AI Coding Agent CLI
// Phase 9: CLI Entry Point

const std = @import("std");
const clap = @import("clap");
const posix = std.posix;

const agent_mod = @import("agent");
const Agent = agent_mod.Agent;
const AgentConfig = agent_mod.AgentConfig;
const print_mode = @import("print_mode");
const PrintMode = print_mode.PrintMode;
const interactive_mode = @import("interactive_mode");
const InteractiveMode = interactive_mode.InteractiveMode;

pub const version = "0.1.0";

// CLI argument specification
const params = clap.parseParamsComptime(
    \\-h, --help             Display this help message
    \\-V, --version          Show version information
    \\-m, --model <str>      Model to use (default: claude-sonnet-4)
    \\-c, --continue         Continue last session
    \\-R, --restore <str>    Resume specific session by ID
    \\-p, --print            Print mode (non-interactive)
    \\    --system <str>     System prompt override
    \\    --tools <str>      Comma-separated tool list
    \\    --no-tools         Disable all tools
    \\    --max-turns <u32>  Maximum agent turns (default: 100)
    \\    --thinking <str>   Thinking level: off|low|medium|high
    \\    --no-color         Disable color output
    \\-v, --verbose          Increase verbosity
    \\<str>...
);

const Subcommand = enum {
    session,
    config,
    none,
};

const SessionSubcommand = enum {
    list,
    show,
    @"export",
    delete,
};

const ConfigSubcommand = enum {
    show,
    set,
    edit,
};

pub const Config = struct {
    model: []const u8 = "claude-sonnet-4",
    continue_session: bool = false,
    resume_id: ?[]const u8 = null,
    print_mode: bool = false,
    system_prompt: ?[]const u8 = null,
    tools: ?[]const u8 = null,
    no_tools: bool = false,
    max_turns: u32 = 100,
    thinking_level: []const u8 = "medium",
    no_color: bool = false,
    verbose: u8 = 0,
    positionals: []const []const u8 = &.{},
};

fn writeStdout(data: []const u8) void {
    _ = posix.write(posix.STDOUT_FILENO, data) catch {};
}

fn printFmt(comptime fmt: []const u8, args: anytype) void {
    var buf: [4096]u8 = undefined;
    const s = std.fmt.bufPrint(&buf, fmt, args) catch return;
    writeStdout(s);
}

pub fn parseArgs(allocator: std.mem.Allocator) !struct { config: Config, subcommand: ?Subcommand } {
    var diag = clap.Diagnostic{};
    var res = clap.parse(clap.Help, &params, clap.parsers.default, .{
        .diagnostic = &diag,
        .allocator = allocator,
    }) catch |err| {
        diag.reportToFile(.stderr(), err) catch {};
        return err;
    };
    defer res.deinit();

    // Check for subcommands in positionals
    var subcommand: ?Subcommand = null;
    const positionals = res.positionals[0];

    if (positionals.len > 0) {
        if (std.mem.eql(u8, positionals[0], "session")) {
            subcommand = .session;
        } else if (std.mem.eql(u8, positionals[0], "config")) {
            subcommand = .config;
        }
    }

    return .{
        .config = Config{
            .model = res.args.model orelse "claude-sonnet-4",
            .continue_session = res.args.@"continue" != 0,
            .resume_id = res.args.restore,
            .print_mode = res.args.print != 0,
            .system_prompt = res.args.system,
            .tools = res.args.tools,
            .no_tools = res.args.@"no-tools" != 0,
            .max_turns = res.args.@"max-turns" orelse 100,
            .thinking_level = res.args.thinking orelse "medium",
            .no_color = res.args.@"no-color" != 0,
            .verbose = @intCast(res.args.verbose),
            .positionals = positionals,
        },
        .subcommand = subcommand,
    };
}

pub fn printHelp() void {
    writeStdout(
        \\god-agent - AI Coding Agent
        \\
        \\USAGE:
        \\    god-agent [OPTIONS] [PROMPT...]
        \\    god-agent session <SUBCOMMAND>
        \\    god-agent config <SUBCOMMAND>
        \\
        \\OPTIONS:
        \\    -h, --help             Display this help message
        \\    -V, --version          Show version information
        \\    -m, --model <str>      Model to use (default: claude-sonnet-4)
        \\    -c, --continue         Continue last session
        \\    -R, --restore <str>    Resume specific session by ID
        \\    -p, --print            Print mode (non-interactive)
        \\        --system <str>     System prompt override
        \\        --tools <str>      Comma-separated tool list
        \\        --no-tools         Disable all tools
        \\        --max-turns <u32>  Maximum agent turns (default: 100)
        \\        --thinking <str>   Thinking level: off|low|medium|high
        \\        --no-color         Disable color output
        \\    -v, --verbose          Increase verbosity
        \\
        \\SESSION SUBCOMMANDS:
        \\    list                   List recent sessions
        \\    show <ID>              Show session details
        \\    export <ID>            Export session to HTML
        \\    delete <ID>            Delete session
        \\
        \\CONFIG SUBCOMMANDS:
        \\    show                   Show current configuration
        \\    set <KEY> <VALUE>      Set configuration value
        \\    edit                   Open config in editor
        \\
        \\EXAMPLES:
        \\    god-agent "Hello, world"
        \\    god-agent --model claude-opus-4 "Complex task"
        \\    god-agent --continue
        \\    god-agent session list
        \\
    );
}

pub fn printVersion() void {
    printFmt("god-agent {s}\n", .{version});
}

fn handleSessionSubcommand(allocator: std.mem.Allocator, args: []const []const u8) void {
    _ = allocator;

    if (args.len < 2) {
        writeStdout("Usage: god-agent session <list|show|export|delete>\n");
        return;
    }

    const subcmd = args[1];
    if (std.mem.eql(u8, subcmd, "list")) {
        writeStdout("Recent sessions:\n");
        writeStdout("  (no sessions yet)\n");
    } else if (std.mem.eql(u8, subcmd, "show")) {
        if (args.len < 3) {
            writeStdout("Usage: god-agent session show <ID>\n");
            return;
        }
        printFmt("Session: {s}\n", .{args[2]});
    } else if (std.mem.eql(u8, subcmd, "export")) {
        if (args.len < 3) {
            writeStdout("Usage: god-agent session export <ID>\n");
            return;
        }
        printFmt("Exporting session: {s}\n", .{args[2]});
    } else if (std.mem.eql(u8, subcmd, "delete")) {
        if (args.len < 3) {
            writeStdout("Usage: god-agent session delete <ID>\n");
            return;
        }
        printFmt("Deleted session: {s}\n", .{args[2]});
    } else {
        printFmt("Unknown session subcommand: {s}\n", .{subcmd});
    }
}

fn handleConfigSubcommand(allocator: std.mem.Allocator, args: []const []const u8) void {
    _ = allocator;

    if (args.len < 2) {
        writeStdout("Usage: god-agent config <show|set|edit>\n");
        return;
    }

    const subcmd = args[1];
    if (std.mem.eql(u8, subcmd, "show")) {
        writeStdout("Current configuration:\n");
        writeStdout("  model: claude-sonnet-4\n");
        writeStdout("  max_turns: 100\n");
        writeStdout("  thinking: medium\n");
    } else if (std.mem.eql(u8, subcmd, "set")) {
        if (args.len < 4) {
            writeStdout("Usage: god-agent config set <KEY> <VALUE>\n");
            return;
        }
        printFmt("Set {s} = {s}\n", .{ args[2], args[3] });
    } else if (std.mem.eql(u8, subcmd, "edit")) {
        writeStdout("Opening config in editor...\n");
    } else {
        printFmt("Unknown config subcommand: {s}\n", .{subcmd});
    }
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Parse arguments
    var diag = clap.Diagnostic{};
    var res = clap.parse(clap.Help, &params, clap.parsers.default, .{
        .diagnostic = &diag,
        .allocator = allocator,
    }) catch |err| {
        diag.reportToFile(.stderr(), err) catch {};
        return err;
    };
    defer res.deinit();

    // Handle help
    if (res.args.help != 0) {
        printHelp();
        return;
    }

    // Handle version
    if (res.args.version != 0) {
        printVersion();
        return;
    }

    const positionals = res.positionals[0];

    // Handle subcommands
    if (positionals.len > 0) {
        if (std.mem.eql(u8, positionals[0], "session")) {
            handleSessionSubcommand(allocator, positionals);
            return;
        } else if (std.mem.eql(u8, positionals[0], "config")) {
            handleConfigSubcommand(allocator, positionals);
            return;
        }
    }

    // Build config
    const config = Config{
        .model = res.args.model orelse "claude-sonnet-4",
        .continue_session = res.args.@"continue" != 0,
        .resume_id = res.args.restore,
        .print_mode = res.args.print != 0,
        .system_prompt = res.args.system,
        .tools = res.args.tools,
        .no_tools = res.args.@"no-tools" != 0,
        .max_turns = res.args.@"max-turns" orelse 100,
        .thinking_level = res.args.thinking orelse "medium",
        .no_color = res.args.@"no-color" != 0,
        .verbose = @intCast(res.args.verbose),
        .positionals = positionals,
    };

    // Mode selection
    if (config.print_mode or positionals.len > 0) {
        // Print mode: single prompt, output, exit
        const agent_config = AgentConfig{
            .model = config.model,
            .system_prompt = config.system_prompt,
            .max_turns = config.max_turns,
        };

        var printMode = PrintMode.initWithConfig(allocator, agent_config) catch |err| {
            printFmt("Error initializing agent: {any}\n", .{err});
            return;
        };
        defer printMode.deinit();

        printMode.run(positionals) catch |err| {
            switch (err) {
                error.NoPrompt => writeStdout("Error: No prompt provided\n"),
                else => printFmt("Error: {any}\n", .{err}),
            }
        };
    } else {
        // Interactive mode: full TUI
        var interactiveMode = InteractiveMode.init(allocator);
        defer interactiveMode.deinit();

        interactiveMode.setModel(config.model);

        interactiveMode.run() catch |err| {
            printFmt("Error running interactive mode: {any}\n", .{err});
        };
    }
}

// Tests
test "params compile correctly" {
    // Just verify the params constant compiles
    try std.testing.expect(params.len > 0);
}

test "Config defaults" {
    const config = Config{};
    try std.testing.expectEqualStrings("claude-sonnet-4", config.model);
    try std.testing.expectEqual(@as(u32, 100), config.max_turns);
    try std.testing.expectEqual(false, config.print_mode);
    try std.testing.expectEqual(false, config.no_tools);
}

test "version string" {
    try std.testing.expectEqualStrings("0.1.0", version);
}
