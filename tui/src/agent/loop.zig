const std = @import("std");
const db = @import("../db.zig");
const loading_mod = @import("../loading.zig");
const DefaultChatHistory = @import("../components/chat_history.zig").DefaultChatHistory;
const ToolExecutor = @import("tool_executor.zig").ToolExecutor;
const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;
const anthropic = @import("anthropic_provider.zig");
const AnthropicStreamingProvider = anthropic.AnthropicStreamingProvider;

pub const tools_json =
    \\[{"name":"read_file","description":"Read contents of a file with line numbers. Use offset/limit for pagination.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"},"offset":{"type":"integer","description":"Line to start from (0-indexed)"},"limit":{"type":"integer","description":"Max lines to read"}},"required":["path"]}},
    \\{"name":"write_file","description":"Write content to a file. Creates parent dirs.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
    \\{"name":"edit_file","description":"Edit file by replacing old_str with new_str. old_str must be unique.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_str":{"type":"string","description":"Text to find"},"new_str":{"type":"string","description":"Replacement text"}},"required":["path","old_str","new_str"]}},
    \\{"name":"bash","description":"Execute bash command. Output truncated to 500 lines.","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
    \\{"name":"glob","description":"Find files matching glob pattern (e.g. **/*.zig)","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Directory to search"}},"required":["pattern"]}},
    \\{"name":"grep","description":"Search for pattern in files using ripgrep","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory to search"},"include":{"type":"string","description":"File glob filter"}},"required":["pattern"]}},
    \\{"name":"list_dir","description":"List directory contents with optional depth","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"},"depth":{"type":"integer","description":"Recursion depth (1-3)"}}}}]
;

