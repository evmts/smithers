const std = @import("std");
const db = @import("../db.zig");
const tool_executor_mod = @import("tool_executor.zig");
const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;
const obs = @import("../obs.zig");

pub const tools_json =
    \\[{"name":"read_file","description":"Read contents of a file with line numbers. Use offset/limit for pagination.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"},"offset":{"type":"integer","description":"Line to start from (0-indexed)"},"limit":{"type":"integer","description":"Max lines to read"}},"required":["path"]}},
    \\{"name":"write_file","description":"Write content to a file. Creates parent dirs.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
    \\{"name":"edit_file","description":"Edit file by replacing old_str with new_str. old_str must be unique.","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_str":{"type":"string","description":"Text to find"},"new_str":{"type":"string","description":"Replacement text"}},"required":["path","old_str","new_str"]}},
    \\{"name":"bash","description":"Execute bash command. Output truncated to 500 lines.","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
    \\{"name":"glob","description":"Find files matching glob pattern (e.g. **/*.zig)","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"},"path":{"type":"string","description":"Directory to search"}},"required":["pattern"]}},
    \\{"name":"grep","description":"Search for pattern in files using ripgrep","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory to search"},"include":{"type":"string","description":"File glob filter"}},"required":["pattern"]}},
    \\{"name":"list_dir","description":"List directory contents with optional depth","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"},"depth":{"type":"integer","description":"Recursion depth (1-3)"}}}}]
;

