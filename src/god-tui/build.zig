const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Main library module
    const lib_mod = b.createModule(.{
        .root_source_file = b.path("lib.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Terminal module
    const terminal_mod = b.createModule(.{
        .root_source_file = b.path("terminal/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Rendering module
    const rendering_mod = b.createModule(.{
        .root_source_file = b.path("rendering/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Unit tests for lib
    const lib_unit_tests = b.addTest(.{
        .root_module = lib_mod,
    });
    const run_lib_unit_tests = b.addRunArtifact(lib_unit_tests);

    // Terminal module tests
    const terminal_tests = b.addTest(.{
        .root_module = terminal_mod,
    });
    const run_terminal_tests = b.addRunArtifact(terminal_tests);

    // Rendering module tests
    const rendering_tests = b.addTest(.{
        .root_module = rendering_mod,
    });
    const run_rendering_tests = b.addRunArtifact(rendering_tests);

    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_lib_unit_tests.step);
    test_step.dependOn(&run_terminal_tests.step);
    test_step.dependOn(&run_rendering_tests.step);
}
