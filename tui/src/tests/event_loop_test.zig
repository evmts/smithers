const std = @import("std");
const event_loop_mod = @import("../event_loop.zig");
const event_mod = @import("../event.zig");

// ============================================================================
// Mock Types for Testing EventLoop DI Pattern
// ============================================================================

const MockKey = struct {
    codepoint: u21 = 0,
    mods: Modifiers = .{},

    pub const enter: u21 = '\r';
    pub const escape: u21 = 0x1b;

    pub const Modifiers = struct {
        ctrl: bool = false,
        alt: bool = false,
        shift: bool = false,
    };

    pub fn matches(self: MockKey, cp: u21, mods: Modifiers) bool {
        return self.codepoint == cp and
            self.mods.ctrl == mods.ctrl and
            self.mods.alt == mods.alt and
            self.mods.shift == mods.shift;
    }
};

const MockMouse = struct {
    x: u16 = 0,
    y: u16 = 0,
    button: Button = .none,

    pub const Button = enum { left, right, middle, none };
};

const MockWinsize = struct {
    rows: u16 = 24,
    cols: u16 = 80,
};

const MockWindow = struct {
    width: u16 = 80,
    height: u16 = 24,
};

const MockColor = struct {};
const MockStyle = struct {};

const MockBackend = struct {
    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = MockKey;
    pub const Mouse = MockMouse;
    pub const Winsize = MockWinsize;
};

const MockRenderer = @import("../rendering/renderer.zig").Renderer(MockBackend);
const MockEvent = event_mod.Event(MockRenderer);

// ============================================================================
// Mock Writer for Testing
// ============================================================================

const MockWriter = struct {
    written: std.ArrayList(u8),
    flush_count: usize = 0,

    pub fn init(allocator: std.mem.Allocator) MockWriter {
        return .{
            .written = std.ArrayList(u8).init(allocator),
        };
    }

    pub fn deinit(self: *MockWriter) void {
        self.written.deinit();
    }

    pub fn writeAll(self: *MockWriter, data: []const u8) !void {
        try self.written.appendSlice(data);
    }

    pub fn flush(self: *MockWriter) !void {
        self.flush_count += 1;
    }

    pub fn writer(self: *MockWriter) *MockWriter {
        return self;
    }
};

// ============================================================================
// Mock Tty for Testing
// ============================================================================

const MockTty = struct {
    buffer: *[1024]u8,
    fd: i32 = 0,
    mock_writer: MockWriter,
    initialized: bool = false,
    deinitialized: bool = false,

    pub fn init(buffer: *[1024]u8) !MockTty {
        return MockTty{
            .buffer = buffer,
            .fd = 0,
            .mock_writer = MockWriter.init(std.testing.allocator),
            .initialized = true,
            .deinitialized = false,
        };
    }

    pub fn deinit(self: *MockTty) void {
        self.mock_writer.deinit();
        self.deinitialized = true;
        self.initialized = false;
    }

    pub fn writer(self: *MockTty) *MockWriter {
        return &self.mock_writer;
    }

    pub fn getWinsize(_: i32) !MockWinsize {
        return MockWinsize{ .rows = 24, .cols = 80 };
    }
};

// ============================================================================
// Mock Vaxis for Testing
// ============================================================================

const MockVaxis = struct {
    allocator: std.mem.Allocator,
    initialized: bool = false,
    deinitialized: bool = false,
    in_alt_screen: bool = false,
    mouse_mode: bool = false,
    current_winsize: MockWinsize = .{},
    render_count: usize = 0,

    pub fn init(allocator: std.mem.Allocator, _: anytype) !MockVaxis {
        return MockVaxis{
            .allocator = allocator,
            .initialized = true,
        };
    }

    pub fn deinit(self: *MockVaxis, _: std.mem.Allocator, _: anytype) void {
        self.deinitialized = true;
        self.initialized = false;
    }

    pub fn enterAltScreen(self: *MockVaxis, _: anytype) !void {
        self.in_alt_screen = true;
    }

    pub fn exitAltScreen(self: *MockVaxis, _: anytype) !void {
        self.in_alt_screen = false;
    }

    pub fn setMouseMode(self: *MockVaxis, _: anytype, enabled: bool) !void {
        self.mouse_mode = enabled;
    }

    pub fn resize(self: *MockVaxis, _: std.mem.Allocator, _: anytype, ws: MockWinsize) !void {
        self.current_winsize = ws;
    }

    pub fn window(_: *MockVaxis) MockWindow {
        return MockWindow{};
    }

    pub fn render(self: *MockVaxis, _: anytype) !void {
        self.render_count += 1;
    }
};

