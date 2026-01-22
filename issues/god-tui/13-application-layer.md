# Application Layer - Engineering Specification

## Overview

The Application Layer transforms the God-TUI library into a complete AI coding agent like pi-mono/Claude Code. This spec defines the components needed to build a full interactive terminal application.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                  │
│  main.zig → CLI Parser → Mode Selection → Agent Loop → Interactive Mode     │
├─────────────────────────────────────────────────────────────────────────────┤
│                          GOD-TUI LIBRARY                                     │
│  Terminal │ Rendering │ Components │ Editor │ Overlay │ Session │ Extension │
├─────────────────────────────────────────────────────────────────────────────┤
│                          EXTERNAL DEPENDENCIES                               │
│  ai-zig (LLM providers) │ zig-clap (CLI parsing)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Dependencies

### 1.1 zig-clap (CLI Parsing)

**Repository**: https://github.com/Hejsil/zig-clap  
**Version**: 0.11.0 (latest)

```zig
// build.zig.zon
.dependencies = .{
    .clap = .{
        .url = "https://github.com/Hejsil/zig-clap/archive/0.11.0.tar.gz",
        .hash = "...",
    },
},
```

**Features Used**:
- Short/long arguments: `-m`, `--model`
- Value passing: `--model=claude-4`, `--model claude-4`
- Chaining: `-vvv` for verbosity
- Subcommands: `agent chat`, `agent session list`
- Auto-generated help: `--help`, `-h`
- Typed parsing: `--port <u16>`, `--timeout <usize>`

**Example Usage**:
```zig
const clap = @import("clap");

const params = comptime clap.parseParamsComptime(
    \\-h, --help          Display help
    \\-m, --model <str>   Model to use (default: claude-sonnet-4)
    \\-c, --continue      Continue last session
    \\-r, --resume <str>  Resume specific session
    \\-v, --verbose       Increase verbosity
    \\    --no-color      Disable color output
    \\<str>...            Initial prompt
);

pub fn main() !void {
    var res = try clap.parse(params, std.process.args(), .{});
    defer res.deinit();
    
    const model = res.args.model orelse "claude-sonnet-4";
    const continue_session = res.args.@"continue" != 0;
    const prompt = res.positionals;
}
```

### 1.2 ai-zig (LLM Providers)

**Repository**: https://github.com/evmts/ai-zig  
**Version**: main branch

```zig
// build.zig.zon
.dependencies = .{
    .ai = .{
        .url = "https://github.com/evmts/ai-zig/archive/main.tar.gz",
        .hash = "...",
    },
},
```

**Features Used**:
- **30+ providers**: OpenAI, Anthropic, Google, Bedrock, etc.
- **Streaming**: Callback-based for real-time responses
- **Tool calling**: Full support for function/tool execution
- **Structured output**: JSON schema validation
- **Arena allocators**: Request-scoped memory management

**Example Usage**:
```zig
const ai = @import("ai");

// Create provider
var arena = std.heap.ArenaAllocator.init(allocator);
defer arena.deinit();

const anthropic = ai.anthropic.init(arena.allocator(), .{
    .api_key = std.posix.getenv("ANTHROPIC_API_KEY"),
});

// Stream response
const model = anthropic.model("claude-sonnet-4-20250514");
try model.stream(.{
    .messages = &.{
        .{ .role = .user, .content = "Hello!" },
    },
    .tools = &tools,
    .on_chunk = struct {
        fn callback(chunk: ai.StreamChunk) void {
            switch (chunk) {
                .text => |t| std.io.getStdOut().writeAll(t),
                .tool_call => |tc| handleToolCall(tc),
                .done => {},
            }
        }
    }.callback,
});
```

**Tool Definition**:
```zig
const tools = &[_]ai.Tool{
    .{
        .name = "read_file",
        .description = "Read contents of a file",
        .parameters = .{
            .type = .object,
            .properties = .{
                .path = .{ .type = .string, .description = "File path" },
            },
            .required = &.{"path"},
        },
        .execute = readFileTool,
    },
};

fn readFileTool(params: anytype) ai.ToolResult {
    const path = params.path;
    const content = std.fs.cwd().readFileAlloc(allocator, path, 1024 * 1024);
    return .{ .content = content };
}
```

