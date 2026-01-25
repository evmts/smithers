// Agent - manages AI conversation loop with tool execution
// Coordinates between the provider, tool registry, and conversation context

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;

const provider = @import("provider.zig");
const ProviderInterface = provider.ProviderInterface;
const StreamEvent = provider.StreamEvent;
const StreamEventType = provider.StreamEventType;
const Context = provider.Context;
const Model = provider.Model;
const StopReason = provider.StopReason;

const types = @import("types.zig");
const Message = types.Message;
const Role = types.Role;
const AgentConfig = types.AgentConfig;

const registry = @import("tools/registry.zig");
const ToolRegistry = registry.ToolRegistry;
const ToolResult = registry.ToolResult;

const anthropic = @import("anthropic_provider.zig");
const AnthropicProvider = anthropic.AnthropicProvider;

pub const AgentState = enum {
    idle,
    running,
    waiting_for_tool,
    completed,
    errored,
};

pub const AgentResponse = struct {
    text: ArrayListUnmanaged(u8),
    tool_calls: ArrayListUnmanaged(ToolCallPending),
    stop_reason: StopReason,
    error_message: ?[]const u8,
    allocator: Allocator,

    pub fn init(allocator: Allocator) AgentResponse {
        return .{
            .text = .{},
            .tool_calls = .{},
            .stop_reason = .stop,
            .error_message = null,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *AgentResponse) void {
        self.text.deinit(self.allocator);
        for (self.tool_calls.items) |*tc| {
            self.allocator.free(tc.id);
            self.allocator.free(tc.name);
            self.allocator.free(tc.arguments);
        }
        self.tool_calls.deinit(self.allocator);
        if (self.error_message) |msg| self.allocator.free(msg);
    }

    pub fn getText(self: *const AgentResponse) []const u8 {
        return self.text.items;
    }

    pub fn appendText(self: *AgentResponse, delta: []const u8) !void {
        try self.text.appendSlice(self.allocator, delta);
    }

    pub fn addToolCall(self: *AgentResponse, id: []const u8, name: []const u8, arguments: []const u8) !void {
        try self.tool_calls.append(self.allocator, .{
            .id = try self.allocator.dupe(u8, id),
            .name = try self.allocator.dupe(u8, name),
            .arguments = try self.allocator.dupe(u8, arguments),
        });
    }

    pub fn hasToolCalls(self: *const AgentResponse) bool {
        return self.tool_calls.items.len > 0;
    }
};

pub const ToolCallPending = struct {
    id: []const u8,
    name: []const u8,
    arguments: []const u8,
};

pub const Agent = struct {
    allocator: Allocator,
    config: AgentConfig,
    anthropic_provider: ?*AnthropicProvider,
    tool_registry: ToolRegistry,
    context: Context,
    state: AgentState,
    current_turn: u32,
    last_response: ?AgentResponse,
    last_error: ?[]const u8,

    const Self = @This();

    pub fn init(allocator: Allocator, config: AgentConfig) Self {
        var ctx = Context.init(allocator);
        ctx.system_prompt = config.system_prompt;

        return .{
            .allocator = allocator,
            .config = config,
            .anthropic_provider = null,
            .tool_registry = ToolRegistry.initBuiltin(allocator),
            .context = ctx,
            .state = .idle,
            .current_turn = 0,
            .last_response = null,
            .last_error = null,
        };
    }

    pub fn deinit(self: *Self) void {
        if (self.anthropic_provider) |prov| {
            prov.deinit();
            self.allocator.destroy(prov);
        }
        self.tool_registry.deinit();
        self.context.deinit();
        if (self.last_response) |*resp| resp.deinit();
        if (self.last_error) |err| self.allocator.free(err);
    }

    /// Initialize the Anthropic provider (must have ANTHROPIC_API_KEY set)
    pub fn initProvider(self: *Self) !void {
        const prov = try anthropic.createAnthropicProvider(self.allocator);
        self.anthropic_provider = prov;
    }

    /// Check if provider is available
    pub fn hasProvider(self: *const Self) bool {
        return self.anthropic_provider != null;
    }

    /// Add a user message and run the agent loop
    pub fn run(self: *Self, user_message: []const u8) !AgentResponse {
        // Add user message to context - must dupe since caller owns the memory
        const content_copy = try self.allocator.dupe(u8, user_message);
        try self.context.messages.append(self.allocator, Message.user(content_copy));
        self.state = .running;

        // Run the agent loop
        return self.runLoop();
    }

    /// Continue running after tool results have been added
    pub fn continueAfterTools(self: *Self) !AgentResponse {
        self.state = .running;
        return self.runLoop();
    }

    fn runLoop(self: *Self) !AgentResponse {
        const prov = self.anthropic_provider orelse {
            var resp = AgentResponse.init(self.allocator);
            resp.error_message = try self.allocator.dupe(u8, "No AI provider configured");
            resp.stop_reason = .@"error";
            self.state = .errored;
            return resp;
        };

        var response = AgentResponse.init(self.allocator);
        errdefer response.deinit();

        // Build context and call the API
        const model = anthropic.getDefaultModel();
        var stream = prov.interface().stream(model, &self.context, .{}, self.allocator) catch |err| {
            response.error_message = try self.allocator.dupe(u8, @errorName(err));
            response.stop_reason = .@"error";
            self.state = .errored;
            return response;
        };
        defer stream.deinit();

        // Process stream events
        while (stream.next()) |event| {
            switch (event.type) {
                .text_delta => {
                    if (event.delta) |delta| {
                        try response.appendText(delta);
                    }
                },
                .toolcall_end => {
                    if (event.tool_call) |tc| {
                        try response.addToolCall(tc.id, tc.name, tc.arguments);
                    }
                },
                .@"error" => {
                    response.error_message = if (event.content) |c|
                        try self.allocator.dupe(u8, c)
                    else
                        try self.allocator.dupe(u8, "Unknown error");
                    response.stop_reason = .@"error";
                },
                .done => {
                    response.stop_reason = event.reason orelse .stop;
                },
                else => {},
            }
        }

        // Add assistant response to context
        if (response.text.items.len > 0 or response.tool_calls.items.len > 0) {
            // Build tool_calls slice for message
            if (response.hasToolCalls()) {
                var tc_infos = ArrayListUnmanaged(types.ToolCallInfo){};
                defer tc_infos.deinit(self.allocator);

                for (response.tool_calls.items) |tc| {
                    try tc_infos.append(self.allocator, .{
                        .id = try self.allocator.dupe(u8, tc.id),
                        .name = try self.allocator.dupe(u8, tc.name),
                        .arguments = try self.allocator.dupe(u8, tc.arguments),
                    });
                }

                const tc_slice = try self.allocator.dupe(types.ToolCallInfo, tc_infos.items);
                try self.context.messages.append(self.allocator, Message.assistantWithToolCalls(
                    try self.allocator.dupe(u8, response.getText()),
                    tc_slice,
                ));
            } else {
                try self.context.messages.append(self.allocator, Message.assistant(
                    try self.allocator.dupe(u8, response.getText()),
                ));
            }
        }

        // Update state based on result
        if (response.stop_reason == .tool_use) {
            self.state = .waiting_for_tool;
        } else if (response.stop_reason == .@"error") {
            self.state = .errored;
        } else {
            self.state = .completed;
        }

        self.current_turn += 1;
        return response;
    }

    /// Execute pending tool calls and add results to context
    pub fn executeTools(self: *Self, pending_tools: []const ToolCallPending) !void {
        for (pending_tools) |tc| {
            const result = self.executeTool(tc.name, tc.arguments);

            // Add tool result to context
            const content = if (result.success) result.content else (result.error_message orelse "Tool execution failed");
            try self.context.messages.append(self.allocator, Message.toolResult(
                tc.id,
                try self.allocator.dupe(u8, content),
            ));
        }
    }

    fn executeTool(self: *Self, name: []const u8, arguments: []const u8) ToolResult {
        // Parse JSON arguments
        const parsed = json.parseFromSlice(json.Value, self.allocator, arguments, .{}) catch {
            return ToolResult.err("Failed to parse tool arguments");
        };
        defer parsed.deinit();

        return self.tool_registry.execute(name, parsed.value);
    }

    /// Tool execution result for reporting
    pub const ToolExecution = struct {
        name: []const u8,
        success: bool,
        output_preview: []const u8, // First 100 chars of output
    };

    /// Run a complete agent loop including tool execution (blocks until done)
    pub fn runWithTools(self: *Self, user_message: []const u8) !AgentResponse {
        var tool_log = ArrayListUnmanaged(ToolExecution){};
        defer tool_log.deinit(self.allocator);
        
        return self.runWithToolsAndReport(user_message, &tool_log);
    }

    /// Run with tool execution and return tool usage log
    pub fn runWithToolsAndReport(self: *Self, user_message: []const u8, tool_log: *ArrayListUnmanaged(ToolExecution)) !AgentResponse {
        var response = try self.run(user_message);

        // Loop while we have tool calls to execute
        var iterations: u32 = 0;
        const max_iterations = self.config.max_turns;

        while (response.stop_reason == .tool_use and iterations < max_iterations) {
            // Execute the tools and log results
            for (response.tool_calls.items) |tc| {
                const result = self.executeTool(tc.name, tc.arguments);
                
                // Log the execution
                const preview_len = @min(result.content.len, 100);
                try tool_log.append(self.allocator, .{
                    .name = tc.name,
                    .success = result.success,
                    .output_preview = result.content[0..preview_len],
                });
                
                // Add to context
                const content = if (result.success) result.content else (result.error_message orelse "Tool execution failed");
                try self.context.messages.append(self.allocator, Message.toolResult(
                    tc.id,
                    try self.allocator.dupe(u8, content),
                ));
            }

            // Clean up previous response
            response.deinit();

            // Continue the conversation
            response = try self.continueAfterTools();
            iterations += 1;
        }

        return response;
    }

    /// Get current conversation length
    pub fn messageCount(self: *const Self) usize {
        return self.context.messages.items.len;
    }

    /// Clear conversation history
    pub fn clearHistory(self: *Self) void {
        self.context.messages.clearRetainingCapacity();
        self.current_turn = 0;
        self.state = .idle;
    }

    /// Get the current model ID
    pub fn getModelId(self: *const Self) []const u8 {
        return self.config.model;
    }
};