/// Generic AgentLoop over any provider implementing the AgentProvider interface
pub fn AgentLoop(comptime Provider: type) type {
    const ProviderApi = provider_interface.AgentProvider(Provider);

    return struct {
        const Self = @This();

        alloc: std.mem.Allocator,
        loading: *loading_mod.LoadingState,
        streaming: ?ProviderApi.StreamingState = null,

        pub fn init(alloc: std.mem.Allocator, loading: *loading_mod.LoadingState) Self {
            return .{
                .alloc = alloc,
                .loading = loading,
            };
        }

        pub fn tick(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !bool {
            var should_continue = true;

            // Start streaming if we have a pending query but no active stream
            if (self.loading.pending_query != null and self.streaming == null and self.loading.start_time > 0) {
                const elapsed = std.time.milliTimestamp() - self.loading.start_time;
                if (elapsed >= 50) {
                    const started = try self.start_query_stream(database, chat_history);
                    if (!started) should_continue = false;
                }
            }

            // Start continuation stream if we have pending tool results
            if (self.loading.pending_continuation != null and self.streaming == null and self.loading.start_time > 0) {
                const elapsed = std.time.milliTimestamp() - self.loading.start_time;
                if (elapsed >= 50) {
                    const started = try self.start_continuation_stream(database, chat_history);
                    if (!started) should_continue = false;
                }
            }

            // Poll active stream for new data
            if (self.streaming != null) {
                try self.poll_active_stream(database, chat_history);
            }

            // Start next tool execution if we have pending tools and not currently running one
            if (self.loading.hasToolsToExecute() and !self.loading.isExecutingTool()) {
                try self.start_tool_execution(database, chat_history);
            }

            // Poll for tool completion
            if (self.loading.tool_executor != null) {
                try self.poll_tool_completion(database, chat_history);
            }

            return should_continue;
        }

        fn start_query_stream(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !bool {
            const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                self.loading.cleanup(self.alloc);
                try chat_history.reload(database);
                return false;
            };

            // Build messages JSON from DB
            const messages = database.getMessages(self.alloc) catch @constCast(&[_]db.Message{});
            defer if (messages.len > 0) db.DefaultDatabase.freeMessages(self.alloc, messages);

            var msg_buf = std.ArrayListUnmanaged(u8){};
            defer msg_buf.deinit(self.alloc);
            try msg_buf.append(self.alloc, '[');
            var first = true;
            for (messages) |msg| {
                if (msg.role == .system or msg.ephemeral) continue;
                if (!first) try msg_buf.append(self.alloc, ',');
                first = false;
                const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                const escaped_content = std.json.Stringify.valueAlloc(self.alloc, msg.content, .{}) catch continue;
                defer self.alloc.free(escaped_content);
                const msg_json = std.fmt.allocPrint(self.alloc, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                defer self.alloc.free(msg_json);
                try msg_buf.appendSlice(self.alloc, msg_json);
            }
            try msg_buf.append(self.alloc, ']');

            const request_body = try std.fmt.allocPrint(self.alloc,
                \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
            , .{ msg_buf.items, tools_json });
            defer self.alloc.free(request_body);

            // Create placeholder message for streaming response
            const msg_id = try database.addMessage(.assistant, "▌");
            try chat_history.reload(database);

            // Initialize streaming state using provider interface
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                _ = std.log.err("Failed to start stream: {s}", .{@errorName(err)});
                try database.updateMessageContent(msg_id, "Error: Failed to start API request");
                self.loading.cleanup(self.alloc);
                try chat_history.reload(database);
                return false;
            };
            self.streaming.?.message_id = msg_id;

            // Clear pending query now that stream is started
            if (self.loading.pending_query) |q| self.alloc.free(q);
            self.loading.pending_query = null;

            return true;
        }

        fn start_continuation_stream(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !bool {
            const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                self.loading.cleanup(self.alloc);
                try chat_history.reload(database);
                return false;
            };

            const request_body = try std.fmt.allocPrint(self.alloc,
                \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
            , .{ self.loading.pending_continuation.?, tools_json });
            defer self.alloc.free(request_body);

            // Create placeholder message for continuation response
            const msg_id = try database.addMessage(.assistant, "▌");
            try chat_history.reload(database);

            // Initialize streaming state using provider interface
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                _ = std.log.err("Failed to start continuation stream: {s}", .{@errorName(err)});
                try database.updateMessageContent(msg_id, "Error: Failed to continue after tool execution");
                self.loading.cleanup(self.alloc);
                try chat_history.reload(database);
                return false;
            };
            self.streaming.?.message_id = msg_id;

            // Clear pending continuation now that stream is started
            if (self.loading.pending_continuation) |c| self.alloc.free(c);
            self.loading.pending_continuation = null;

            return true;
        }

        fn poll_active_stream(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !void {
            const stream = &self.streaming.?;
            const is_done = ProviderApi.poll(stream) catch true;
            const text = ProviderApi.getText(stream);

            // Update message in DB with current accumulated text
            if (stream.message_id) |msg_id| {
                if (text.len > 0) {
                    const display_text = if (is_done) text else blk: {
                        // Add cursor indicator while streaming
                        const with_cursor = std.fmt.allocPrint(self.alloc, "{s}▌", .{text}) catch text;
                        break :blk with_cursor;
                    };
                    database.updateMessageContent(msg_id, display_text) catch {};
                    if (!is_done and display_text.ptr != text.ptr) self.alloc.free(display_text);
                    try chat_history.reload(database);
                } else if (is_done and !ProviderApi.hasToolCalls(stream)) {
                    database.updateMessageContent(msg_id, "No response from AI.") catch {};
                    try chat_history.reload(database);
                }
            }

            if (is_done) {
                // Check if we have tool calls to execute
                if (ProviderApi.hasToolCalls(stream)) {
                    // Build assistant content JSON and queue tools for async execution
                    var assistant_content = std.ArrayListUnmanaged(u8){};
                    defer assistant_content.deinit(self.alloc);
                    try assistant_content.append(self.alloc, '[');

                    // Add text content if any
                    const assistant_text = ProviderApi.getText(stream);
                    if (assistant_text.len > 0) {
                        const escaped_text = std.json.Stringify.valueAlloc(self.alloc, assistant_text, .{}) catch "";
                        defer self.alloc.free(escaped_text);
                        const text_block = std.fmt.allocPrint(self.alloc,
                            \\{{"type":"text","text":{s}}}
                        , .{escaped_text}) catch "";
                        defer self.alloc.free(text_block);
                        try assistant_content.appendSlice(self.alloc, text_block);
                    }

                    // Build tool_use blocks and queue tools
                    const tool_calls = ProviderApi.getToolCalls(stream);
                    for (tool_calls) |tc| {
                        if (assistant_content.items.len > 1) {
                            try assistant_content.append(self.alloc, ',');
                        }
                        const tool_use_block = std.fmt.allocPrint(self.alloc,
                            \\{{"type":"tool_use","id":"{s}","name":"{s}","input":{s}}}
                        , .{ tc.id, tc.name, if (tc.input_json.len > 0) tc.input_json else "{}" }) catch continue;
                        defer self.alloc.free(tool_use_block);
                        try assistant_content.appendSlice(self.alloc, tool_use_block);

                        // Queue tool for async execution
                        try self.loading.pending_tools.append(self.alloc, .{
                            .id = try self.alloc.dupe(u8, tc.id),
                            .name = try self.alloc.dupe(u8, tc.name),
                            .input_json = try self.alloc.dupe(u8, tc.input_json),
                        });
                    }

                    try assistant_content.append(self.alloc, ']');
                    self.loading.assistant_content_json = try self.alloc.dupe(u8, assistant_content.items);
                    self.loading.current_tool_idx = 0;

                    // Initialize tool executor
                    self.loading.tool_executor = ToolExecutor.init(self.alloc);

                    // Clean up stream but keep loading state active
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;
                } else {
                    self.loading.cleanup(self.alloc);
                }
            }
        }

        fn start_tool_execution(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !void {
            const tc = self.loading.pending_tools.items[self.loading.current_tool_idx];

            // Show tool execution in chat
            const tool_msg = std.fmt.allocPrint(self.alloc, "🔧 Executing: {s}", .{tc.name}) catch "";
            defer self.alloc.free(tool_msg);
            _ = database.addMessage(.system, tool_msg) catch {};
            try chat_history.reload(database);

            // Start async execution
            if (self.loading.tool_executor) |*exec| {
                exec.execute(tc.id, tc.name, tc.input_json) catch {};
            }
        }

        fn poll_tool_completion(self: *Self, database: *db.DefaultDatabase, chat_history: *DefaultChatHistory) !void {
            var exec = &self.loading.tool_executor.?;
            if (exec.poll()) |result| {
                const result_content = if (result.result.success)
                    result.result.content
                else
                    (result.result.error_message orelse "Tool failed");

                // Add tool result to chat
                if (result_content.len > 0) {
                    const display_content = if (result_content.len > 2000) blk: {
                        const truncated = std.fmt.allocPrint(self.alloc, "{s}\n\n... ({d} bytes total)", .{ result_content[0..1500], result_content.len }) catch result_content;
                        break :blk truncated;
                    } else result_content;
                    defer if (display_content.ptr != result_content.ptr) self.alloc.free(display_content);

                    const status_icon: []const u8 = if (result.result.success) "✓" else "✗";
                    const trimmed_content = std.mem.trimRight(u8, display_content, " \t\n\r");
                    const result_msg = std.fmt.allocPrint(self.alloc, "{s} {s}:\n{s}", .{ status_icon, result.tool_name, trimmed_content }) catch "";
                    defer self.alloc.free(result_msg);

                    // Get path for read_file markdown rendering
                    const tc = self.loading.pending_tools.items[self.loading.current_tool_idx];
                    var tool_input_str: []const u8 = "";
                    if (std.mem.eql(u8, tc.name, "read_file")) {
                        const maybe_parsed = std.json.parseFromSlice(std.json.Value, self.alloc, tc.input_json, .{}) catch null;
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
                    try chat_history.reload(database);
                }

                // Store result for continuation
                try self.loading.tool_results.append(self.alloc, .{
                    .tool_id = result.tool_id,
                    .tool_name = result.tool_name,
                    .content = try self.alloc.dupe(u8, result_content),
                    .success = result.result.success,
                    .input_json = try self.alloc.dupe(u8, self.loading.pending_tools.items[self.loading.current_tool_idx].input_json),
                });

                self.loading.current_tool_idx += 1;

                // Check if all tools done
                if (!self.loading.hasToolsToExecute()) {
                    try self.build_continuation_request(database);
                }
            }
        }

        fn build_continuation_request(self: *Self, database: *db.DefaultDatabase) !void {
            // Build continuation request
            var tool_results_json = std.ArrayListUnmanaged(u8){};
            defer tool_results_json.deinit(self.alloc);

            for (self.loading.tool_results.items) |tr| {
                if (tool_results_json.items.len > 0) {
                    tool_results_json.append(self.alloc, ',') catch {};
                }
                const escaped_result = std.json.Stringify.valueAlloc(self.alloc, tr.content, .{}) catch continue;
                defer self.alloc.free(escaped_result);
                const tr_json = std.fmt.allocPrint(self.alloc,
                    \\{{"type":"tool_result","tool_use_id":"{s}","content":{s}}}
                , .{ tr.tool_id, escaped_result }) catch continue;
                defer self.alloc.free(tr_json);
                tool_results_json.appendSlice(self.alloc, tr_json) catch {};
            }

            // Build full message history
            const messages = database.getMessages(self.alloc) catch @constCast(&[_]db.Message{});
            defer if (messages.len > 0) db.DefaultDatabase.freeMessages(self.alloc, messages);

            var msg_buf = std.ArrayListUnmanaged(u8){};
            defer msg_buf.deinit(self.alloc);
            try msg_buf.append(self.alloc, '[');
            var first = true;

            for (messages) |msg| {
                if (msg.role == .system or msg.ephemeral) continue;
                if (!first) try msg_buf.append(self.alloc, ',');
                first = false;
                const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                const escaped_content = std.json.Stringify.valueAlloc(self.alloc, msg.content, .{}) catch continue;
                defer self.alloc.free(escaped_content);
                const msg_json = std.fmt.allocPrint(self.alloc, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                defer self.alloc.free(msg_json);
                try msg_buf.appendSlice(self.alloc, msg_json);
            }

            // Add assistant message with tool_use blocks
            if (!first) try msg_buf.append(self.alloc, ',');
            const assistant_msg = std.fmt.allocPrint(self.alloc,
                \\{{"role":"assistant","content":{s}}}
            , .{self.loading.assistant_content_json orelse "[]"}) catch "";
            defer self.alloc.free(assistant_msg);
            try msg_buf.appendSlice(self.alloc, assistant_msg);

            // Add user message with tool_result blocks
            const user_results_msg = std.fmt.allocPrint(self.alloc,
                \\,{{"role":"user","content":[{s}]}}
            , .{tool_results_json.items}) catch "";
            defer self.alloc.free(user_results_msg);
            try msg_buf.appendSlice(self.alloc, user_results_msg);

            try msg_buf.append(self.alloc, ']');

            // Store continuation and clean up tool state
            self.loading.pending_continuation = try self.alloc.dupe(u8, msg_buf.items);
            self.loading.start_time = std.time.milliTimestamp();

            // Clean up tool execution state
            if (self.loading.tool_executor) |*e| e.deinit();
            self.loading.tool_executor = null;
            for (self.loading.tool_results.items) |tr| {
                self.alloc.free(tr.tool_id);
                self.alloc.free(tr.tool_name);
                self.alloc.free(tr.content);
                self.alloc.free(tr.input_json);
            }
            self.loading.tool_results.deinit(self.alloc);
            self.loading.tool_results = .{};
            for (self.loading.pending_tools.items) |pt| {
                self.alloc.free(pt.id);
                self.alloc.free(pt.name);
                self.alloc.free(pt.input_json);
            }
            self.loading.pending_tools.deinit(self.alloc);
            self.loading.pending_tools = .{};
            if (self.loading.assistant_content_json) |a| self.alloc.free(a);
            self.loading.assistant_content_json = null;
        }
    };
}

/// Default AgentLoop using Anthropic provider
pub const DefaultAgentLoop = AgentLoop(AnthropicStreamingProvider);

