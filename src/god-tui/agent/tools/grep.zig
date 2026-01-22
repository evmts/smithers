const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn executeGrep(params: ToolParams) ToolResult {
    const pattern = params.getString("pattern") orelse {
        return ToolResult.err("Missing required parameter: pattern");
    };

    _ = pattern;

    return ToolResult.ok("Grep not yet implemented - stub");
}

pub const grep_tool = Tool{
    .name = "grep",
    .description = "Search for a pattern in files. Returns matching lines with file:line format.",
    .execute = executeGrep,
};

test "grep tool definition" {
    try std.testing.expectEqualStrings("grep", grep_tool.name);
}
