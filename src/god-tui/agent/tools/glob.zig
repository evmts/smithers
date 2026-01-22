const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn executeGlob(params: ToolParams) ToolResult {
    const pattern = params.getString("pattern") orelse {
        return ToolResult.err("Missing required parameter: pattern");
    };

    _ = pattern;

    return ToolResult.ok("Glob not yet implemented - stub");
}

pub const glob_tool = Tool{
    .name = "glob",
    .description = "Find files matching a glob pattern (e.g., **/*.zig).",
    .execute = executeGlob,
};

test "glob tool definition" {
    try std.testing.expectEqualStrings("glob", glob_tool.name);
}
