const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Import god-tui as a dependency
    const god_tui_dep = b.dependency("god_tui", .{
        .target = target,
        .optimize = optimize,
    });

    // Install the god-agent executable to zig-out/bin/
    const exe = god_tui_dep.artifact("god-agent");
    b.installArtifact(exe);

    // Run step - inherit stdio for TTY support
    // NOTE: Interactive mode requires running the binary directly:
    //   zig build && ./zig-out/bin/god-agent
    // The `zig build run` command doesn't properly allocate a TTY.
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    run_cmd.stdio = .inherit;
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run god-agent (use ./zig-out/bin/god-agent for interactive mode)");
    run_step.dependOn(&run_cmd.step);
}