---

## 2. CLI Interface

### 2.1 Command Structure

```
god-agent [OPTIONS] [PROMPT...]
god-agent session <SUBCOMMAND>
god-agent config <SUBCOMMAND>

OPTIONS:
    -h, --help              Show help message
    -V, --version           Show version
    -m, --model <MODEL>     Model to use (default: claude-sonnet-4)
    -c, --continue          Continue last session
    -r, --resume <ID>       Resume specific session
    -p, --print             Print mode (non-interactive)
    --system <PROMPT>       System prompt override
    --tools <NAMES>         Comma-separated tool list
    --no-tools              Disable all tools
    --max-turns <N>         Maximum agent turns
    --thinking <LEVEL>      Thinking level: off|low|medium|high
    --no-color              Disable color output
    -v, --verbose           Increase verbosity (can stack: -vvv)

SESSION SUBCOMMANDS:
    list                    List recent sessions
    show <ID>               Show session details
    export <ID>             Export session to HTML
    delete <ID>             Delete session

CONFIG SUBCOMMANDS:
    show                    Show current config
    set <KEY> <VALUE>       Set config value
    edit                    Open config in editor
```

### 2.2 Main Entry Point

```zig
// src/main.zig

const std = @import("std");
const clap = @import("clap");
const god_tui = @import("god-tui");
const ai = @import("ai");

const Agent = @import("agent/agent.zig").Agent;
const InteractiveMode = @import("modes/interactive.zig").InteractiveMode;
const PrintMode = @import("modes/print.zig").PrintMode;
const SessionManager = god_tui.session.SessionManager;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Parse CLI arguments
    const args = try parseArgs(allocator);
    defer args.deinit();

    // Handle subcommands
    if (args.subcommand) |sub| {
        switch (sub) {
            .session => return handleSessionSubcommand(sub.session, allocator),
            .config => return handleConfigSubcommand(sub.config, allocator),
        }
    }

    // Initialize AI provider
    const provider = try initProvider(allocator, args.model);
    defer provider.deinit();

    // Initialize session
    var session_manager = try SessionManager.init(allocator, std.fs.cwd());
    defer session_manager.deinit();

    if (args.@"continue") {
        try session_manager.continueRecent();
    } else if (args.resume) |id| {
        try session_manager.resume(id);
    }

    // Create agent
    var agent = Agent.init(allocator, .{
        .provider = provider,
        .session = &session_manager,
        .tools = args.tools,
        .system_prompt = args.system,
        .max_turns = args.max_turns,
        .thinking_level = args.thinking,
    });
    defer agent.deinit();

    // Select mode
    if (args.print or args.positionals.len > 0) {
        // Print mode: single prompt, output, exit
        var print_mode = PrintMode.init(allocator, &agent);
        defer print_mode.deinit();
        try print_mode.run(args.positionals);
    } else {
        // Interactive mode: full TUI
        var interactive = InteractiveMode.init(allocator, &agent, &session_manager);
        defer interactive.deinit();
        try interactive.run();
    }
}
```

---

## 3. Agent Loop

### 3.1 Core Agent Structure

