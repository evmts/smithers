const std = @import("std");
const clock_mod = @import("../clock.zig");
const Clock = clock_mod.Clock;
const StdClock = clock_mod.StdClock;
const MockClock = clock_mod.MockClock;
const DefaultClock = clock_mod.DefaultClock;

test "StdClock returns non-zero timestamp" {
    const ts = StdClock.milliTimestamp();
    try std.testing.expect(ts > 0);
}

test "StdClock timestamp advances" {
    const ts1 = StdClock.milliTimestamp();
    std.Thread.sleep(1_000_000); // 1ms
    const ts2 = StdClock.milliTimestamp();
    try std.testing.expect(ts2 >= ts1);
}

test "MockClock initial state is zero" {
    MockClock.reset();
    try std.testing.expectEqual(@as(i64, 0), MockClock.milliTimestamp());
}

test "MockClock advance adds milliseconds" {
    MockClock.reset();
    MockClock.advance(100);
    try std.testing.expectEqual(@as(i64, 100), MockClock.milliTimestamp());
    MockClock.advance(50);
    try std.testing.expectEqual(@as(i64, 150), MockClock.milliTimestamp());
}

test "MockClock setTime overrides value" {
    MockClock.reset();
    MockClock.setTime(500);
    try std.testing.expectEqual(@as(i64, 500), MockClock.milliTimestamp());
    MockClock.setTime(1000);
    try std.testing.expectEqual(@as(i64, 1000), MockClock.milliTimestamp());
}

test "MockClock reset clears state" {
    MockClock.setTime(999);
    MockClock.sleep(0);
    MockClock.reset();
    try std.testing.expectEqual(@as(i64, 0), MockClock.milliTimestamp());
    try std.testing.expectEqual(@as(u64, 0), MockClock.sleep_calls);
}

test "MockClock sleep increments call counter" {
    MockClock.reset();
    MockClock.sleep(1000);
    try std.testing.expectEqual(@as(u64, 1), MockClock.sleep_calls);
    MockClock.sleep(2000);
    try std.testing.expectEqual(@as(u64, 2), MockClock.sleep_calls);
}

test "MockClock negative time" {
    MockClock.reset();
    MockClock.setTime(-100);
    try std.testing.expectEqual(@as(i64, -100), MockClock.milliTimestamp());
}

test "MockClock advance with negative value" {
    MockClock.reset();
    MockClock.setTime(100);
    MockClock.advance(-50);
    try std.testing.expectEqual(@as(i64, 50), MockClock.milliTimestamp());
}

test "MockClock overflow behavior" {
    MockClock.reset();
    MockClock.setTime(std.math.maxInt(i64));
    try std.testing.expectEqual(std.math.maxInt(i64), MockClock.milliTimestamp());
}

test "MockClock underflow via advance" {
    MockClock.reset();
    MockClock.setTime(std.math.minInt(i64));
    try std.testing.expectEqual(std.math.minInt(i64), MockClock.milliTimestamp());
}

test "MockClock zero advance has no effect" {
    MockClock.reset();
    MockClock.setTime(42);
    MockClock.advance(0);
    try std.testing.expectEqual(@as(i64, 42), MockClock.milliTimestamp());
}

test "Clock DI interface works with MockClock" {
    const TestClock = Clock(MockClock);
    MockClock.reset();
    try std.testing.expectEqual(@as(i64, 0), TestClock.milliTimestamp());
    MockClock.advance(200);
    try std.testing.expectEqual(@as(i64, 200), TestClock.milliTimestamp());
}

test "Clock DI interface works with StdClock" {
    const ProdClock = Clock(StdClock);
    const ts = ProdClock.milliTimestamp();
    try std.testing.expect(ts > 0);
}

test "DefaultClock is Clock(StdClock)" {
    const ts = DefaultClock.milliTimestamp();
    try std.testing.expect(ts > 0);
}

test "Clock interface sleep dispatches to impl" {
    const TestClock = Clock(MockClock);
    MockClock.reset();
    TestClock.sleep(1000);
    try std.testing.expectEqual(@as(u64, 1), MockClock.sleep_calls);
}

test "MockClock state isolation after reset" {
    MockClock.setTime(12345);
    MockClock.sleep(0);
    MockClock.sleep(0);
    MockClock.reset();
    try std.testing.expectEqual(@as(i64, 0), MockClock.milliTimestamp());
    try std.testing.expectEqual(@as(u64, 0), MockClock.sleep_calls);
}