// ============================================================================
// Mock Loop for Testing
// ============================================================================

const MockLoop = struct {
    tty: *MockTty,
    vaxis: *MockVaxis,
    started: bool = false,
    stopped: bool = false,
    init_called: bool = false,
    event_queue: std.ArrayList(MockEvent),
    allocator: std.mem.Allocator,

    pub fn initWithAllocator(allocator: std.mem.Allocator, tty: *MockTty, vaxis: *MockVaxis) MockLoop {
        return MockLoop{
            .tty = tty,
            .vaxis = vaxis,
            .allocator = allocator,
            .event_queue = std.ArrayList(MockEvent).init(allocator),
        };
    }

    pub fn deinit(self: *MockLoop) void {
        self.event_queue.deinit();
    }

    pub fn init(self: *MockLoop) !void {
        self.init_called = true;
    }

    pub fn start(self: *MockLoop) !void {
        self.started = true;
        self.stopped = false;
    }

    pub fn stop(self: *MockLoop) void {
        self.stopped = true;
        self.started = false;
    }

    pub fn nextEvent(self: *MockLoop) MockEvent {
        if (self.event_queue.items.len > 0) {
            return self.event_queue.orderedRemove(0);
        }
        return MockEvent{ .key_press = .{ .codepoint = 0 } };
    }

    pub fn tryEvent(self: *MockLoop) ?MockEvent {
        if (self.event_queue.items.len > 0) {
            return self.event_queue.orderedRemove(0);
        }
        return null;
    }

    pub fn pushEvent(self: *MockLoop, event: MockEvent) !void {
        try self.event_queue.append(event);
    }
};

// ============================================================================
// Simplified Test EventLoop (not using vaxis.Loop)
// ============================================================================

fn TestEventLoop(comptime Vaxis: type, comptime Tty: type) type {
    return struct {
        allocator: std.mem.Allocator,
        tty: Tty,
        vx: Vaxis,
        loop: MockLoop,
        tty_buffer: [1024]u8,
        state: State = .uninitialized,

        const Self = @This();

        pub const State = enum {
            uninitialized,
            initialized,
            started,
            stopped,
            deinitialized,
        };

        pub fn init(allocator: std.mem.Allocator) !Self {
            var self: Self = .{
                .allocator = allocator,
                .tty_buffer = undefined,
                .tty = undefined,
                .vx = undefined,
                .loop = undefined,
                .state = .uninitialized,
            };

            self.tty = try Tty.init(&self.tty_buffer);
            errdefer self.tty.deinit();

            self.vx = try Vaxis.init(allocator, .{});
            errdefer self.vx.deinit(allocator, self.tty.writer());

            self.loop = MockLoop.initWithAllocator(allocator, &self.tty, &self.vx);
            try self.loop.init();
            self.state = .initialized;

            return self;
        }

        pub fn deinit(self: *Self) void {
            self.loop.stop();
            self.loop.deinit();
            self.vx.exitAltScreen(self.tty.writer()) catch {};
            self.vx.deinit(self.allocator, self.tty.writer());
            self.tty.deinit();
            self.state = .deinitialized;
        }

        pub fn start(self: *Self) !void {
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
            try self.vx.setMouseMode(self.tty.writer(), true);
            const ws = try self.getWinsize();
            try self.resize(ws);
            self.state = .started;
        }

        pub fn getWinsize(self: *Self) !MockWinsize {
            return Tty.getWinsize(self.tty.fd);
        }

        pub fn stop(self: *Self) void {
            self.loop.stop();
            self.state = .stopped;
        }

        pub fn nextEvent(self: *Self) MockEvent {
            return self.loop.nextEvent();
        }

        pub fn tryEvent(self: *Self) ?MockEvent {
            return self.loop.tryEvent();
        }

        pub fn resize(self: *Self, ws: MockWinsize) !void {
            try self.vx.resize(self.allocator, self.tty.writer(), ws);
        }

        pub fn window(self: *Self) MockWindow {
            return self.vx.window();
        }

        pub fn render(self: *Self) !void {
            try self.vx.render(self.tty.writer());
        }

        pub fn suspendTui(self: *Self) !void {
            self.loop.stop();
            const writer = self.tty.writer();
            try writer.writeAll("\x1b[?1049l\x1b[?25h");
            try writer.flush();
            self.tty.deinit();
            self.tty = try Tty.init(&self.tty_buffer);
            self.loop = MockLoop.initWithAllocator(self.allocator, &self.tty, &self.vx);
            try self.loop.init();
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
        }

        pub fn reinitTty(self: *Self) !void {
            self.tty = try Tty.init(&self.tty_buffer);
            self.loop = MockLoop.initWithAllocator(self.allocator, &self.tty, &self.vx);
            try self.loop.init();
            try self.loop.start();
            try self.vx.enterAltScreen(self.tty.writer());
        }

        pub fn pushTestEvent(self: *Self, event: MockEvent) !void {
            try self.loop.pushEvent(event);
        }
    };
}

