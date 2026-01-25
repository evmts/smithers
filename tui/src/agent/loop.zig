const std = @import("std");
const db = @import("../db.zig");
const tool_executor_mod = @import("tool_executor.zig");
const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;
const ModelConfig = provider_interface.ModelConfig;
const ProviderType = provider_interface.ProviderType;
const getApiKey = provider_interface.getApiKey;
const obs = @import("../obs.zig");
const compaction = @import("compaction.zig");
const types = @import("types.zig");
const ThinkingLevel = types.ThinkingLevel;
const openai_provider = @import("openai_provider.zig");
const gemini_provider = @import("gemini_provider.zig");

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

        /// Build the API request body for the configured provider, including thinking parameters if enabled
        fn buildRequestBody(self: *Self, alloc: std.mem.Allocator, messages_json: []const u8, tools: []const u8, config: ModelConfig) ![]const u8 {
            const thinking_level = self.loading.getThinkingLevel();

            return switch (config.provider) {
                .anthropic => blk: {
                    if (thinking_level.isEnabled()) {
                        const budget = thinking_level.budgetTokens();
                        const max_tokens = budget + 4096;
                        break :blk try std.fmt.allocPrint(alloc,
                            \\{{"model":"{s}","max_tokens":{d},"stream":true,"thinking":{{"type":"enabled","budget_tokens":{d}}},"messages":{s},"tools":{s}}}
                        , .{ config.model_id, max_tokens, budget, messages_json, tools });
                    } else {
                        break :blk try std.fmt.allocPrint(alloc,
                            \\{{"model":"{s}","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
                        , .{ config.model_id, messages_json, tools });
                    }
                },
                .openai => try openai_provider.buildRequestBody(alloc, config.model_id, messages_json, tools),
                .google => try gemini_provider.buildRequestBody(alloc, config.model_id, messages_json, tools),
            };
        }

        /// Get the current model configuration from environment
        fn getModelConfig() ModelConfig {
            return ModelConfig.fromEnv();
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
                    // Emit agent_start event when first starting a query
                    self.loading.emitAgentStart();
                    const started = try self.start_query_stream(database);
                    state_changed = true;
                    if (!started) {
                        obs.global.logSimple(.warn, @src(), "agent.start_stream", "failed to start");
                        self.loading.emitAgentError("Failed to start stream");
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

            // Get model configuration from environment
            const config = getModelConfig();

            const api_key = getApiKey(config.provider) orelse {
                var key_buf: [128]u8 = undefined;
                const key_name = switch (config.provider) {
                    .anthropic => "ANTHROPIC_API_KEY",
                    .openai => "OPENAI_API_KEY",
                    .google => "GEMINI_API_KEY",
                };
                const err_text = std.fmt.bufPrint(&key_buf, "Error: {s} not set", .{key_name}) catch "Error: API key not set";
                obs.global.logSimple(.warn, @src(), "agent.query_stream", err_text);
                _ = try database.addMessage(.system, err_text);
                self.loading.cleanup(self.alloc);
                return false;
            };

            var provider_buf: [64]u8 = undefined;
            const provider_msg = std.fmt.bufPrint(&provider_buf, "using {s}/{s}", .{ config.provider.toString(), config.model_id }) catch "?";
            obs.global.logSimple(.debug, @src(), "agent.query_stream", provider_msg);

            // Use scratch arena for all temporary allocations in this function
            const scratch = self.scratch.allocator();

            // Check for existing compaction to get first_kept_msg_id
            var compaction_summary: ?[]const u8 = null;
            var first_kept_msg_id: ?i64 = null;
            if (database.getLatestCompaction(scratch)) |maybe_existing| {
                if (maybe_existing) |existing| {
                    compaction_summary = existing.summary;
                    first_kept_msg_id = existing.first_kept_msg_id;
                }
            } else |_| {}

            // Build messages JSON from DB (use scratch - freed at tick end)
            // If we have a compaction, only get messages from first_kept_msg_id onwards
            const messages = if (first_kept_msg_id) |fkid|
                database.getMessagesFromId(scratch, fkid) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.getMessagesFromId", @errorName(err));
                    return false;
                }
            else
                database.getMessages(scratch) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.getMessages", @errorName(err));
                    return false;
                };
            // No defer free needed - scratch arena handles it

            var msg_buf = std.ArrayListUnmanaged(u8){};
            try msg_buf.append(scratch, '[');
            var first = true;

            // Inject compaction summary as first user message if available
            if (compaction_summary) |summary| {
                const escaped_summary = std.json.Stringify.valueAlloc(scratch, summary, .{}) catch "";
                const summary_msg = std.fmt.allocPrint(scratch,
                    \\{{"role":"user","content":{s}}}
                , .{escaped_summary}) catch "";
                try msg_buf.appendSlice(scratch, summary_msg);
                first = false;
                obs.global.logSimple(.debug, @src(), "agent.compaction", "injected compaction summary");
            }

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

            const request_body = try self.buildRequestBody(scratch, msg_buf.items, tools_json, config);

            // Create placeholder message for streaming response
            const msg_id = try database.addMessage(.assistant, "▌");

            // Emit turn_start and message_start events
            self.loading.emitTurnStart();
            self.loading.emitMessageStart(msg_id);

            obs.global.logSimple(.debug, @src(), "agent.query_stream", "calling ProviderApi.startStream");

            // Initialize streaming state using provider interface
            // Note: streaming state uses self.alloc since it outlives this tick
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                var err_buf: [128]u8 = undefined;
                const err_msg = std.fmt.bufPrint(&err_buf, "startStream error: {s}", .{@errorName(err)}) catch "error";
                obs.global.logSimple(.err, @src(), "agent.query_stream", err_msg);
                try database.updateMessageContent(msg_id, "Error: Failed to start API request");
                self.loading.emitAgentError("Failed to start API request");
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
            // Get model configuration from environment
            const config = getModelConfig();

            const api_key = getApiKey(config.provider) orelse {
                var key_buf: [128]u8 = undefined;
                const key_name = switch (config.provider) {
                    .anthropic => "ANTHROPIC_API_KEY",
                    .openai => "OPENAI_API_KEY",
                    .google => "GEMINI_API_KEY",
                };
                const err_text = std.fmt.bufPrint(&key_buf, "Error: {s} not set", .{key_name}) catch "Error: API key not set";
                _ = try database.addMessage(.system, err_text);
                // Mark agent run as failed before cleanup (avoids stuck "continuing" status)
                if (self.loading.agent_run_id) |rid| {
                    database.failAgentRun(rid) catch |err| {
                        obs.global.logSimple(.err, @src(), "db.failAgentRun", @errorName(err));
                    };
                }
                self.loading.cleanup(self.alloc);
                return false;
            };

            // Use scratch for temporary request body
            const scratch = self.scratch.allocator();
            const request_body = try self.buildRequestBody(scratch, self.loading.pending_continuation.?, tools_json, config);

            // Create placeholder message for continuation response
            const msg_id = try database.addMessage(.assistant, "▌");

            // Emit turn_start and message_start events for continuation
            self.loading.emitTurnStart();
            self.loading.emitMessageStart(msg_id);

            // Initialize streaming state using provider interface
            self.streaming = ProviderApi.startStream(self.alloc, api_key, request_body) catch |err| {
                var err_buf: [128]u8 = undefined;
                const err_msg = std.fmt.bufPrint(&err_buf, "continuation stream error: {s}", .{@errorName(err)}) catch "error";
                obs.global.logSimple(.err, @src(), "agent.continuation", err_msg);
                try database.updateMessageContent(msg_id, "Error: Failed to continue after tool execution");
                self.loading.emitAgentError("Failed to continue after tool execution");
                // Mark agent run as failed before cleanup (avoids stuck "continuing" status)
                if (self.loading.agent_run_id) |rid| {
                    database.failAgentRun(rid) catch |fail_err| {
                        obs.global.logSimple(.err, @src(), "db.failAgentRun", @errorName(fail_err));
                    };
                }
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
                    // Emit message_update event (streaming delta)
                    self.loading.emitMessageUpdate(msg_id, "", text);
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

                    // Emit message_end and turn_end events (with tool calls pending)
                    if (stream.message_id) |msg_id| {
                        self.loading.emitMessageEnd(msg_id, ProviderApi.getText(stream));
                    }
                    self.loading.emitTurnEnd(true);

                    // Clean up stream but keep loading state active
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;
                } else {
                    // Emit message_end and turn_end events (no tool calls)
                    if (stream.message_id) |msg_id| {
                        self.loading.emitMessageEnd(msg_id, text);
                    }
                    self.loading.emitTurnEnd(false);

                    // No tool calls - stream complete
                    ProviderApi.cleanup(stream, self.alloc);
                    self.streaming = null;

                    // Check for follow-up messages before fully completing
                    if (self.loading.hasFollowUpMessages()) {
                        obs.global.logSimple(.info, @src(), "agent.followup", "follow-up messages detected - starting new turn");

                        // Get follow-up messages and start a new query
                        const followup_msgs = self.loading.getFollowUpMessages(self.alloc) catch &[_][]const u8{};
                        if (followup_msgs.len > 0) {
                            // Add follow-up messages to chat and set as pending query
                            for (followup_msgs) |followup_msg| {
                                _ = database.addMessage(.user, followup_msg) catch |err| {
                                    obs.global.logSimple(.err, @src(), "db.addMessage.followup", @errorName(err));
                                };
                                // Use first message as the pending query
                                if (self.loading.pending_query == null) {
                                    self.loading.setPendingQuery(followup_msg);
                                } else {
                                    self.alloc.free(followup_msg);
                                }
                            }
                            if (followup_msgs.len > 0) self.alloc.free(followup_msgs);

                            // Don't cleanup - continue with new query
                            self.loading.start_time = std.time.milliTimestamp();
                        }
                    } else {
                        // Complete any active run
                        if (self.loading.agent_run_id) |rid| {
                            database.completeAgentRun(rid) catch |err| {
                                obs.global.logSimple(.err, @src(), "db.completeAgentRun", @errorName(err));
                            };
                            self.loading.agent_run_id = null;
                        }

                        // Check if compaction is needed after turn completes
                        self.checkAndTriggerCompaction(database) catch |err| {
                            obs.global.logSimple(.err, @src(), "agent.compaction", @errorName(err));
                        };

                        // Emit agent_end event before cleanup
                        self.loading.emitAgentEnd();
                        self.loading.cleanup(self.alloc);
                    }
                }
                state_changed = true;
            }

            return state_changed;
        }

        fn start_tool_execution(self: *Self, database: *Database) !void {
            const tc = self.loading.pending_tools.items[self.loading.current_tool_idx];
            const scratch = self.scratch.allocator();

            // Emit tool_start event
            self.loading.emitToolStart(tc.id, tc.name, tc.input_json);

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

                // Emit tool_end event
                self.loading.emitToolEnd(result.tool_id, result.tool_name, result_content, !result.result.success);

                // Store result for continuation (self.alloc - outlives tick)
                try self.loading.tool_results.append(self.alloc, .{
                    .tool_id = result.tool_id,
                    .tool_name = result.tool_name,
                    .content = try self.alloc.dupe(u8, result_content),
                    .success = result.result.success,
                    .input_json = try self.alloc.dupe(u8, self.loading.pending_tools.items[self.loading.current_tool_idx].input_json),
                    .details_json = if (result.result.details_json) |dj| try self.alloc.dupe(u8, dj) else null,
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

                // Check for steering messages - skip remaining tools if user interrupted
                if (self.loading.hasSteeringMessages()) {
                    obs.global.logSimple(.info, @src(), "agent.steering", "steering message detected - skipping remaining tools");

                    // Skip remaining tools with "skipped" result
                    while (self.loading.current_tool_idx < self.loading.pending_tools.items.len) {
                        const skipped_tc = self.loading.pending_tools.items[self.loading.current_tool_idx];

                        // Add skipped result to chat
                        const skip_msg = std.fmt.allocPrint(scratch, "⏭ {s}: Skipped due to queued user message.", .{skipped_tc.name}) catch "";
                        _ = database.addMessage(.system, skip_msg) catch |err| {
                            obs.global.logSimple(.err, @src(), "db.addMessage.skip", @errorName(err));
                        };

                        // Store skipped result for continuation
                        try self.loading.tool_results.append(self.alloc, .{
                            .tool_id = try self.alloc.dupe(u8, skipped_tc.id),
                            .tool_name = try self.alloc.dupe(u8, skipped_tc.name),
                            .content = try self.alloc.dupe(u8, "Skipped due to queued user message."),
                            .success = false,
                            .input_json = try self.alloc.dupe(u8, skipped_tc.input_json),
                        });

                        self.loading.current_tool_idx += 1;
                    }

                    // Build continuation with steering messages injected
                    try self.build_continuation_request_with_steering(database);
                    return true;
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

        /// Build continuation request with steering messages injected.
        /// Similar to build_continuation_request but adds steering messages after tool results.
        fn build_continuation_request_with_steering(self: *Self, database: *Database) !void {
            const scratch = self.scratch.allocator();

            // Build tool results JSON
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

            // Get steering messages
            const steering_msgs = try self.loading.getSteeringMessages(self.alloc);
            defer {
                for (steering_msgs) |msg| self.alloc.free(msg);
                if (steering_msgs.len > 0) self.alloc.free(steering_msgs);
            }

            // Add steering messages as text content after tool results
            for (steering_msgs) |steering_msg| {
                if (tool_results_json.items.len > 0) {
                    tool_results_json.append(scratch, ',') catch {};
                }
                const escaped_steering = std.json.Stringify.valueAlloc(scratch, steering_msg, .{}) catch continue;
                const steering_json = std.fmt.allocPrint(scratch,
                    \\{{"type":"text","text":{s}}}
                , .{escaped_steering}) catch continue;
                tool_results_json.appendSlice(scratch, steering_json) catch {};

                // Also add steering message to chat history for visibility
                _ = database.addMessage(.user, steering_msg) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.addMessage.steering", @errorName(err));
                };
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

            // Add user message with tool_result blocks + steering messages
            const user_results_msg = std.fmt.allocPrint(scratch,
                \\,{{"role":"user","content":[{s}]}}
            , .{tool_results_json.items}) catch "";
            try msg_buf.appendSlice(scratch, user_results_msg);

            try msg_buf.append(scratch, ']');

            // Store continuation and clean up
            self.loading.pending_continuation = try self.alloc.dupe(u8, msg_buf.items);
            self.loading.start_time = std.time.milliTimestamp();

            if (self.loading.agent_run_id) |rid| {
                database.updateAgentRunStatus(rid, .continuing) catch |err| {
                    obs.global.logSimple(.err, @src(), "db.updateAgentRunStatus", @errorName(err));
                };
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

        /// Check context size and trigger compaction if needed
        fn checkAndTriggerCompaction(self: *Self, database: *Database) !void {
            const scratch = self.scratch.allocator();
            const settings = compaction.DEFAULT_SETTINGS;

            // Get all messages to estimate context size
            const messages = database.getMessages(scratch) catch |err| {
                obs.global.logSimple(.err, @src(), "compaction.getMessages", @errorName(err));
                return err;
            };

            if (messages.len == 0) return;

            // Check for existing compaction
            var previous_summary: ?[]const u8 = null;
            var existing_first_kept_id: ?i64 = null;
            if (database.getLatestCompaction(scratch)) |maybe_existing| {
                if (maybe_existing) |existing| {
                    previous_summary = existing.summary;
                    existing_first_kept_id = existing.first_kept_msg_id;
                }
            } else |err| {
                obs.global.logSimple(.warn, @src(), "compaction.getLatestCompaction", @errorName(err));
            }

            // If we have an existing compaction, only count messages after first_kept_msg_id
            var effective_messages = messages;
            if (existing_first_kept_id) |first_id| {
                for (messages, 0..) |msg, i| {
                    if (msg.id >= first_id) {
                        effective_messages = messages[i..];
                        break;
                    }
                }
            }

            const context_tokens = compaction.estimateContextTokens(effective_messages);

            var token_buf: [64]u8 = undefined;
            const token_msg = std.fmt.bufPrint(&token_buf, "context tokens: {d}", .{context_tokens}) catch "?";
            obs.global.logSimple(.debug, @src(), "compaction.check", token_msg);

            if (!compaction.shouldCompact(context_tokens, settings)) return;

            obs.global.logSimple(.info, @src(), "compaction", "triggering context compaction");

            // Find cut point
            const prep = (compaction.prepareCompaction(scratch, effective_messages, previous_summary, settings) catch return) orelse return;

            // Build summarization prompt for later API call
            const prompt = compaction.buildSummarizationPrompt(
                scratch,
                prep.messages_to_summarize,
                previous_summary,
            ) catch |err| {
                obs.global.logSimple(.err, @src(), "compaction.buildPrompt", @errorName(err));
                return err;
            };

            // For now, create a simple summary placeholder and store the compaction
            // Full LLM-based summarization will be added in a follow-up
            const summary = try std.fmt.allocPrint(self.alloc,
                \\[Context compacted - {d} tokens summarized]
                \\
                \\Previous conversation covered approximately {d} messages.
                \\This is a placeholder summary - LLM summarization pending.
            , .{ prep.tokens_before, prep.messages_to_summarize.len });
            defer self.alloc.free(summary);

            // Extract file operations for tracking
            var file_ops = compaction.extractFileOperations(scratch, prep.messages_to_summarize) catch {
                // Continue without file ops if extraction fails
                _ = try database.createCompaction(summary, prep.first_kept_msg_id, @intCast(prep.tokens_before), null);
                obs.global.logSimple(.info, @src(), "compaction", "compaction entry created (no file ops)");
                return;
            };
            defer file_ops.deinit();

            const file_ops_suffix = compaction.formatFileOperations(scratch, &file_ops) catch "";
            const full_summary = try std.fmt.allocPrint(self.alloc, "{s}{s}", .{ summary, file_ops_suffix });
            defer self.alloc.free(full_summary);

            // Store compaction entry
            _ = try database.createCompaction(full_summary, prep.first_kept_msg_id, @intCast(prep.tokens_before), null);

            obs.global.logSimple(.info, @src(), "compaction", "compaction entry created");

            // Log prompt for debugging (will be used for LLM call later)
            _ = prompt;
        }
    };
}



