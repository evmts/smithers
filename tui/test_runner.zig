const std = @import("std");
const builtin = @import("builtin");

// ANSI color codes and styles
const Color = struct {
    const reset = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const italic = "\x1b[3m";
    const underline = "\x1b[4m";

    const black = "\x1b[30m";
    const red = "\x1b[31m";
    const green = "\x1b[32m";
    const yellow = "\x1b[33m";
    const blue = "\x1b[34m";
    const magenta = "\x1b[35m";
    const cyan = "\x1b[36m";
    const white = "\x1b[37m";
    const gray = "\x1b[90m";
    const bright_red = "\x1b[91m";
    const bright_green = "\x1b[92m";
    const bright_yellow = "\x1b[93m";
    const bright_blue = "\x1b[94m";
    const bright_magenta = "\x1b[95m";
    const bright_cyan = "\x1b[96m";

    // Background colors
    const bg_red = "\x1b[41m";
    const bg_green = "\x1b[42m";
    const bg_yellow = "\x1b[43m";
    const bg_blue = "\x1b[44m";
    const bg_magenta = "\x1b[45m";
    const bg_cyan = "\x1b[46m";
    const bg_white = "\x1b[47m";
    const bg_gray = "\x1b[100m";
    const bg_bright_red = "\x1b[101m";
    const bg_bright_green = "\x1b[102m";
};

const Icons = struct {
    const check = "✓";
    const cross = "✖";
    const dot = "·";
    const arrow = "›";
    const pointer = "❯";
    const info = "ℹ";
    const warning = "⚠";
    const error_icon = "⨯";
    const clock = "⏱";
};

const TestResult = struct {
    name: []const u8,
    suite: []const u8,
    test_name: []const u8,
    passed: bool,
    todo: bool = false, // New field for TODO tests
    error_msg: ?[]const u8,
    duration_ns: u64,
    file_path: ?[]const u8 = null,
    line_number: ?u32 = null,
};

fn extractSuiteName(full_name: []const u8) []const u8 {
    // Find the last occurrence of ".test."
    var last_test_pos: ?usize = null;
    var i: usize = 0;
    while (i < full_name.len - 5) : (i += 1) {
        if (std.mem.eql(u8, full_name[i..@min(i + 6, full_name.len)], ".test.")) {
            last_test_pos = i;
        }
    }

    if (last_test_pos) |pos| {
        return full_name[0..pos];
    }

    // Fallback: find last dot
    if (std.mem.lastIndexOf(u8, full_name, ".")) |pos| {
        return full_name[0..pos];
    }

    return full_name;
}

fn extractTestName(full_name: []const u8) []const u8 {
    // Find the last occurrence of ".test."
    var last_test_pos: ?usize = null;
    var i: usize = 0;
    while (i < full_name.len - 5) : (i += 1) {
        if (std.mem.eql(u8, full_name[i..@min(i + 6, full_name.len)], ".test.")) {
            last_test_pos = i + 6;
        }
    }

    if (last_test_pos) |pos| {
        return full_name[pos..];
    }

    // Fallback: find last dot
    if (std.mem.lastIndexOf(u8, full_name, ".")) |pos| {
        return full_name[pos + 1 ..];
    }

    return full_name;
}

fn formatDuration(writer: anytype, ns: u64) void {
    if (ns < 1_000) {
        writer.print("{s}{d} ns{s}", .{ Color.gray, ns, Color.reset }) catch {};
    } else if (ns < 1_000_000) {
        writer.print("{s}{d:.2} μs{s}", .{ Color.gray, @as(f64, @floatFromInt(ns)) / 1_000.0, Color.reset }) catch {};
    } else if (ns < 1_000_000_000) {
        writer.print("{s}{d:.2} ms{s}", .{ Color.gray, @as(f64, @floatFromInt(ns)) / 1_000_000.0, Color.reset }) catch {};
    } else {
        writer.print("{s}{d:.2} s{s}", .{ Color.yellow, @as(f64, @floatFromInt(ns)) / 1_000_000_000.0, Color.reset }) catch {};
    }
}

fn clearLine(writer: anytype) void {
    writer.print("\r\x1b[K", .{}) catch {};
}

