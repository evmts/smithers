const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Import smithers-tui as a dependency (Zig 0.15.x compatible)
    const smithers_tui_dep = b.dependency("smithers_tui", .{
        .target = target,
        .optimize = optimize,
    });

    // Install the smithers-tui executable to zig-out/bin/
    const smithers_tui = smithers_tui_dep.artifact("smithers-tui");
    b.installArtifact(smithers_tui);

    // Run step for smithers-tui (default)
    const run_cmd = b.addRunArtifact(smithers_tui);
    run_cmd.step.dependOn(b.getInstallStep());
    run_cmd.stdio = .inherit;
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run smithers-tui (use ./zig-out/bin/smithers-tui for interactive mode)");
    run_step.dependOn(&run_cmd.step);

    // Test step
    const smithers_tui_tests = b.addTest(.{
        .root_module = smithers_tui.root_module,
    });
    const test_step = b.step("test", "Run smithers-tui tests");
    test_step.dependOn(&b.addRunArtifact(smithers_tui_tests).step);

    // Debug step - runs with SMITHERS_DEBUG_LEVEL=trace
    const debug_cmd = b.addRunArtifact(smithers_tui);
    debug_cmd.setEnvironmentVariable("SMITHERS_DEBUG_LEVEL", "trace");
    debug_cmd.step.dependOn(b.getInstallStep());
    debug_cmd.stdio = .inherit;
    if (b.args) |args| {
        debug_cmd.addArgs(args);
    }
    const debug_step = b.step("debug", "Run TUI with trace logging (logs to /tmp/smithers-debug.log)");
    debug_step.dependOn(&debug_cmd.step);

    // NOTE: god-tui (src/god-tui) requires Zig 0.16+
    // It's excluded from this build since we're on Zig 0.15.x
}
