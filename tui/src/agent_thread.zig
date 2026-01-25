const std = @import("std");
const obs = @import("obs.zig");

/// AgentThread runs the agent loop in a background thread.
/// Coordinates with the main UI thread via shared state and atomic flags.
pub fn AgentThread(
    comptime AgentLoopT: type,
    comptime Loading: type,
    comptime Database: type,
    comptime ChatHistory: type,
) type {
    return struct {
        const Self = @This();

        alloc: std.mem.Allocator,
        thread: ?std.Thread = null,
        should_stop: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
        state_changed: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),

        // Shared state protected by mutex
        mutex: std.Thread.Mutex = .{},
        agent_loop: AgentLoopT,
        loading: *Loading,
        database: *Database,
        chat_history: *ChatHistory,

        // Condition variable for waking agent thread
        work_available: std.Thread.Condition = .{},

        pub fn init(
            alloc: std.mem.Allocator,
            loading: *Loading,
            database: *Database,
            chat_history: *ChatHistory,
        ) Self {
            return .{
                .alloc = alloc,
                .agent_loop = AgentLoopT.init(alloc, loading),
                .loading = loading,
                .database = database,
                .chat_history = chat_history,
            };
        }

        pub fn start(self: *Self) !void {
            self.should_stop.store(false, .release);
            self.thread = try std.Thread.spawn(.{}, threadMain, .{self});
        }

        pub fn stop(self: *Self) void {
            self.should_stop.store(true, .release);
            // Wake thread so it can see the stop flag
            self.mutex.lock();
            self.work_available.signal();
            self.mutex.unlock();
        }

        pub fn join(self: *Self) void {
            if (self.thread) |t| {
                t.join();
                self.thread = null;
            }
        }

        pub fn deinit(self: *Self) void {
            self.stop();
            self.join();
        }

        /// Signal that new work is available (e.g., user submitted query)
        pub fn wakeForWork(self: *Self) void {
            self.mutex.lock();
            self.work_available.signal();
            self.mutex.unlock();
        }

        /// Check if agent state changed (call from main thread, clears flag)
        pub fn consumeStateChanged(self: *Self) bool {
            return self.state_changed.swap(false, .acq_rel);
        }

        /// Mark that state changed (call from agent thread)
        fn notifyStateChanged(self: *Self) void {
            self.state_changed.store(true, .release);
        }

        fn threadMain(self: *Self) void {
            obs.global.logSimple(.info, @src(), "agent_thread", "started");

            while (!self.should_stop.load(.acquire)) {
                var did_work = false;

                // Check if there's work to do
                self.mutex.lock();

                const has_query = self.loading.pending_query != null;
                const has_continuation = self.loading.pending_continuation != null;
                const has_stream = self.agent_loop.streaming != null;
                const has_tools = self.loading.hasToolsToExecute();
                const is_executing = self.loading.isExecutingTool();
                const is_loading = self.loading.isLoading();

                self.mutex.unlock();

                // If we have active work, tick the agent loop
                if (has_query or has_continuation or has_stream or has_tools or is_executing or is_loading) {
                    self.mutex.lock();
                    const state_changed = self.agent_loop.tick(self.database) catch |err| blk: {
                        var buf: [64]u8 = undefined;
                        const msg = std.fmt.bufPrint(&buf, "tick error: {s}", .{@errorName(err)}) catch "error";
                        obs.global.logSimple(.err, @src(), "agent_thread", msg);
                        break :blk false;
                    };
                    self.mutex.unlock();

                    did_work = true;
                    if (state_changed) {
                        self.notifyStateChanged();
                    }
                }

                if (!did_work) {
                    // No work - wait for signal or timeout
                    self.mutex.lock();
                    // Wait with timeout so we can check stop flag periodically
                    self.work_available.timedWait(&self.mutex, 50 * std.time.ns_per_ms) catch {};
                    self.mutex.unlock();
                } else {
                    // Small yield between active ticks to not spin too fast
                    std.Thread.sleep(5 * std.time.ns_per_ms);
                }
            }

            obs.global.logSimple(.info, @src(), "agent_thread", "stopped");
        }

        /// Lock for main thread to safely read loading state
        pub fn lockForRead(self: *Self) void {
            self.mutex.lock();
        }

        pub fn unlockForRead(self: *Self) void {
            self.mutex.unlock();
        }
    };
}