fn moveCursorUp(writer: anytype, lines: usize) void {
    writer.print("\x1b[{d}A", .{lines}) catch {};
}

fn printProgress(writer: anytype, current: usize, total: usize, suite_name: []const u8) void {
    clearLine(writer);
    const percent = (current * 100) / total;

    // Progress bar
    const bar_width = 20;
    const filled = (current * bar_width) / total;

    writer.print(" {s}⠙{s} ", .{ Color.cyan, Color.reset }) catch {};

    // Progress bar
    writer.print("{s}[{s}", .{ Color.dim, Color.reset }) catch {};
    for (0..bar_width) |i| {
        if (i < filled) {
            writer.print("{s}━{s}", .{ Color.bright_cyan, Color.reset }) catch {};
        } else {
            writer.print("{s}━{s}", .{ Color.gray, Color.reset }) catch {};
        }
    }
    writer.print("{s}]{s} ", .{ Color.dim, Color.reset }) catch {};

    writer.print("{s}{d}%{s} ", .{ Color.bright_cyan, percent, Color.reset }) catch {};
    writer.print("{s}|{s} ", .{ Color.dim, Color.reset }) catch {};
    writer.print("{s}{s}{s}", .{ Color.gray, suite_name, Color.reset }) catch {};
    writer.print(" {s}[{d}/{d}]{s}", .{ Color.dim, current, total, Color.reset }) catch {};
}

fn getSourceContext(allocator: std.mem.Allocator, file_path: []const u8, line_number: u32) ?[]const u8 {
    const file = std.fs.cwd().openFile(file_path, .{}) catch return null;
    defer file.close();

    const content = file.readToEndAlloc(allocator, 1024 * 1024) catch return null;
    defer allocator.free(content);

    var lines = std.mem.tokenizeScalar(u8, content, '\n');
    var current_line: u32 = 1;
    var context = std.ArrayList(u8){};
    defer context.deinit(allocator);

    // Get 3 lines before and after
    const start_line = if (line_number > 3) line_number - 3 else 1;
    const end_line = line_number + 3;

    while (lines.next()) |line| {
        if (current_line >= start_line and current_line <= end_line) {
            const is_error_line = current_line == line_number;

            if (is_error_line) {
                context.writer().print("{s}{s} {d:>4} │{s} {s}{s}{s}\n", .{
                    Color.bg_red,
                    Color.white,
                    current_line,
                    Color.reset,
                    Color.bright_red,
                    line,
                    Color.reset,
                }) catch {};
            } else {
                context.writer().print("{s} {d:>4} │{s} {s}\n", .{
                    Color.gray,
                    current_line,
                    Color.reset,
                    line,
                }) catch {};
            }
        }
        current_line += 1;
        if (current_line > end_line) break;
    }

    return context.toOwnedSlice(allocator) catch null;
}

fn runTestInProcess(allocator: std.mem.Allocator, test_index: usize) !TestResult {
    const t = builtin.test_functions[test_index];
    const suite_name = extractSuiteName(t.name);
    const test_name = extractTestName(t.name);

    var test_result = TestResult{
        .name = t.name,
        .suite = suite_name,
        .test_name = test_name,
        .passed = true,
        .error_msg = null,
        .duration_ns = 0,
    };

    const test_start = std.time.nanoTimestamp();

    // Fork to isolate test execution
    const pid = try std.posix.fork();

    if (pid == 0) {
        // Child process - run the test
        std.testing.allocator_instance = .{};
        t.func() catch {
            std.posix.exit(1);
        };

        if (std.testing.allocator_instance.deinit() == .leak) {
            std.posix.exit(2); // Exit code 2 for memory leak
        }

        std.posix.exit(0); // Success
    } else {
        // Parent process - wait for child
        const wait_result = std.posix.waitpid(pid, 0);
        const test_end = std.time.nanoTimestamp();
        test_result.duration_ns = @intCast(test_end - test_start);

        if (std.posix.W.IFEXITED(wait_result.status)) {
            const exit_code = std.posix.W.EXITSTATUS(wait_result.status);
            if (exit_code == 0) {
                test_result.passed = true;
            } else if (exit_code == 1) {
                test_result.passed = false;
                test_result.error_msg = try allocator.dupe(u8, "test failed");
            } else if (exit_code == 2) {
                test_result.passed = false;
                test_result.error_msg = try allocator.dupe(u8, "memory leak detected");
            } else {
                test_result.passed = false;
                test_result.error_msg = try std.fmt.allocPrint(allocator, "exited with code {d}", .{exit_code});
            }
        } else if (std.posix.W.IFSIGNALED(wait_result.status)) {
            const signal = std.posix.W.TERMSIG(wait_result.status);
            test_result.passed = false;
            test_result.error_msg = try std.fmt.allocPrint(allocator, "crashed with signal {d}", .{signal});
        } else {
            test_result.passed = false;
            test_result.error_msg = try allocator.dupe(u8, "abnormal termination");
        }
    }

    return test_result;
}