```zig
// src/agent/agent.zig

pub const Agent = struct {
    allocator: Allocator,
    provider: *ai.Provider,
    session: *SessionManager,
    tools: ToolRegistry,
    
    // State
    messages: ArrayList(Message),
    is_running: bool = false,
    current_turn: u32 = 0,
    
    // Configuration
    config: AgentConfig,
    
    // Queues (per pi-mono spec)
    steering_queue: ArrayList(Message),  // Interrupt mid-run
    follow_up_queue: ArrayList(Message), // After completion
    
    // Event emitter
    on_event: ?*const fn (AgentEvent) void = null,
    
    const Self = @This();
    
    pub fn init(allocator: Allocator, config: AgentConfig) Self {
        return .{
            .allocator = allocator,
            .provider = config.provider,
            .session = config.session,
            .tools = ToolRegistry.initBuiltin(allocator),
            .messages = ArrayList(Message).init(allocator),
            .config = config,
            .steering_queue = ArrayList(Message).init(allocator),
            .follow_up_queue = ArrayList(Message).init(allocator),
        };
    }
    
    /// Main prompt entry point - yields events via callback
    pub fn prompt(self: *Self, message: Message) !void {
        try self.messages.append(message);
        try self.session.appendMessage(message);
        
        self.emit(.{ .type = .agent_start });
        defer self.emit(.{ .type = .agent_end });
        
        try self.agentLoop();
    }
    
    /// Interrupt current execution with new message
    pub fn steer(self: *Self, message: Message) void {
        self.steering_queue.append(message) catch {};
        self.abortCurrentTool();
    }
    
    /// Queue message for after current turn completes
    pub fn followUp(self: *Self, message: Message) void {
        self.follow_up_queue.append(message) catch {};
    }
    
    /// Abort current operation
    pub fn abort(self: *Self) void {
        self.is_running = false;
    }
};
```

### 3.2 Agent Loop Implementation

```zig
fn agentLoop(self: *Self) !void {
    self.is_running = true;
    defer self.is_running = false;
    
    while (self.is_running) {
        // Check steering queue
        if (self.steering_queue.items.len > 0) {
            const steering_msg = self.steering_queue.orderedRemove(0);
            try self.messages.append(steering_msg);
            continue;
        }
        
        // Check turn limit
        if (self.current_turn >= self.config.max_turns) {
            self.emit(.{ .type = .max_turns_reached });
            break;
        }
        
        self.current_turn += 1;
        self.emit(.{ .type = .turn_start, .turn = self.current_turn });
        
        // Stream LLM response
        var response = try self.streamResponse();
        defer response.deinit();
        
        // Handle tool calls
        if (response.tool_calls.len > 0) {
            for (response.tool_calls) |tool_call| {
                // Check for steering interrupt
                if (self.steering_queue.items.len > 0) break;
                
                self.emit(.{ .type = .tool_start, .tool = tool_call });
                
                const result = try self.executeTool(tool_call);
                
                self.emit(.{ .type = .tool_end, .tool = tool_call, .result = result });
                
                try self.messages.append(.{
                    .role = .tool_result,
                    .tool_call_id = tool_call.id,
                    .content = result.content,
                    .is_error = result.is_error,
                });
            }
            continue; // Loop for tool results
        }
        
        // End turn if no tool calls
        if (response.stop_reason == .end_turn) {
            break;
        }
        
        self.emit(.{ .type = .turn_end, .turn = self.current_turn });
    }
    
    // Process follow-up queue
    while (self.follow_up_queue.items.len > 0) {
        const msg = self.follow_up_queue.orderedRemove(0);
        try self.messages.append(msg);
        try self.agentLoop();
    }
}

fn streamResponse(self: *Self) !AssistantMessage {
    var response = AssistantMessage.init(self.allocator);
    
    const context = self.buildContext();
    
    try self.provider.stream(.{
        .model = self.config.model,
        .messages = context.messages,
        .tools = self.tools.getActiveTools(),
        .system = context.system_prompt,
        .on_chunk = struct {
            fn callback(chunk: ai.StreamChunk, ctx: *Self) void {
                switch (chunk) {
                    .text_delta => |delta| {
                        ctx.emit(.{ .type = .text_delta, .text = delta });
                    },
                    .thinking_delta => |delta| {
                        ctx.emit(.{ .type = .thinking_delta, .text = delta });
                    },
                    .tool_call_delta => |delta| {
                        ctx.emit(.{ .type = .tool_call_delta, .data = delta });
                    },
                    .done => |msg| {
                        response = msg;
                    },
                }
            }
        }.callback,
        .callback_ctx = self,
    });
    
    return response;
}
```

---

## 4. Built-in Tools

### 4.1 Tool Registry

