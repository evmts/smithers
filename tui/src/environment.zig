const std = @import("std");

/// Environment interface for env vars via comptime DI
pub fn Environment(comptime Impl: type) type {
    return struct {
        pub fn get(key: [:0]const u8) ?[:0]const u8 {
            return Impl.get(key);
        }

        /// Helper for common keys
        pub fn home() ?[:0]const u8 {
            return get("HOME");
        }

        pub fn anthropicApiKey() ?[:0]const u8 {
            return get("ANTHROPIC_API_KEY");
        }

        pub fn editor() ?[:0]const u8 {
            return get("EDITOR");
        }
    };
}

/// Production implementation using std.posix
pub const PosixEnv = struct {
    pub fn get(key: [:0]const u8) ?[:0]const u8 {
        return std.posix.getenv(key);
    }
};

/// Test mock environment with controllable values
pub const MockEnv = struct {
    var values: std.StringHashMapUnmanaged([:0]const u8) = .{};
    var allocator: ?std.mem.Allocator = null;

    pub fn init(alloc: std.mem.Allocator) void {
        allocator = alloc;
        values = std.StringHashMapUnmanaged([:0]const u8){};
    }

    pub fn deinit() void {
        values.deinit(allocator.?);
    }

    pub fn get(key: [:0]const u8) ?[:0]const u8 {
        return values.get(key);
    }

    pub fn set(key: []const u8, value: [:0]const u8) void {
        values.put(allocator.?, key, value) catch {};
    }

    pub fn reset() void {
        values.clearRetainingCapacity();
    }
};

test "Environment basics" {
    // Just verify the interface compiles with explicit type
    const ProdEnv = Environment(PosixEnv);
    const home = ProdEnv.home();
    _ = home; // May or may not exist
}
