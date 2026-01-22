const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // External dependencies
    const clap_dep = b.dependency("clap", .{
        .target = target,
        .optimize = optimize,
    });
    const clap_mod = clap_dep.module("clap");

    const ai_dep = b.dependency("zig_ai_sdk", .{
        .target = target,
        .optimize = optimize,
    });
    const ai_mod = ai_dep.module("zig_ai_sdk");

    // God-TUI library module
    const god_tui_mod = b.createModule(.{
        .root_source_file = b.path("lib.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Main library artifact
    const lib = b.addLibrary(.{
        .name = "god-tui",
        .root_module = god_tui_mod,
    });
    b.installArtifact(lib);

    // god-agent executable
    const exe = b.addExecutable(.{
        .name = "god-agent",
        .root_module = b.createModule(.{
            .root_source_file = b.path("main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "clap", .module = clap_mod },
                .{ .name = "ai", .module = ai_mod },
                .{ .name = "god_tui", .module = god_tui_mod },
            },
        }),
    });
    b.installArtifact(exe);

    // Run step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    const run_step = b.step("run", "Run god-agent");
    run_step.dependOn(&run_cmd.step);

    // Unit tests for library
    const lib_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("lib.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    const run_lib_tests = b.addRunArtifact(lib_tests);
    const lib_test_step = b.step("test-lib", "Run library unit tests");
    lib_test_step.dependOn(&run_lib_tests.step);

    // Main executable tests
    const exe_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "clap", .module = clap_mod },
                .{ .name = "ai", .module = ai_mod },
                .{ .name = "god_tui", .module = god_tui_mod },
            },
        }),
    });
    const run_exe_tests = b.addRunArtifact(exe_tests);
    const exe_test_step = b.step("test-exe", "Run executable tests");
    exe_test_step.dependOn(&run_exe_tests.step);

    // All tests
    const test_step = b.step("test", "Run all tests");
    test_step.dependOn(&run_lib_tests.step);
    test_step.dependOn(&run_exe_tests.step);

    // Terminal module tests
    const terminal_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("terminal/test.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    const run_terminal_tests = b.addRunArtifact(terminal_tests);
    const terminal_test_step = b.step("test-terminal", "Run terminal module tests");
    terminal_test_step.dependOn(&run_terminal_tests.step);
}