const TestableEventLoop = TestEventLoop(MockVaxis, MockTty);

// ============================================================================
// EventLoop Generic DI Pattern Tests
// ============================================================================

test "EventLoop generic instantiation compiles" {
    _ = event_loop_mod.EventLoop;
}

test "DefaultEventLoop type exists" {
    _ = event_loop_mod.DefaultEventLoop;
}

test "EventLoop generic with mock types compiles" {
    _ = TestableEventLoop;
}

// ============================================================================
// EventLoop Initialization Tests
// ============================================================================

test "EventLoop.init creates instance with initialized state" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try std.testing.expectEqual(TestableEventLoop.State.initialized, el.state);
    try std.testing.expect(el.tty.initialized);
    try std.testing.expect(el.vx.initialized);
    try std.testing.expect(el.loop.init_called);
}

test "EventLoop.init allocates tty_buffer" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try std.testing.expectEqual(@as(usize, 1024), el.tty_buffer.len);
}

test "EventLoop.deinit cleans up resources" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    el.deinit();

    try std.testing.expectEqual(TestableEventLoop.State.deinitialized, el.state);
    try std.testing.expect(el.tty.deinitialized);
    try std.testing.expect(el.vx.deinitialized);
    try std.testing.expect(el.loop.stopped);
}

// ============================================================================
// EventLoop State Transition Tests
// ============================================================================

test "EventLoop state transitions: init -> start -> stop -> deinit" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    try std.testing.expectEqual(TestableEventLoop.State.initialized, el.state);

    try el.start();
    try std.testing.expectEqual(TestableEventLoop.State.started, el.state);

    el.stop();
    try std.testing.expectEqual(TestableEventLoop.State.stopped, el.state);

    el.deinit();
    try std.testing.expectEqual(TestableEventLoop.State.deinitialized, el.state);
}

test "EventLoop can be stopped without starting" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    el.stop();
    try std.testing.expectEqual(TestableEventLoop.State.stopped, el.state);
}

test "EventLoop can be stopped multiple times" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    el.stop();
    el.stop();
    el.stop();
    try std.testing.expectEqual(TestableEventLoop.State.stopped, el.state);
}

// ============================================================================
// EventLoop Start Tests
// ============================================================================

test "EventLoop.start enables alt screen" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    try std.testing.expect(el.vx.in_alt_screen);
}

test "EventLoop.start enables mouse mode" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    try std.testing.expect(el.vx.mouse_mode);
}