/// Generic AgentLoop over Provider, Loading, ToolExecutor, and Database types
/// Database is passed as comptime param for proper DI (enables testing with mock DB)
pub fn AgentLoop(comptime Provider: type, comptime Loading: type, comptime ToolExec: type, comptime Database: type) type {
    const ProviderApi = provider_interface.AgentProvider(Provider);

    return struct {
        const Self = @This();

        alloc: std.mem.Allocator,
        loading: *Loading,
        streaming: ?ProviderApi.StreamingState = null,
        /// Scratch arena for per-tick allocations (reset each tick)
        scratch: std.heap.ArenaAllocator,

        pub fn init(alloc: std.mem.Allocator, loading: *Loading) Self {
            return .{
                .alloc = alloc,
                .loading = loading,
                .scratch = std.heap.ArenaAllocator.init(alloc),
            };
        }

        pub fn deinit(self: *Self) void {
            self.scratch.deinit();
        }

        /// Tick returns true if state changed (main thread should reload chat_history)
        pub fn tick(self: *Self, database: *Database) !bool {
            var state_changed = false;

            // Check for cancellation request from main thread
            if (self.loading.isCancelRequested()) {
                obs.global.logSimple(.info, @src(), "agent.tick", "cancel requested - cleaning up");

                // Mark agent run as failed in SQLite (agent thread owns all DB writes)
                if (self.loading.agent_run_id) |rid| {
                    database.failAgentRun(rid) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.failAgentRun", @errorName(err));
                    };
                }
                // Add interrupted message to chat
                _ = database.addMessage(.system, "Interrupted.") catch |err| {
                    obs.global.logSimple(.err, @src(), "db.addMessage", @errorName(err));
                };

                // Cleanup streaming (kills curl process)
                if (self.streaming) |*stream| {
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;
                }
                // Full cleanup of loading state
                self.loading.cleanup(self.alloc);
                state_changed = true;
                // Reset scratch and return early
                _ = self.scratch.reset(.retain_capacity);
                return state_changed;
            }

            const has_query = self.loading.pending_query != null;
            const has_stream = self.streaming != null;
            const start_time = self.loading.start_time;

            // Log tick state periodically (every ~1 second based on tick rate)
            if (has_query or has_stream or self.loading.isLoading()) {
                var buf: [256]u8 = undefined;
                const msg = std.fmt.bufPrint(&buf, "query={} stream={} start_time={d} is_loading={}", .{
                    has_query,
                    has_stream,
                    start_time,
                    self.loading.isLoading(),
                }) catch "tick";
                obs.global.logSimple(.debug, @src(), "agent.tick", msg);
            }

            // Start streaming if we have a pending query but no active stream
            if (has_query and !has_stream and start_time > 0) {
                const elapsed = std.time.milliTimestamp() - start_time;
                if (elapsed >= 50) {
                    obs.global.logSimple(.debug, @src(), "agent.start_stream", "starting query stream");
                    const started = try self.start_query_stream(database);
                    state_changed = true;
                    if (!started) {
                        obs.global.logSimple(.warn, @src(), "agent.start_stream", "failed to start");
                    }
                }
            }

            // Start continuation stream if we have pending tool results
            if (self.loading.pending_continuation != null and !has_stream and start_time > 0) {
                const elapsed = std.time.milliTimestamp() - start_time;
                if (elapsed >= 50) {
                    obs.global.logSimple(.debug, @src(), "agent.continuation", "starting continuation stream");
                    _ = try self.start_continuation_stream(database);
                    state_changed = true;
                }
            }

            // Poll active stream for new data
            if (self.streaming != null) {
                obs.global.logSimple(.debug, @src(), "agent.poll", "calling poll_active_stream");
                const stream_changed = try self.poll_active_stream(database);
                state_changed = state_changed or stream_changed;
            }

            // Start next tool execution if we have pending tools and not currently running one
            if (self.loading.hasToolsToExecute() and !self.loading.isExecutingTool()) {
                try self.start_tool_execution(database);
                state_changed = true;
            }

            // Poll for tool completion
            if (self.loading.tool_executor != null) {
                const tool_changed = try self.poll_tool_completion(database);
                state_changed = state_changed or tool_changed;
            }

            // Reset scratch arena at end of tick - all per-tick allocs freed at once
            _ = self.scratch.reset(.retain_capacity);

            return state_changed;
        }

        fn start_query_stream(self: *Self, database: *Database) !bool {
            obs.global.logSimple(.debug, @src(), "agent.query_stream", "checking api key");

            const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                obs.global.logSimple(.warn, @src(), "agent.query_stream", "ANTHROPIC_API_KEY not set");
                _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                self.loading.cleanup(self.alloc);
                return false;
            };

            obs.global.logSimple(.debug, @src(), "agent.query_stream", "building messages json");

            // Use scratch arena for all temporary allocations in this function
            const scratch = self.scratch.allocator();

            // Build messages JSON from DB (use scratch - freed at tick end)
            const messages = database.getMessages(scratch) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.getMessages", @errorName(err));
                    return false;
                };
            // No defer free needed - scratch arena handles it

            var msg_buf = std.ArrayListUnmanaged(u8){};
            try msg_buf.append(scratch, '[');
            var first = true;
            for (messages) |msg| {
                if (msg.role == .system or msg.ephemeral) continue;
                if (!first) try msg_buf.append(scratch, ',');
                first = false;
                const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                const escaped_content = std.json.Stringify.valueAlloc(scratch, msg.content, .{}) catch continue;
                const msg_json = std.fmt.allocPrint(scratch, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                try msg_buf.appendSlice(scratch, msg_json);
            }
            try msg_buf.append(scratch, ']');

            var len_buf: [64]u8 = undefined;
            const len_msg = std.fmt.bufPrint(&len_buf, "request body len={d}", .{msg_buf.items.len}) catch "?";
            obs.global.logSimple(.debug, @src(), "agent.query_stream", len_msg);

            const request_body = try std.fmt.allocPrint(scratch,
                \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
            , .{ msg_buf.items, tools_json });

            // Create placeholder message for streaming response
            const msg_id = try database.addMessage(.assistant, "▌");

            obs.global.logSimple(.debug, @src(), "agent.query_stream", "calling ProviderApi.startStream");

            // Initialize streaming state using provider interface
            // Note: streaming state uses self.alloc since it outlives this tick
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                var err_buf: [128]u8 = undefined;
                const err_msg = std.fmt.bufPrint(&err_buf, "startStream error: {s}", .{@errorName(err)}) catch "error";
                obs.global.logSimple(.err, @src(), "agent.query_stream", err_msg);
                try database.updateMessageContent(msg_id, "Error: Failed to start API request");
                self.loading.cleanup(self.alloc);
                return false;
            };
            self.streaming.?.message_id = msg_id;

            obs.global.logSimple(.debug, @src(), "agent.query_stream", "stream started successfully");

            // Clear pending query now that stream is started
            self.loading.clearPendingQuery(self.alloc);

            return true;
        }

        fn start_continuation_stream(self: *Self, database: *Database) !bool {
            const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
                _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
                self.loading.cleanup(self.alloc);
                return false;
            };

            // Use scratch for temporary request body
            const scratch = self.scratch.allocator();
            const request_body = try std.fmt.allocPrint(scratch,
                \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
            , .{ self.loading.pending_continuation.?, tools_json });

            // Create placeholder message for continuation response
            const msg_id = try database.addMessage(.assistant, "▌");

            // Initialize streaming state using provider interface
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                _ = std.log.err("Failed to start continuation stream: {s}", .{@errorName(err)});
                try database.updateMessageContent(msg_id, "Error: Failed to continue after tool execution");
                self.loading.cleanup(self.alloc);
                return false;
            };
            self.streaming.?.message_id = msg_id;

            // Clear pending continuation now that stream is started
            if (self.loading.pending_continuation) |c| self.alloc.free(c);
            self.loading.pending_continuation = null;

            return true;
        }

        /// Returns true if state changed (DB was updated)
        fn poll_active_stream(self: *Self, database: *Database) !bool {
            var state_changed = false;
            const stream = &self.streaming.?;
            const scratch = self.scratch.allocator();

            obs.global.logSimple(.debug, @src(), "agent.poll_stream", "calling ProviderApi.poll");
            const is_done = ProviderApi.poll(stream) catch |err| {
                var err_buf: [64]u8 = undefined;
                const err_msg = std.fmt.bufPrint(&err_buf, "poll error: {s}", .{@errorName(err)}) catch "?";
                obs.global.logSimple(.err, @src(), "agent.poll_stream", err_msg);
                return err;
            };
            const text = ProviderApi.getText(stream);
            var status_buf: [128]u8 = undefined;
            const status_msg = std.fmt.bufPrint(&status_buf, "is_done={} text_len={d}", .{ is_done, text.len }) catch "?";
            obs.global.logSimple(.debug, @src(), "agent.poll_stream", status_msg);

            // Update message in DB with current accumulated text
            if (stream.message_id) |msg_id| {
                if (text.len > 0) {
                    const display_text = if (is_done) text else blk: {
                        // Add cursor indicator while streaming (scratch - freed at tick end)
                        const with_cursor = std.fmt.allocPrint(scratch, "{s}▌", .{text}) catch text;
                        break :blk with_cursor;
                    };
                    database.updateMessageContent(msg_id, display_text) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.updateMessageContent", @errorName(err));
                    };
                    state_changed = true;
                } else if (is_done and !ProviderApi.hasToolCalls(stream)) {
                    database.updateMessageContent(msg_id, "No response from AI.") catch |err| {
                        obs.global.logSimple(.err, @src(), "db.updateMessageContent.empty", @errorName(err));
                    };
                    state_changed = true;
                }
            }

            if (is_done) {
                // Check if we have tool calls to execute
                if (ProviderApi.hasToolCalls(stream)) {
                    // Build assistant content JSON (scratch for temp, dupe to alloc for storage)
                    var assistant_content = std.ArrayListUnmanaged(u8){};
                    try assistant_content.append(scratch, '[');

                    // Add text content if any
                    const assistant_text = ProviderApi.getText(stream);
                    if (assistant_text.len > 0) {
                        const escaped_text = std.json.Stringify.valueAlloc(scratch, assistant_text, .{}) catch "";
                        const text_block = std.fmt.allocPrint(scratch,
                            \\{{"type":"text","text":{s}}}
                        , .{escaped_text}) catch "";
                        try assistant_content.appendSlice(scratch, text_block);
                    }

                    // Build tool_use blocks and queue tools
                    const tool_calls = ProviderApi.getToolCalls(stream);
                    for (tool_calls) |tc| {
                        if (assistant_content.items.len > 1) {
                            try assistant_content.append(scratch, ',');
                        }
                        const tool_use_block = std.fmt.allocPrint(scratch,
                            \\{{"type":"tool_use","id":"{s}","name":"{s}","input":{s}}}
                        , .{ tc.id, tc.name, if (tc.input_json.len > 0) tc.input_json else "{}" }) catch continue;
                        try assistant_content.appendSlice(scratch, tool_use_block);

                        // Queue tool for async execution (use self.alloc - outlives tick)
                        try self.loading.pending_tools.append(self.alloc, .{
                            .id = try self.alloc.dupe(u8, tc.id),
                            .name = try self.alloc.dupe(u8, tc.name),
                            .input_json = try self.alloc.dupe(u8, tc.input_json),
                        });
                    }

                    try assistant_content.append(scratch, ']');
                    self.loading.assistant_content_json = try self.alloc.dupe(u8, assistant_content.items);
                    self.loading.current_tool_idx = 0;

                    // Initialize tool executor
                    self.loading.tool_executor = ToolExec.init(self.alloc);

                    // Persist to SQLite for crash recovery
                    const run_id = database.createAgentRun() catch null;
                    self.loading.agent_run_id = run_id;
                    if (run_id) |rid| {
                        database.updateAgentRunStatus(rid, .tools) catch |err| {
                            obs.global.logSimple(.err, @src(), "db.updateAgentRunStatus", @errorName(err));
                        };
                        database.updateAgentRunAssistantContent(rid, self.loading.assistant_content_json) catch |err| {
                            obs.global.logSimple(.err, @src(), "db.updateAgentRunAssistantContent", @errorName(err));
                        };
                        // Serialize pending_tools to JSON for persistence
                        const tools_json_str = self.serializePendingTools(scratch) catch null;
                        database.updateAgentRunTools(rid, tools_json_str, 0) catch |err| {
                            obs.global.logSimple(.err, @src(), "db.updateAgentRunTools", @errorName(err));
                        };
                    }

                    // Clean up stream but keep loading state active
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;
                } else {
                    // No tool calls - stream complete, clean up
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;

                    // Complete any active run
                    if (self.loading.agent_run_id) |rid| {
                        database.completeAgentRun(rid) catch |err| {
                            obs.global.logSimple(.err, @src(), "db.completeAgentRun", @errorName(err));
                        };
                        self.loading.agent_run_id = null;
                    }
                    self.loading.cleanup(self.alloc);
                }
                state_changed = true;
            }

            return state_changed;
        }

        fn start_tool_execution(self: *Self, database: *Database) !void {
            const tc = self.loading.pending_tools.items[self.loading.current_tool_idx];
            const scratch = self.scratch.allocator();

            // Show tool execution in chat
            const tool_msg = std.fmt.allocPrint(scratch, "🔧 Executing: {s}", .{tc.name}) catch "";
            _ = database.addMessage(.system, tool_msg) catch |err| {
                obs.global.logSimple(.err, @src(), "db.addMessage.tool", @errorName(err));
            };

            // Start async execution
            if (self.loading.tool_executor) |*exec| {
                exec.execute(tc.id, tc.name, tc.input_json) catch |err| {
                    obs.global.logSimple(.err, @src(), "tool_executor.execute", @errorName(err));
                };
            }
        }

        /// Returns true if state changed (tool completed)
        fn poll_tool_completion(self: *Self, database: *Database) !bool {
            var exec = &self.loading.tool_executor.?;
            const scratch = self.scratch.allocator();

            if (exec.poll()) |result| {
                // Cleanup the ToolResult after we're done (tool_id/tool_name ownership transfers to tool_results)
                var tool_result = result.result;
                defer tool_result.deinit(self.alloc);

                const result_content = if (result.result.success)
                    result.result.content
                else
                    (result.result.error_message orelse "Tool failed");

                // Add tool result to chat
                if (result_content.len > 0) {
                    // Temp allocs use scratch - freed at tick end
                    const display_content = if (result_content.len > 2000) blk: {
                        const truncated = std.fmt.allocPrint(scratch, "{s}\n\n... ({d} bytes total)", .{ result_content[0..1500], result_content.len }) catch result_content;
                        break :blk truncated;
                    } else result_content;

                    const status_icon: []const u8 = if (result.result.success) "✓" else "✗";
                    const trimmed_content = std.mem.trimRight(u8, display_content, " \t\n\r");
                    const result_msg = std.fmt.allocPrint(scratch, "{s} {s}:\n{s}", .{ status_icon, result.tool_name, trimmed_content }) catch "";

                    // Get path for read_file markdown rendering
                    const tc = self.loading.pending_tools.items[self.loading.current_tool_idx];
                    var tool_input_str: []const u8 = "";
                    if (std.mem.eql(u8, tc.name, "read_file")) {
                        const maybe_parsed = std.json.parseFromSlice(std.json.Value, scratch, tc.input_json, .{}) catch null;
                        if (maybe_parsed) |p| {
                            if (p.value.object.get("path")) |path_val| {
                                if (path_val == .string) {
                                    tool_input_str = path_val.string;
                                }
                            }
                        }
                    }

                    _ = database.addToolResult(tc.name, tool_input_str, result_msg) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.addToolResult", @errorName(err));
                    };
                }

                // Store result for continuation (self.alloc - outlives tick)
                try self.loading.tool_results.append(self.alloc, .{
                    .tool_id = result.tool_id,
                    .tool_name = result.tool_name,
                    .content = try self.alloc.dupe(u8, result_content),
                    .success = result.result.success,
                    .input_json = try self.alloc.dupe(u8, self.loading.pending_tools.items[self.loading.current_tool_idx].input_json),
                });

                self.loading.current_tool_idx += 1;

                // Persist progress to SQLite for crash recovery
                if (self.loading.agent_run_id) |rid| {
                    database.updateAgentRunTools(rid, null, @intCast(self.loading.current_tool_idx)) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.updateAgentRunTools", @errorName(err));
                    };
                    const results_json = self.serializeToolResults(scratch) catch null;
                    database.updateAgentRunResults(rid, results_json) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.updateAgentRunResults", @errorName(err));
                    };
                }

                // Check if all tools done
                if (!self.loading.hasToolsToExecute()) {
                    try self.build_continuation_request(database);
                }

                return true;
            }
            return false;
        }

        fn build_continuation_request(self: *Self, database: *Database) !void {
            // Use scratch arena for all temporary allocations
            const scratch = self.scratch.allocator();

            // Build continuation request
            var tool_results_json = std.ArrayListUnmanaged(u8){};

            for (self.loading.tool_results.items) |tr| {
                if (tool_results_json.items.len > 0) {
                    tool_results_json.append(scratch, ',') catch {};
                }
                const escaped_result = std.json.Stringify.valueAlloc(scratch, tr.content, .{}) catch continue;
                const tr_json = std.fmt.allocPrint(scratch,
                    \\{{"type":"tool_result","tool_use_id":"{s}","content":{s}}}
                , .{ tr.tool_id, escaped_result }) catch continue;
                tool_results_json.appendSlice(scratch, tr_json) catch {};
            }

            // Build full message history
            const messages = database.getMessages(scratch) catch |err| {
                obs.global.logSimple(.err, @src(), "db.getMessages", @errorName(err));
                return err;
            };

            var msg_buf = std.ArrayListUnmanaged(u8){};
            try msg_buf.append(scratch, '[');
            var first = true;

            for (messages) |msg| {
                if (msg.role == .system or msg.ephemeral) continue;
                if (!first) try msg_buf.append(scratch, ',');
                first = false;
                const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
                const escaped_content = std.json.Stringify.valueAlloc(scratch, msg.content, .{}) catch continue;
                const msg_json = std.fmt.allocPrint(scratch, "{{\"role\":\"{s}\",\"content\":{s}}}", .{ role_str, escaped_content }) catch continue;
                try msg_buf.appendSlice(scratch, msg_json);
            }

            // Add assistant message with tool_use blocks
            if (!first) try msg_buf.append(scratch, ',');
            const assistant_msg = std.fmt.allocPrint(scratch,
                \\{{"role":"assistant","content":{s}}}
            , .{self.loading.assistant_content_json orelse "[]"}) catch "";
            try msg_buf.appendSlice(scratch, assistant_msg);

            // Add user message with tool_result blocks
            const user_results_msg = std.fmt.allocPrint(scratch,
                \\,{{"role":"user","content":[{s}]}}
            , .{tool_results_json.items}) catch "";
            try msg_buf.appendSlice(scratch, user_results_msg);

            try msg_buf.append(scratch, ']');

            // Store continuation (uses self.alloc - outlives tick) and clean up tool state
            self.loading.pending_continuation = try self.alloc.dupe(u8, msg_buf.items);
            self.loading.start_time = std.time.milliTimestamp();

            // Mark agent run as continuing (NOT complete - stream hasn't finished yet)
            // The run will be marked complete when continuation stream finishes in poll_active_stream
            if (self.loading.agent_run_id) |rid| {
                database.updateAgentRunStatus(rid, .continuing) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.updateAgentRunStatus", @errorName(err));
                };
                // Keep agent_run_id so we can mark complete when continuation finishes
            }

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

        /// Serialize pending_tools to JSON for DB persistence.
        /// SAFETY: The returned slice uses scratch arena memory. The caller must pass this
        /// to db.exec() synchronously before the arena is reset. SQLite uses SQLITE_STATIC
        /// for slice bindings, so the data must outlive the exec call.
        fn serializePendingTools(self: *Self, alloc: std.mem.Allocator) ![]const u8 {
            var buf = std.ArrayListUnmanaged(u8){};
            try buf.append(alloc, '[');
            var first = true;
            for (self.loading.pending_tools.items) |pt| {
                if (!first) try buf.append(alloc, ',');
                first = false;
                const escaped_input = std.json.Stringify.valueAlloc(alloc, pt.input_json, .{}) catch "\"\"";
                const item = std.fmt.allocPrint(alloc,
                    \\{{"id":"{s}","name":"{s}","input_json":{s}}}
                , .{ pt.id, pt.name, escaped_input }) catch continue;
                try buf.appendSlice(alloc, item);
            }
            try buf.append(alloc, ']');
            return buf.items;
        }

        /// Serialize tool_results to JSON for DB persistence.
        /// SAFETY: See serializePendingTools - same arena lifetime requirements apply.
        fn serializeToolResults(self: *Self, alloc: std.mem.Allocator) ![]const u8 {
            var buf = std.ArrayListUnmanaged(u8){};
            try buf.append(alloc, '[');
            var first = true;
            for (self.loading.tool_results.items) |tr| {
                if (!first) try buf.append(alloc, ',');
                first = false;
                const escaped_content = std.json.Stringify.valueAlloc(alloc, tr.content, .{}) catch "\"\"";
                const item = std.fmt.allocPrint(alloc,
                    \\{{"tool_id":"{s}","tool_name":"{s}","content":{s},"success":{s}}}
                , .{ tr.tool_id, tr.tool_name, escaped_content, if (tr.success) "true" else "false" }) catch continue;
                try buf.appendSlice(alloc, item);
            }
            try buf.append(alloc, ']');
            return buf.items;
        }
    };
}



