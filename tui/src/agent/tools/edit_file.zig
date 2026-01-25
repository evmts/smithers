const std = @import("std");
const registry = @import("registry.zig");
const edit_diff = @import("edit_diff.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

fn executeEditFile(ctx: ToolContext) ToolResult {
    const path = ctx.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };
    const old_str = ctx.getString("old_str") orelse {
        return ToolResult.err("Missing required parameter: old_str");
    };
    const new_str = ctx.getString("new_str") orelse {
        return ToolResult.err("Missing required parameter: new_str");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    if (std.mem.eql(u8, old_str, new_str)) {
        return ToolResult.err("old_str and new_str must be different");
    }

    const file = std.fs.cwd().openFile(path, .{}) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("File not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            else => ToolResult.err("Failed to open file"),
        };
    };

    const raw_content = file.readToEndAlloc(ctx.allocator, 10 * 1024 * 1024) catch {
        file.close();
        return ToolResult.err("Failed to read file");
    };
    file.close();
    defer ctx.allocator.free(raw_content);

    const bom_result = edit_diff.stripBom(raw_content);
    const content_without_bom = bom_result.text;
    const has_bom = bom_result.has_bom;

    const original_line_ending = edit_diff.detectLineEnding(content_without_bom);

    const normalized_content = edit_diff.normalizeToLF(ctx.allocator, content_without_bom) catch {
        return ToolResult.err("Failed to normalize content");
    };
    defer ctx.allocator.free(normalized_content);

    const normalized_old_str = edit_diff.normalizeToLF(ctx.allocator, old_str) catch {
        return ToolResult.err("Failed to normalize old_str");
    };
    defer ctx.allocator.free(normalized_old_str);

    const normalized_new_str = edit_diff.normalizeToLF(ctx.allocator, new_str) catch {
        return ToolResult.err("Failed to normalize new_str");
    };
    defer ctx.allocator.free(normalized_new_str);

    const occurrences = edit_diff.countOccurrences(ctx.allocator, normalized_content, normalized_old_str) catch {
        return ToolResult.err("Failed to count occurrences");
    };

    if (occurrences == 0) {
        return ToolResult.err("old_str not found in file. Ensure the text matches including whitespace.");
    }

    if (occurrences > 1) {
        const msg = std.fmt.allocPrint(ctx.allocator, "Found {d} occurrences of old_str. Provide more context to make it unique.", .{occurrences}) catch {
            return ToolResult.err("Found multiple occurrences of old_str. Provide more context to make it unique.");
        };
        return ToolResult.errOwned(msg);
    }

    const match_result = edit_diff.fuzzyFindText(ctx.allocator, normalized_content, normalized_old_str) catch {
        return ToolResult.err("Failed to find text");
    };

    if (!match_result.found) {
        return ToolResult.err("old_str not found in file");
    }

    const base_content = match_result.content_for_replacement;
    const should_free_base = match_result.used_fuzzy_match;
    defer if (should_free_base) ctx.allocator.free(base_content);

    const new_content_lf = std.mem.concat(ctx.allocator, u8, &.{
        base_content[0..match_result.index],
        normalized_new_str,
        base_content[match_result.index + match_result.match_length ..],
    }) catch {
        return ToolResult.err("Failed to create new content");
    };
    defer ctx.allocator.free(new_content_lf);

    if (std.mem.eql(u8, base_content, new_content_lf)) {
        return ToolResult.err("No changes would be made. The replacement produces identical content.");
    }

    const diff_result = edit_diff.generateDiff(ctx.allocator, base_content, new_content_lf, 4) catch {
        return ToolResult.err("Failed to generate diff");
    };
    defer ctx.allocator.free(diff_result.diff);

    const new_content_endings = edit_diff.restoreLineEndings(ctx.allocator, new_content_lf, original_line_ending) catch {
        return ToolResult.err("Failed to restore line endings");
    };
    defer ctx.allocator.free(new_content_endings);

    const final_content = edit_diff.restoreBom(ctx.allocator, new_content_endings, has_bom) catch {
        return ToolResult.err("Failed to restore BOM");
    };
    defer ctx.allocator.free(final_content);

    const write_file = std.fs.cwd().createFile(path, .{}) catch {
        return ToolResult.err("Failed to open file for writing");
    };
    defer write_file.close();

    write_file.writeAll(final_content) catch {
        return ToolResult.err("Failed to write file");
    };

    const fuzzy_note = if (match_result.used_fuzzy_match) " (fuzzy match)" else "";
    const first_line = if (diff_result.first_changed_line) |line| line else 1;

    const result_msg = std.fmt.allocPrint(ctx.allocator, "File edited successfully{s}. First change at line {d}.\n\n{s}", .{ fuzzy_note, first_line, diff_result.diff }) catch {
        return ToolResult.ok("File edited successfully");
    };

    return ToolResult.okOwned(result_msg);
}

pub const tool = Tool{
    .name = "edit_file",
    .description =
    \\Edit a file by replacing old_str with new_str.
    \\Parameters:
    \\  - path: Path to the file (required)
    \\  - old_str: Text to find and replace (required)
    \\  - new_str: Text to replace it with (required)
    \\old_str must be unique in the file. Include surrounding context if needed.
    \\Uses fuzzy matching for whitespace differences.
    ,
    .execute_ctx = executeEditFile,
};

pub const edit_file_tool = tool;