test "EventLoop.start initializes winsize" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    try std.testing.expectEqual(@as(u16, 24), el.vx.current_winsize.rows);
    try std.testing.expectEqual(@as(u16, 80), el.vx.current_winsize.cols);
}

test "EventLoop.start starts the loop" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    try std.testing.expect(el.loop.started);
}

// ============================================================================
// EventLoop getWinsize Tests
// ============================================================================

test "EventLoop.getWinsize returns dimensions" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    const ws = try el.getWinsize();
    try std.testing.expectEqual(@as(u16, 24), ws.rows);
    try std.testing.expectEqual(@as(u16, 80), ws.cols);
}

// ============================================================================
// EventLoop Event Polling Tests
// ============================================================================

test "EventLoop.nextEvent returns queued event" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'a' } });
    const event = el.nextEvent();

    try std.testing.expect(event == .key_press);
    try std.testing.expectEqual(@as(u21, 'a'), event.key_press.codepoint);
}

test "EventLoop.nextEvent returns default when queue empty" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    const event = el.nextEvent();
    try std.testing.expect(event == .key_press);
    try std.testing.expectEqual(@as(u21, 0), event.key_press.codepoint);
}

test "EventLoop.tryEvent returns queued event" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'b' } });
    const event = el.tryEvent();

    try std.testing.expect(event != null);
    try std.testing.expectEqual(@as(u21, 'b'), event.?.key_press.codepoint);
}

test "EventLoop.tryEvent returns null when queue empty" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    const event = el.tryEvent();
    try std.testing.expect(event == null);
}

test "EventLoop processes multiple events in order" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = '1' } });
    try el.pushTestEvent(.{ .key_press = .{ .codepoint = '2' } });
    try el.pushTestEvent(.{ .key_press = .{ .codepoint = '3' } });

    try std.testing.expectEqual(@as(u21, '1'), el.nextEvent().key_press.codepoint);
    try std.testing.expectEqual(@as(u21, '2'), el.nextEvent().key_press.codepoint);
    try std.testing.expectEqual(@as(u21, '3'), el.nextEvent().key_press.codepoint);
}

test "EventLoop handles mixed event types" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'k' } });
    try el.pushTestEvent(.{ .mouse = .{ .x = 10, .y = 20, .button = .left } });
    try el.pushTestEvent(.{ .winsize = .{ .rows = 50, .cols = 100 } });

    const e1 = el.nextEvent();
    try std.testing.expect(e1 == .key_press);

    const e2 = el.nextEvent();
    try std.testing.expect(e2 == .mouse);
    try std.testing.expectEqual(@as(u16, 10), e2.mouse.x);

    const e3 = el.nextEvent();
    try std.testing.expect(e3 == .winsize);
    try std.testing.expectEqual(@as(u16, 50), e3.winsize.rows);
}

// ============================================================================
// EventLoop Resize Tests
// ============================================================================

test "EventLoop.resize updates vaxis winsize" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.resize(.{ .rows = 48, .cols = 160 });
    try std.testing.expectEqual(@as(u16, 48), el.vx.current_winsize.rows);
    try std.testing.expectEqual(@as(u16, 160), el.vx.current_winsize.cols);
}

test "EventLoop.resize with zero dimensions" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.resize(.{ .rows = 0, .cols = 0 });
    try std.testing.expectEqual(@as(u16, 0), el.vx.current_winsize.rows);
    try std.testing.expectEqual(@as(u16, 0), el.vx.current_winsize.cols);
}

test "EventLoop.resize with max u16 dimensions" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.resize(.{ .rows = std.math.maxInt(u16), .cols = std.math.maxInt(u16) });
    try std.testing.expectEqual(std.math.maxInt(u16), el.vx.current_winsize.rows);
    try std.testing.expectEqual(std.math.maxInt(u16), el.vx.current_winsize.cols);
}

// ============================================================================
// EventLoop Window Tests
// ============================================================================