```zig
// src/agent/tools.zig

pub const ToolRegistry = struct {
    tools: StringHashMap(Tool),
    active_tools: StringHashSet,
    allocator: Allocator,
    
    pub fn initBuiltin(allocator: Allocator) ToolRegistry {
        var registry = ToolRegistry{
            .tools = StringHashMap(Tool).init(allocator),
            .active_tools = StringHashSet.init(allocator),
            .allocator = allocator,
        };
        
        // Register built-in tools
        registry.register(read_file_tool);
        registry.register(write_file_tool);
        registry.register(edit_file_tool);
        registry.register(bash_tool);
        registry.register(glob_tool);
        registry.register(grep_tool);
        registry.register(list_dir_tool);
        
        return registry;
    }
};
```

### 4.2 Core Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_file` | Read file contents | `path: string` |
| `write_file` | Write/create file | `path: string, content: string` |
| `edit_file` | Search/replace edit | `path: string, old: string, new: string` |
| `bash` | Execute shell command | `command: string, cwd?: string` |
| `glob` | Find files by pattern | `pattern: string, limit?: int` |
| `grep` | Search file contents | `pattern: string, path?: string` |
| `list_dir` | List directory | `path: string` |

```zig
// Example: read_file tool
pub const read_file_tool = Tool{
    .name = "read_file",
    .description = "Read the contents of a file at the given path",
    .parameters = .{
        .type = .object,
        .properties = .{
            .path = .{
                .type = .string,
                .description = "Absolute path to the file",
            },
        },
        .required = &.{"path"},
    },
    .execute = struct {
        fn exec(params: anytype, ctx: *ToolContext) ToolResult {
            const path = params.path;
            
            const content = std.fs.cwd().readFileAlloc(
                ctx.allocator,
                path,
                10 * 1024 * 1024, // 10MB limit
            ) catch |err| {
                return .{
                    .content = std.fmt.allocPrint(
                        ctx.allocator,
                        "Error reading file: {s}",
                        .{@errorName(err)},
                    ),
                    .is_error = true,
                };
            };
            
            return .{ .content = content };
        }
    }.exec,
};
```

---

## 5. Interactive Mode

### 5.1 UI Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ god-agent v0.1.0 │ claude-sonnet-4 │ session: abc123               │ <- Header
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ > Hello, how can I help you today?                                  │ <- Chat
│                                                                     │   History
│ User: Can you read the main.zig file?                               │
│                                                                     │
│ Assistant: I'll read that file for you.                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📄 read_file path="src/main.zig"                                │ │ <- Tool Call
│ │ ✓ 245 lines                                                     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ The file contains...                                                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ │ Type your message...                                            │ │ <- Editor
│ │                                                                 │ │
├─────────────────────────────────────────────────────────────────────┤
│ Ctrl+C: Cancel │ Ctrl+L: Clear │ /help: Commands │ ↑↓: History    │ <- Status
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Implementation

