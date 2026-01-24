const std = @import("std");
const streaming = @import("../streaming.zig");

const StreamingState = streaming.StreamingState;
const ToolCallInfo = streaming.ToolCallInfo;

test "StreamingState initial values" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    try std.testing.expect(state.child == null);
    try std.testing.expect(state.message_id == null);
    try std.testing.expectEqual(@as(usize, 0), state.accumulated_text.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.tool_calls.items.len);
    try std.testing.expect(state.current_tool_id == null);
    try std.testing.expect(state.current_tool_name == null);
    try std.testing.expectEqual(@as(usize, 0), state.current_tool_input.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.line_pos);
    try std.testing.expect(!state.is_done);
    try std.testing.expect(state.stop_reason == null);
}

test "ToolCallInfo struct fields" {
    const info = ToolCallInfo{
        .id = "tool_123",
        .name = "read_file",
        .input_json = "{\"path\": \"/tmp/test.txt\"}",
    };

    try std.testing.expectEqualStrings("tool_123", info.id);
    try std.testing.expectEqualStrings("read_file", info.name);
    try std.testing.expectEqualStrings("{\"path\": \"/tmp/test.txt\"}", info.input_json);
}

test "StreamingState cleanup resets all fields" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);

    // Simulate accumulated state
    try state.accumulated_text.appendSlice(alloc, "Hello world");
    state.is_done = true;
    state.line_pos = 42;
    state.message_id = 12345;
    state.current_tool_id = try alloc.dupe(u8, "tool_abc");
    state.current_tool_name = try alloc.dupe(u8, "bash");
    state.stop_reason = try alloc.dupe(u8, "end_turn");
    try state.current_tool_input.appendSlice(alloc, "{\"cmd\": \"ls\"}");

    // Add a tool call
    const tc_id = try alloc.dupe(u8, "tc_1");
    const tc_name = try alloc.dupe(u8, "write_file");
    const tc_input = try alloc.dupe(u8, "{}");
    try state.tool_calls.append(alloc, .{
        .id = tc_id,
        .name = tc_name,
        .input_json = tc_input,
    });

    // Cleanup
    state.cleanup();

    // Verify reset
    try std.testing.expect(state.child == null);
    try std.testing.expect(state.message_id == null);
    try std.testing.expectEqual(@as(usize, 0), state.accumulated_text.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.tool_calls.items.len);
    try std.testing.expect(state.current_tool_id == null);
    try std.testing.expect(state.current_tool_name == null);
    try std.testing.expectEqual(@as(usize, 0), state.current_tool_input.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.line_pos);
    try std.testing.expect(!state.is_done);
    try std.testing.expect(state.stop_reason == null);
}

test "StreamingState getText returns accumulated text" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    try std.testing.expectEqualStrings("", state.getText());

    try state.accumulated_text.appendSlice(alloc, "Hello");
    try std.testing.expectEqualStrings("Hello", state.getText());

    try state.accumulated_text.appendSlice(alloc, " World");
    try std.testing.expectEqualStrings("Hello World", state.getText());
}

test "StreamingState hasToolCalls" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    try std.testing.expect(!state.hasToolCalls());

    const tc_id = try alloc.dupe(u8, "tc_1");
    const tc_name = try alloc.dupe(u8, "test_tool");
    const tc_input = try alloc.dupe(u8, "{}");
    try state.tool_calls.append(alloc, .{
        .id = tc_id,
        .name = tc_name,
        .input_json = tc_input,
    });

    try std.testing.expect(state.hasToolCalls());
}

test "processLine ignores non-data lines" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // These should be silently ignored
    try state.processLine("");
    try state.processLine("event: message_start");
    try state.processLine(": keep-alive comment");
    try state.processLine("random garbage");

    try std.testing.expectEqualStrings("", state.getText());
    try std.testing.expect(!state.is_done);
}

test "processLine handles [DONE] marker" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    try std.testing.expect(!state.is_done);
    try state.processLine("data: [DONE]");
    try std.testing.expect(state.is_done);
}

test "processLine handles text_delta" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    const delta_json =
        \\{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
    ;
    try state.processLine("data: " ++ delta_json);

    try std.testing.expectEqualStrings("Hello", state.getText());

    const delta_json2 =
        \\{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}
    ;
    try state.processLine("data: " ++ delta_json2);

    try std.testing.expectEqualStrings("Hello World", state.getText());
}

test "processLine handles message_delta with stop_reason" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    const delta_json =
        \\{"type":"message_delta","delta":{"stop_reason":"end_turn"}}
    ;
    try state.processLine("data: " ++ delta_json);

    try std.testing.expect(state.stop_reason != null);
    try std.testing.expectEqualStrings("end_turn", state.stop_reason.?);
}