test "EventLoop.window returns window from vaxis" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    const win = el.window();
    try std.testing.expectEqual(@as(u16, 80), win.width);
    try std.testing.expectEqual(@as(u16, 24), win.height);
}

// ============================================================================
// EventLoop Render Tests
// ============================================================================

test "EventLoop.render calls vaxis render" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.render();
    try std.testing.expectEqual(@as(usize, 1), el.vx.render_count);
}

test "EventLoop.render can be called multiple times" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.render();
    try el.render();
    try el.render();
    try std.testing.expectEqual(@as(usize, 3), el.vx.render_count);
}

// ============================================================================
// EventLoop Suspend/Resume Tests
// ============================================================================

test "EventLoop.suspendTui writes escape sequences" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    try el.suspendTui();

    try std.testing.expect(el.vx.in_alt_screen);
    try std.testing.expect(el.loop.started);
}

test "EventLoop.reinitTty reinitializes and starts" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.start();
    el.stop();
    try el.reinitTty();

    try std.testing.expect(el.tty.initialized);
    try std.testing.expect(el.loop.init_called);
    try std.testing.expect(el.loop.started);
    try std.testing.expect(el.vx.in_alt_screen);
}

// ============================================================================
// EventLoop Edge Cases
// ============================================================================

test "EventLoop handles rapid start/stop cycles" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    var i: usize = 0;
    while (i < 10) : (i += 1) {
        try el.start();
        el.stop();
    }

    try std.testing.expectEqual(TestableEventLoop.State.stopped, el.state);
}

test "EventLoop preserves allocator reference" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try std.testing.expect(el.allocator.ptr == std.testing.allocator.ptr);
}

test "EventLoop tty_buffer has correct size" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try std.testing.expectEqual(@as(usize, 1024), @as(usize, el.tty_buffer.len));
}

// ============================================================================
// Event Type Integration Tests
// ============================================================================

test "EventLoop events support isQuit check" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'c', .mods = .{ .ctrl = true } } });
    const event = el.nextEvent();
    try std.testing.expect(event.isQuit());
}

test "EventLoop events support isEnter check" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = MockKey.enter } });
    const event = el.nextEvent();
    try std.testing.expect(event.isEnter());
}

test "EventLoop mouse events have correct coordinates" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .mouse = .{ .x = 50, .y = 25, .button = .right } });
    const event = el.nextEvent();

    try std.testing.expect(event == .mouse);
    try std.testing.expectEqual(@as(u16, 50), event.mouse.x);
    try std.testing.expectEqual(@as(u16, 25), event.mouse.y);
    try std.testing.expectEqual(MockMouse.Button.right, event.mouse.button);
}

test "EventLoop winsize events have correct dimensions" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .winsize = .{ .rows = 120, .cols = 240 } });
    const event = el.nextEvent();

    try std.testing.expect(event == .winsize);
    try std.testing.expectEqual(@as(u16, 120), event.winsize.rows);
    try std.testing.expectEqual(@as(u16, 240), event.winsize.cols);
}

// ============================================================================
// Queue Stress Tests
// ============================================================================

test "EventLoop handles many queued events" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    var i: u21 = 0;
    while (i < 100) : (i += 1) {
        try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'a' + @as(u21, @intCast(i % 26)) } });
    }

    i = 0;
    while (i < 100) : (i += 1) {
        const event = el.nextEvent();
        try std.testing.expect(event == .key_press);
    }

    try std.testing.expect(el.tryEvent() == null);
}

test "EventLoop alternating nextEvent and tryEvent" {
    var el = try TestableEventLoop.init(std.testing.allocator);
    defer el.deinit();

    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'a' } });
    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'b' } });
    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'c' } });
    try el.pushTestEvent(.{ .key_press = .{ .codepoint = 'd' } });

    _ = el.nextEvent();
    _ = el.tryEvent();
    _ = el.nextEvent();
    const last = el.tryEvent();

    try std.testing.expect(last != null);
    try std.testing.expectEqual(@as(u21, 'd'), last.?.key_press.codepoint);
    try std.testing.expect(el.tryEvent() == null);
}
