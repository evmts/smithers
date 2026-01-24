const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // libvaxis dependency
    const vaxis_dep = b.dependency("vaxis", .{
        .target = target,
        .optimize = optimize,
    });

    // sqlite dependency - exposes "sqlite" module which includes C lib
    const sqlite_dep = b.dependency("sqlite", .{
        .target = target,
        .optimize = optimize,
    });

    // Main executable
    const exe = b.addExecutable(.{
        .name = "smithers-tui",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "vaxis", .module = vaxis_dep.module("vaxis") },
                .{ .name = "sqlite", .module = sqlite_dep.module("sqlite") },
            },
        }),
    });

    // Link the sqlite static library from the dependency
    exe.root_module.linkLibrary(sqlite_dep.artifact("sqlite"));
    exe.root_module.linkSystemLibrary("c", .{});

    b.installArtifact(exe);

    // Run step
    const run_step = b.step("run", "Run the Smithers TUI");
    const run_cmd = b.addRunArtifact(exe);
    run_step.dependOn(&run_cmd.step);
    run_cmd.step.dependOn(b.getInstallStep());
    run_cmd.stdio = .inherit;

    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    // Test step
    const exe_tests = b.addTest(.{
        .root_module = exe.root_module,
    });
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&b.addRunArtifact(exe_tests).step);

    // Debug step - runs with SMITHERS_DEBUG_LEVEL=trace
    const debug_step = b.step("debug", "Run TUI with trace logging (logs to /tmp/smithers-debug.log)");
    const debug_cmd = b.addRunArtifact(exe);
    debug_cmd.setEnvironmentVariable("SMITHERS_DEBUG_LEVEL", "trace");
    debug_step.dependOn(&debug_cmd.step);
    debug_cmd.step.dependOn(b.getInstallStep());
    debug_cmd.stdio = .inherit;

    if (b.args) |args| {
        debug_cmd.addArgs(args);
    }
}
