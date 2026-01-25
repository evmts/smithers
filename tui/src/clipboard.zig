const std = @import("std");

/// Clipboard interface via comptime DI
pub fn Clipboard(comptime Impl: type) type {
    return struct {
        pub fn copy(allocator: std.mem.Allocator, text: []const u8) !void {
            return Impl.copy(allocator, text);
        }
    };
}

/// Production implementation using system clipboard (pbcopy/xclip)
pub const SystemClipboard = struct {
    pub fn copy(allocator: std.mem.Allocator, text: []const u8) !void {
        if (text.len == 0) return;

        // Try pbcopy (macOS) first, then xclip (Linux)
        const commands = [_][]const []const u8{
            &.{"pbcopy"},
            &.{ "xclip", "-selection", "clipboard" },
            &.{ "xsel", "--clipboard", "--input" },
        };

        for (commands) |cmd| {
            var child = std.process.Child.init(cmd, allocator);
            child.stdin_behavior = .Pipe;
            child.stdout_behavior = .Ignore;
            child.stderr_behavior = .Ignore;

            child.spawn() catch continue;

            if (child.stdin) |*stdin| {
                stdin.writeAll(text) catch {};
                stdin.close();
                child.stdin = null;
            }

            const result = child.wait() catch continue;
            if (result.Exited == 0) return;
        }

        return error.ClipboardUnavailable;
    }
};



/// Test mock clipboard that stores copied text
pub const MockClipboard = struct {
    var last_copied: ?[]const u8 = null;
    var copy_count: usize = 0;

    pub fn copy(_: std.mem.Allocator, text: []const u8) !void {
        last_copied = text;
        copy_count += 1;
    }

    pub fn getLastCopied() ?[]const u8 {
        return last_copied;
    }

    pub fn getCopyCount() usize {
        return copy_count;
    }

    pub fn reset() void {
        last_copied = null;
        copy_count = 0;
    }
};