test "processLine handles tool_use content block" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // Start tool block
    const start_json =
        \\{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_123","name":"bash"}}
    ;
    try state.processLine("data: " ++ start_json);

    try std.testing.expect(state.current_tool_id != null);
    try std.testing.expectEqualStrings("toolu_123", state.current_tool_id.?);
    try std.testing.expect(state.current_tool_name != null);
    try std.testing.expectEqualStrings("bash", state.current_tool_name.?);

    // Input delta
    const input_delta1 =
        \\{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\":"}}
    ;
    try state.processLine("data: " ++ input_delta1);

    const input_delta2 =
        \\{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"ls\"}"}}
    ;
    try state.processLine("data: " ++ input_delta2);

    try std.testing.expectEqualStrings("{\"cmd\":\"ls\"}", state.current_tool_input.items);

    // Stop block
    const stop_json =
        \\{"type":"content_block_stop","index":1}
    ;
    try state.processLine("data: " ++ stop_json);

    try std.testing.expect(state.hasToolCalls());
    try std.testing.expectEqual(@as(usize, 1), state.tool_calls.items.len);
    try std.testing.expectEqualStrings("toolu_123", state.tool_calls.items[0].id);
    try std.testing.expectEqualStrings("bash", state.tool_calls.items[0].name);
    try std.testing.expectEqualStrings("{\"cmd\":\"ls\"}", state.tool_calls.items[0].input_json);

    // current_tool_* should be cleared
    try std.testing.expect(state.current_tool_id == null);
    try std.testing.expect(state.current_tool_name == null);
}

test "processLine handles invalid JSON gracefully" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // Invalid JSON should be silently ignored
    try state.processLine("data: not valid json at all");
    try state.processLine("data: {incomplete");
    try state.processLine("data: []");

    try std.testing.expectEqualStrings("", state.getText());
    try std.testing.expect(!state.is_done);
}

test "processLine handles missing fields gracefully" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // Object with no type field
    try state.processLine("data: {\"foo\": \"bar\"}");
    // Type field is not a string
    try state.processLine("data: {\"type\": 123}");
    // Unknown type
    try state.processLine("data: {\"type\": \"unknown_event\"}");

    try std.testing.expectEqualStrings("", state.getText());
}

test "content_block_stop without tool context is no-op" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // Stop without prior start should not create a tool call
    const stop_json =
        \\{"type":"content_block_stop","index":0}
    ;
    try state.processLine("data: " ++ stop_json);

    try std.testing.expect(!state.hasToolCalls());
}

test "multiple tool calls accumulate" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // First tool
    try state.processLine("data: " ++
        \\{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"read"}}
    );
    try state.processLine("data: " ++
        \\{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}
    );
    try state.processLine("data: " ++
        \\{"type":"content_block_stop","index":0}
    );

    // Second tool
    try state.processLine("data: " ++
        \\{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_2","name":"write"}}
    );
    try state.processLine("data: " ++
        \\{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"x\":1}"}}
    );
    try state.processLine("data: " ++
        \\{"type":"content_block_stop","index":1}
    );

    try std.testing.expectEqual(@as(usize, 2), state.tool_calls.items.len);
    try std.testing.expectEqualStrings("tool_1", state.tool_calls.items[0].id);
    try std.testing.expectEqualStrings("read", state.tool_calls.items[0].name);
    try std.testing.expectEqualStrings("tool_2", state.tool_calls.items[1].id);
    try std.testing.expectEqualStrings("write", state.tool_calls.items[1].name);
}

test "line buffer handles partial data" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // Simulate feeding bytes without newline
    const partial = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}";
    for (partial) |byte| {
        if (state.line_pos < state.line_buffer.len - 1) {
            state.line_buffer[state.line_pos] = byte;
            state.line_pos += 1;
        }
    }

    try std.testing.expectEqual(partial.len, state.line_pos);
    try std.testing.expectEqualStrings("", state.getText()); // Not processed yet

    // Now process the line
    const line = state.line_buffer[0..state.line_pos];
    try state.processLine(line);
    state.line_pos = 0;

    try std.testing.expectEqualStrings("Hi", state.getText());
}

test "empty accumulated text and tool calls" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);
    defer state.deinit();

    // No data processed
    try std.testing.expectEqualStrings("", state.getText());
    try std.testing.expect(!state.hasToolCalls());
    try std.testing.expectEqual(@as(usize, 0), state.tool_calls.items.len);
}

test "deinit is same as cleanup" {
    const alloc = std.testing.allocator;
    var state = StreamingState.init(alloc);

    try state.accumulated_text.appendSlice(alloc, "test data");
    state.current_tool_id = try alloc.dupe(u8, "id");
    state.current_tool_name = try alloc.dupe(u8, "name");

    // deinit should clean up without leaks
    state.deinit();

    // State should be reset
    try std.testing.expect(state.current_tool_id == null);
    try std.testing.expect(state.current_tool_name == null);
}
