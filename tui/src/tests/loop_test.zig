const std = @import("std");
const loop = @import("../agent/loop.zig");

// Test that tools_json is valid JSON array
test "tools_json is valid JSON" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    try std.testing.expect(parsed.value == .array);
}

test "tools_json has expected tools" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    const tools = parsed.value.array.items;
    try std.testing.expect(tools.len >= 7);

    // Collect tool names
    var found_read_file = false;
    var found_write_file = false;
    var found_edit_file = false;
    var found_bash = false;
    var found_glob = false;
    var found_grep = false;
    var found_list_dir = false;

    for (tools) |tool| {
        if (tool.object.get("name")) |name| {
            const name_str = name.string;
            if (std.mem.eql(u8, name_str, "read_file")) found_read_file = true;
            if (std.mem.eql(u8, name_str, "write_file")) found_write_file = true;
            if (std.mem.eql(u8, name_str, "edit_file")) found_edit_file = true;
            if (std.mem.eql(u8, name_str, "bash")) found_bash = true;
            if (std.mem.eql(u8, name_str, "glob")) found_glob = true;
            if (std.mem.eql(u8, name_str, "grep")) found_grep = true;
            if (std.mem.eql(u8, name_str, "list_dir")) found_list_dir = true;
        }
    }

    try std.testing.expect(found_read_file);
    try std.testing.expect(found_write_file);
    try std.testing.expect(found_edit_file);
    try std.testing.expect(found_bash);
    try std.testing.expect(found_glob);
    try std.testing.expect(found_grep);
    try std.testing.expect(found_list_dir);
}

test "each tool has name and description" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    for (parsed.value.array.items) |tool| {
        try std.testing.expect(tool.object.get("name") != null);
        try std.testing.expect(tool.object.get("description") != null);
    }
}

test "each tool has input_schema" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    for (parsed.value.array.items) |tool| {
        const schema = tool.object.get("input_schema");
        try std.testing.expect(schema != null);
        try std.testing.expect(schema.?.object.get("type") != null);
    }
}

test "tools_json length is reasonable" {
    // Should be reasonably compact
    try std.testing.expect(loop.tools_json.len > 100);
    try std.testing.expect(loop.tools_json.len < 10000);
}

test "read_file tool has path required" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    for (parsed.value.array.items) |tool| {
        const name = tool.object.get("name").?.string;
        if (std.mem.eql(u8, name, "read_file")) {
            const schema = tool.object.get("input_schema").?;
            const required = schema.object.get("required").?;
            var found_path = false;
            for (required.array.items) |r| {
                if (std.mem.eql(u8, r.string, "path")) {
                    found_path = true;
                    break;
                }
            }
            try std.testing.expect(found_path);
            return;
        }
    }
    try std.testing.expect(false); // Should have found read_file
}

test "bash tool has command required" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    for (parsed.value.array.items) |tool| {
        const name = tool.object.get("name").?.string;
        if (std.mem.eql(u8, name, "bash")) {
            const schema = tool.object.get("input_schema").?;
            const required = schema.object.get("required").?;
            var found_command = false;
            for (required.array.items) |r| {
                if (std.mem.eql(u8, r.string, "command")) {
                    found_command = true;
                    break;
                }
            }
            try std.testing.expect(found_command);
            return;
        }
    }
    try std.testing.expect(false);
}

test "list_dir has optional depth parameter" {
    const allocator = std.testing.allocator;
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, loop.tools_json, .{});
    defer parsed.deinit();

    for (parsed.value.array.items) |tool| {
        const name = tool.object.get("name").?.string;
        if (std.mem.eql(u8, name, "list_dir")) {
            const schema = tool.object.get("input_schema").?;
            const properties = schema.object.get("properties").?;
            try std.testing.expect(properties.object.get("depth") != null);
            return;
        }
    }
    try std.testing.expect(false);
}