```zig
// src/modes/interactive.zig

pub const InteractiveMode = struct {
    allocator: Allocator,
    agent: *Agent,
    session: *SessionManager,
    
    // TUI components
    terminal: god_tui.Terminal,
    renderer: god_tui.Renderer,
    container: god_tui.Container,
    
    // UI elements
    header: *HeaderComponent,
    chat: *ChatContainer,
    editor: *god_tui.Editor,
    status: *StatusBar,
    
    // State
    is_running: bool = false,
    
    pub fn init(allocator: Allocator, agent: *Agent, session: *SessionManager) InteractiveMode {
        var self = InteractiveMode{
            .allocator = allocator,
            .agent = agent,
            .session = session,
            .terminal = god_tui.Terminal.init(allocator),
            .renderer = god_tui.Renderer.init(allocator),
            .container = god_tui.Container.init(allocator),
        };
        
        // Build UI hierarchy
        self.header = HeaderComponent.init(allocator);
        self.chat = ChatContainer.init(allocator);
        self.editor = god_tui.Editor.init(allocator);
        self.status = StatusBar.init(allocator);
        
        self.container.addChild(self.header.component());
        self.container.addChild(self.chat.component());
        self.container.addChild(self.editor.component());
        self.container.addChild(self.status.component());
        
        // Setup editor callbacks
        self.editor.on_submit = self.handleSubmit;
        
        // Setup agent event handler
        self.agent.on_event = self.handleAgentEvent;
        
        return self;
    }
    
    pub fn run(self: *InteractiveMode) !void {
        // Start terminal
        try self.terminal.start(self.handleInput, self.handleResize, self);
        defer self.terminal.stop();
        
        // Set focus to editor
        self.container.setFocus(self.editor);
        
        // Render initial state
        self.renderer.requestRender();
        
        // Main loop
        self.is_running = true;
        while (self.is_running) {
            // Process terminal input
            try self.terminal.poll();
            
            // Render if needed
            if (self.renderer.needsRender()) {
                const lines = try self.container.render(self.terminal.columns);
                try self.renderer.render(lines, self.terminal);
            }
        }
    }
    
    fn handleSubmit(text: []const u8, ctx: *InteractiveMode) void {
        // Check for slash commands
        if (text.len > 0 and text[0] == '/') {
            ctx.handleCommand(text[1..]);
            return;
        }
        
        // Add user message to chat
        ctx.chat.addUserMessage(text);
        
        // Send to agent
        ctx.agent.prompt(.{
            .role = .user,
            .content = text,
        }) catch |err| {
            ctx.chat.addError(err);
        };
    }
    
    fn handleAgentEvent(event: AgentEvent, ctx: *InteractiveMode) void {
        switch (event.type) {
            .text_delta => ctx.chat.appendText(event.text),
            .tool_start => ctx.chat.addToolCall(event.tool),
            .tool_end => ctx.chat.updateToolResult(event.tool, event.result),
            .agent_end => ctx.renderer.requestRender(),
            else => {},
        }
    }
    
    fn handleCommand(self: *InteractiveMode, cmd: []const u8) void {
        if (std.mem.eql(u8, cmd, "help")) {
            self.showHelp();
        } else if (std.mem.eql(u8, cmd, "clear")) {
            self.chat.clear();
        } else if (std.mem.startsWith(u8, cmd, "model ")) {
            self.setModel(cmd[6..]);
        } else if (std.mem.eql(u8, cmd, "compact")) {
            self.session.compact();
        } else if (std.mem.eql(u8, cmd, "exit") or std.mem.eql(u8, cmd, "quit")) {
            self.is_running = false;
        } else {
            self.chat.addError("Unknown command: /" ++ cmd);
        }
    }
};
```

---

## 6. File Structure

```
src/
├── main.zig                    # Entry point, CLI parsing
├── config.zig                  # Configuration management
│
├── agent/
│   ├── agent.zig               # Core Agent struct
│   ├── loop.zig                # Agent loop implementation
│   ├── context.zig             # Context building for LLM
│   └── tools/
│       ├── registry.zig        # Tool registration
│       ├── read_file.zig
│       ├── write_file.zig
│       ├── edit_file.zig
│       ├── bash.zig
│       ├── glob.zig
│       ├── grep.zig
│       └── list_dir.zig
│
├── modes/
│   ├── interactive.zig         # Full TUI mode
│   ├── print.zig               # Single-shot mode
│   └── rpc.zig                 # RPC server mode (optional)
│
├── ui/
│   ├── header.zig              # Header component
│   ├── chat.zig                # Chat history container
│   ├── message.zig             # Message rendering
│   ├── tool_call.zig           # Tool call display
│   └── status.zig              # Status bar
│
└── god-tui/                    # Existing library (unchanged)
    ├── lib.zig
    ├── terminal/
    ├── rendering/
    ├── components/
    ├── editor/
    ├── overlay/
    ├── ai/                     # Remove - use ai-zig instead
    ├── extensions/
    └── session/
```

---

## 7. Build Configuration