pub fn main() !void {
    const stdout_file = std.fs.File.stdout();
    const stderr_file = std.fs.File.stderr();

    var stdout_buffer: [4096]u8 = undefined;
    var stderr_buffer: [4096]u8 = undefined;

    var stdout_writer = stdout_file.writer(&stdout_buffer);
    var stderr_writer = stderr_file.writer(&stderr_buffer);

    const stdout = &stdout_writer.interface;
    const stderr = &stderr_writer.interface;

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var results = std.ArrayList(TestResult){};
    defer {
        for (results.items) |*result| {
            if (result.error_msg) |msg| {
                allocator.free(msg);
            }
        }
        results.deinit(allocator);
    }

    const total_tests = builtin.test_functions.len;
    const start_time = std.time.nanoTimestamp();

    // Print header with better styling
    try stdout.print("\n", .{});
    try stdout.print(" {s}{s} RUN {s} {s}v0.15.1{s}\n", .{
        Color.bg_blue,
        Color.white,
        Color.reset,
        Color.gray,
        Color.reset,
    });
    try stdout.print(" {s}{s}~/guillotine{s}\n\n", .{
        Color.cyan,
        Icons.arrow,
        Color.reset,
    });
    try stdout.flush();

    // Check if output is a TTY
    const has_tty = stdout_file.isTty();

    // Run all tests in isolated processes
    for (builtin.test_functions, 0..) |t, i| {
        const suite_name = extractSuiteName(t.name);

        if (has_tty) {
            printProgress(stdout, i + 1, total_tests, suite_name);
            try stdout.flush();
        }

        const test_result = try runTestInProcess(allocator, i);
        try results.append(allocator, test_result);
    }

    if (has_tty) {
        clearLine(stdout);
        try stdout.flush();
    }

    // Group results by suite
    var suite_map = std.StringHashMap(std.ArrayList(TestResult)).init(allocator);
    defer {
        var it = suite_map.iterator();
        while (it.next()) |entry| {
            entry.value_ptr.deinit(allocator);
        }
        suite_map.deinit();
    }

    for (results.items) |result| {
        const entry = try suite_map.getOrPut(result.suite);
        if (!entry.found_existing) {
            entry.value_ptr.* = std.ArrayList(TestResult){};
        }
        try entry.value_ptr.append(allocator, result);
    }

    // Sort suites
    var suites = std.ArrayList([]const u8){};
    defer suites.deinit(allocator);
    var suite_iter = suite_map.iterator();
    while (suite_iter.next()) |entry| {
        try suites.append(allocator, entry.key_ptr.*);
    }
    std.mem.sort([]const u8, suites.items, {}, struct {
        fn lessThan(_: void, a: []const u8, b: []const u8) bool {
            return std.mem.order(u8, a, b) == .lt;
        }
    }.lessThan);

    // Display results with better formatting
    var failed_tests = std.ArrayList(TestResult){};
    defer failed_tests.deinit(allocator);

    var passed_count: u32 = 0;
    var failed_count: u32 = 0;
    var todo_count: u32 = 0;

    for (suites.items) |suite| {
        const tests = suite_map.get(suite).?;

        var suite_passed: u32 = 0;
        var suite_failed: u32 = 0;
        var suite_todo: u32 = 0;
        var suite_duration: u64 = 0;

        for (tests.items) |t| {
            suite_duration += t.duration_ns;
            if (t.todo) {
                suite_todo += 1;
                todo_count += 1;
            } else if (t.passed) {
                suite_passed += 1;
                passed_count += 1;
            } else {
                suite_failed += 1;
                failed_count += 1;
                try failed_tests.append(allocator, t);
            }
        }

        // Print suite header with better visual hierarchy
        if (suite_failed > 0) {
            try stdout.print(" {s}{s} FAIL {s} {s}{s}{s} ", .{
                Color.bg_red,
                Color.white,
                Color.reset,
                Color.white,
                suite,
                Color.reset,
            });
        } else if (suite_todo > 0 and suite_passed == 0) {
            try stdout.print(" {s}{s} TODO {s} {s}{s}{s} ", .{
                Color.bg_yellow,
                Color.black,
                Color.reset,
                Color.yellow,
                suite,
                Color.reset,
            });
        } else {
            try stdout.print(" {s}{s}{s} {s}{s}{s} ", .{
                Color.green,
                Icons.check,
                Color.reset,
                Color.dim,
                suite,
                Color.reset,
            });
        }

        // Print test counts with better formatting
        if (suite_failed > 0) {
            try stdout.print("{s}{d} failed{s}", .{ Color.red, suite_failed, Color.reset });
            if (suite_passed > 0) {
                try stdout.print(" {s}|{s} {s}{d} passed{s}", .{
                    Color.dim,
                    Color.reset,
                    Color.green,
                    suite_passed,
                    Color.reset,
                });
            }
            if (suite_todo > 0) {
                try stdout.print(" {s}|{s} {s}{d} todo{s}", .{
                    Color.dim,
                    Color.reset,
                    Color.yellow,
                    suite_todo,
                    Color.reset,
                });
            }
        } else if (suite_todo > 0) {
            try stdout.print("{s}{d} todo{s}", .{ Color.yellow, suite_todo, Color.reset });
            if (suite_passed > 0) {
                try stdout.print(" {s}|{s} {s}{d} passed{s}", .{
                    Color.dim,
                    Color.reset,
                    Color.green,
                    suite_passed,
                    Color.reset,
                });
            }
        } else {
            try stdout.print("{s}({d}){s}", .{
                Color.green,
                suite_passed,
                Color.reset,
            });
        }

        try stdout.print(" ", .{});
        formatDuration(stdout, suite_duration);
        try stdout.print("\n", .{});

        // Print failed and todo test names under suite with better indentation
        for (tests.items) |t| {
            if (t.todo) {
                try stdout.print("   {s}{s}{s} {s}{s} (TODO){s}\n", .{
                    Color.yellow,
                    Icons.clock,
                    Color.reset,
                    Color.yellow,
                    t.test_name,
                    Color.reset,
                });
            } else if (!t.passed) {
                try stdout.print("   {s}{s}{s} {s}{s}{s}\n", .{
                    Color.red,
                    Icons.cross,
                    Color.reset,
                    Color.red,
                    t.test_name,
                    Color.reset,
                });
            }
        }
    }

    // Print detailed failure information with stack traces
    if (failed_tests.items.len > 0) {
        try stdout.print("\n{s}⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯{s}\n", .{
            Color.red,
            Color.reset,
        });
        try stdout.print(" {s}Failed Tests {d}{s}\n", .{
            Color.red,
            failed_tests.items.len,
            Color.reset,
        });
        try stdout.print("{s}⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯{s}\n\n", .{
            Color.red,
            Color.reset,
        });

        for (failed_tests.items, 0..) |fail, idx| {
            // Test name with better formatting
            try stdout.print(" {s}FAIL{s} {s}{s} {s}{s}{s}{s}\n", .{
                Color.bg_bright_red,
                Color.reset,
                Color.white,
                Icons.arrow,
                Color.reset,
                Color.bright_yellow,
                fail.name,
                Color.reset,
            });

            if (fail.error_msg) |msg| {
                // Error message with proper formatting
                try stdout.print("\n", .{});
                var lines = std.mem.tokenizeScalar(u8, msg, '\n');
                while (lines.next()) |line| {
                    try stderr.print("      {s}{s} {s}{s}{s}\n", .{
                        Color.red,
                        Icons.cross,
                        Color.reset,
                        line,
                        Color.reset,
                    });
                }
            }

            // Add separator between failures
            if (idx < failed_tests.items.len - 1) {
                try stdout.print("\n", .{});
            }
        }
        try stdout.print("\n", .{});
    }

    // Print summary with better visual design
    const end_time = std.time.nanoTimestamp();
    const total_duration = @as(u64, @intCast(end_time - start_time));

    try stdout.print("{s}⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯{s}\n", .{
        Color.dim,
        Color.reset,
    });

    // Test summary with icons
    if (failed_count > 0) {
        try stdout.print(" {s}Test Files  {s}", .{ Color.bold, Color.reset });
        try stdout.print("{s}1 failed{s} {s}({d}){s}\n", .{
            Color.red,
            Color.reset,
            Color.dim,
            total_tests,
            Color.reset,
        });

        try stdout.print("      {s}Tests  {s}", .{ Color.bold, Color.reset });
        try stdout.print("{s}{d} failed{s}", .{ Color.red, failed_count, Color.reset });
        if (passed_count > 0) {
            try stdout.print(" {s}|{s} {s}{d} passed{s}", .{
                Color.dim,
                Color.reset,
                Color.green,
                passed_count,
                Color.reset,
            });
        }
        if (todo_count > 0) {
            try stdout.print(" {s}|{s} {s}{d} todo{s}", .{
                Color.dim,
                Color.reset,
                Color.yellow,
                todo_count,
                Color.reset,
            });
        }
        try stdout.print(" {s}({d}){s}\n", .{
            Color.dim,
            total_tests,
            Color.reset,
        });
    } else {
        try stdout.print(" {s}Test Files  {s}", .{
            Color.bold,
            Color.reset,
        });
        if (todo_count > 0) {
            try stdout.print("{s}1 passed{s} {s}({d}){s}\n", .{
                Color.green,
                Color.reset,
                Color.dim,
                total_tests,
                Color.reset,
            });
        } else {
            try stdout.print("{s}1 passed{s} {s}({d}){s}\n", .{
                Color.green,
                Color.reset,
                Color.dim,
                total_tests,
                Color.reset,
            });
        }

        try stdout.print("      {s}Tests  {s}", .{
            Color.bold,
            Color.reset,
        });
        if (todo_count > 0) {
            try stdout.print("{s}{d} passed{s}", .{
                Color.green,
                passed_count,
                Color.reset,
            });
            try stdout.print(" {s}|{s} {s}{d} todo{s}", .{
                Color.dim,
                Color.reset,
                Color.yellow,
                todo_count,
                Color.reset,
            });
            try stdout.print(" {s}({d}){s}\n", .{
                Color.dim,
                total_tests,
                Color.reset,
            });
        } else {
            try stdout.print("{s}{d} passed{s} {s}({d}){s}\n", .{
                Color.green,
                passed_count,
                Color.reset,
                Color.dim,
                total_tests,
                Color.reset,
            });
        }
    }

    // Duration with icon
    try stdout.print("  {s}Start at  {s}", .{
        Color.bold,
        Color.reset,
    });
    const now_ms = std.time.milliTimestamp();
    const now_s = @divTrunc(now_ms, 1000);
    const hours: u32 = @intCast(@mod(@divTrunc(now_s, 3600) - 8, 24)); // PST
    const minutes: u32 = @intCast(@mod(@divTrunc(now_s, 60), 60));
    const seconds: u32 = @intCast(@mod(now_s, 60));
    try stdout.print("{s}{d:0>2}:{d:0>2}:{d:0>2}{s}\n", .{
        Color.gray,
        hours,
        minutes,
        seconds,
        Color.reset,
    });

    try stdout.print("   {s}Duration  {s}", .{
        Color.bold,
        Color.reset,
    });
    formatDuration(stdout, total_duration);
    try stdout.print("\n\n", .{});

    // Ensure all output is flushed
    try stdout.flush();
    try stderr.flush();

    if (failed_count > 0) {
        return error.TestsFailed;
    }
}
