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
            if (self.thread == null) return; // already cleaned up (idempotent)
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

            // Check for interrupted agent runs on startup (crash recovery)
            self.recoverInterruptedRun();

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
                    const state_changed = blk: {
                        self.mutex.lock();
                        defer self.mutex.unlock();
                        break :blk self.agent_loop.tick(self.database) catch |err| err_blk: {
                            var buf: [64]u8 = undefined;
                            const msg = std.fmt.bufPrint(&buf, "tick error: {s}", .{@errorName(err)}) catch "error";
                            obs.global.logSimple(.err, @src(), "agent_thread", msg);
                            break :err_blk false;
                        };
                    };

                    did_work = true;
                    if (state_changed) {
                        self.notifyStateChanged();
                    }
                } else {
                    // No active work - check for pending messages in DB queue
                    const pending_msg = pending_blk: {
                        self.mutex.lock();
                        defer self.mutex.unlock();
                        break :pending_blk self.database.getNextPendingMessage(self.alloc) catch null;
                    };

                    if (pending_msg) |msg| {
                        obs.global.logSimple(.debug, @src(), "agent_thread", "processing pending message");
                        {
                            self.mutex.lock();
                            defer self.mutex.unlock();

                            // Mark as sent in DB
                            self.database.markMessageSent(msg.id) catch {};

                            // Set as pending query for agent loop
                            self.loading.pending_query = self.alloc.dupe(u8, msg.content) catch null;
                            if (self.loading.pending_query != null) {
                                self.loading.startLoading();
                            }

                            // Free the message content we got from DB
                            self.alloc.free(msg.content);
                            if (msg.tool_name) |tn| self.alloc.free(tn);
                            if (msg.tool_input) |ti| self.alloc.free(ti);
                        }
                        self.notifyStateChanged();
                        did_work = true;
                    }
                }

                if (!did_work) {
                    // No work - wait for signal or timeout
                    self.mutex.lock();
                    defer self.mutex.unlock();
                    // Wait with timeout so we can check stop flag and pending messages periodically
                    self.work_available.timedWait(&self.mutex, 50 * std.time.ns_per_ms) catch {};
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

        /// Check for and recover interrupted agent runs on startup
        fn recoverInterruptedRun(self: *Self) void {
            self.mutex.lock();
            defer self.mutex.unlock();

            const maybe_run = self.database.getActiveAgentRun(self.alloc) catch null;
            if (maybe_run) |run| {
                defer Database.freeAgentRun(self.alloc, run);

                obs.global.logSimple(.info, @src(), "agent_thread.recovery", "found interrupted run");

                // For now, just mark interrupted runs as error and notify user
                // Full recovery would parse the JSON and resume tool execution
                self.database.failAgentRun(run.id) catch {};

                const msg = "Previous agent run was interrupted. Starting fresh.";
                _ = self.database.addMessage(.system, msg) catch {};
                self.notifyStateChanged();
            }
        }
    };
}
