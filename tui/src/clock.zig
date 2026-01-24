const std = @import("std");

/// Clock interface for time operations via comptime DI
pub fn Clock(comptime Impl: type) type {
    return struct {
        pub fn milliTimestamp() i64 {
            return Impl.milliTimestamp();
        }

        pub fn sleep(ns: u64) void {
            Impl.sleep(ns);
        }
    };
}

/// Production implementation using std.time
pub const StdClock = struct {
    pub fn milliTimestamp() i64 {
        return std.time.milliTimestamp();
    }

    pub fn sleep(ns: u64) void {
        std.Thread.sleep(ns);
    }
};

/// Default production clock
pub const DefaultClock = Clock(StdClock);

/// Test mock clock with controllable time
pub const MockClock = struct {
    var current_time: i64 = 0;
    var sleep_calls: u64 = 0;

    pub fn milliTimestamp() i64 {
        return current_time;
    }

    pub fn sleep(_: u64) void {
        sleep_calls += 1;
    }

    pub fn setTime(t: i64) void {
        current_time = t;
    }

    pub fn advance(ms: i64) void {
        current_time += ms;
    }

    pub fn reset() void {
        current_time = 0;
        sleep_calls = 0;
    }
};

test "MockClock" {
    MockClock.reset();
    try std.testing.expectEqual(@as(i64, 0), Clock(MockClock).milliTimestamp());
    MockClock.advance(100);
    try std.testing.expectEqual(@as(i64, 100), Clock(MockClock).milliTimestamp());
}