```zig
// build.zig

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Dependencies
    const clap = b.dependency("clap", .{
        .target = target,
        .optimize = optimize,
    });
    
    const ai_zig = b.dependency("ai", .{
        .target = target,
        .optimize = optimize,
    });

    // God-TUI library
    const god_tui = b.addModule("god-tui", .{
        .root_source_file = b.path("src/god-tui/lib.zig"),
    });

    // Main executable
    const exe = b.addExecutable(.{
        .name = "god-agent",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    exe.root_module.addImport("clap", clap.module("clap"));
    exe.root_module.addImport("ai", ai_zig.module("ai"));
    exe.root_module.addImport("god-tui", god_tui);
    
    b.installArtifact(exe);

    // Run step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);
    
    const run_step = b.step("run", "Run the agent");
    run_step.dependOn(&run_cmd.step);

    // Tests
    const tests = b.addTest(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    tests.root_module.addImport("clap", clap.module("clap"));
    tests.root_module.addImport("ai", ai_zig.module("ai"));
    tests.root_module.addImport("god-tui", god_tui);
    
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&b.addRunArtifact(tests).step);
}
```

```zig
// build.zig.zon

.{
    .name = "god-agent",
    .version = "0.1.0",
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "src",
    },
    .dependencies = .{
        .clap = .{
            .url = "https://github.com/Hejsil/zig-clap/archive/refs/tags/0.11.0.tar.gz",
            .hash = "122062d301f3b9c5c4d458ab26e9e64c2df7c3df7c36c3ab5d2f88cc34a1d8a5f7b3",
        },
        .ai = .{
            .url = "https://github.com/evmts/ai-zig/archive/refs/heads/main.tar.gz",
            .hash = "...",  // Get from zig fetch
        },
    },
}
```

---

## 8. Implementation Phases

| Phase | Components | Effort | Dependencies |
|-------|------------|--------|--------------|
| **Phase 9** | CLI + main.zig | 2 days | zig-clap |
| **Phase 10** | Agent loop + tools | 3 days | ai-zig |
| **Phase 11** | Interactive mode UI | 2 days | god-tui |
| **Phase 12** | Integration + polish | 2 days | All |

### Phase 9: CLI Entry Point
- [ ] Add zig-clap dependency
- [ ] Implement argument parsing
- [ ] Add subcommand handling (session, config)
- [ ] Create config file support
- [ ] Tests for CLI parsing

### Phase 10: Agent Loop
- [ ] Add ai-zig dependency
- [ ] Implement Agent struct with message queue
- [ ] Implement agent loop with tool execution
- [ ] Add built-in tools (read, write, edit, bash, glob, grep)
- [ ] Implement steering and follow-up queues
- [ ] Tests for agent loop

### Phase 11: Interactive Mode
- [ ] Create HeaderComponent
- [ ] Create ChatContainer with message rendering
- [ ] Create StatusBar
- [ ] Wire up Editor with submit handler
- [ ] Implement slash commands (/help, /model, /clear, etc.)
- [ ] Add keyboard shortcuts (Ctrl+C, Ctrl+L)
- [ ] Tests for UI components

### Phase 12: Integration
- [ ] End-to-end testing
- [ ] Session persistence verification
- [ ] Error handling polish
- [ ] Performance optimization
- [ ] Documentation

---

## 9. Testing Strategy

```zig
// tests/agent_test.zig

test "agent executes tool and continues" {
    var mock_provider = MockProvider.init();
    mock_provider.addResponse(.{
        .content = "I'll read that file.",
        .tool_calls = &.{.{ .name = "read_file", .args = .{ .path = "test.txt" } }},
    });
    mock_provider.addResponse(.{
        .content = "The file contains: hello",
        .stop_reason = .end_turn,
    });
    
    var agent = Agent.init(testing.allocator, .{
        .provider = &mock_provider,
    });
    defer agent.deinit();
    
    try agent.prompt(.{ .role = .user, .content = "Read test.txt" });
    
    try testing.expectEqual(@as(u32, 2), agent.current_turn);
}

test "agent respects steering queue" {
    // ...
}

test "agent respects max turns" {
    // ...
}
```

---

## References

- [zig-clap](https://github.com/Hejsil/zig-clap) - CLI argument parsing
- [ai-zig](https://github.com/evmts/ai-zig) - AI SDK for Zig
- [pi-mono architecture](../01-architecture.md) - Reference implementation
- [Session management](../12-session-management.md) - Persistence spec
