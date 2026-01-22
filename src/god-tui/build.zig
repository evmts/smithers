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

    // Terminal module tests
    const terminal_mod = b.createModule(.{
        .root_source_file = b.path("terminal/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Rendering module tests
    const rendering_mod = b.createModule(.{
        .root_source_file = b.path("rendering/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Components module tests
    const components_mod = b.createModule(.{
        .root_source_file = b.path("components/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Editor module tests
    const editor_mod = b.createModule(.{
        .root_source_file = b.path("editor/editor.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Overlay module tests
    const overlay_mod = b.createModule(.{
        .root_source_file = b.path("overlay/overlay.zig"),
        .target = target,
        .optimize = optimize,
    });

    // AI provider module tests
    const ai_mod = b.createModule(.{
        .root_source_file = b.path("ai/provider.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Extensions module tests
    const extensions_mod = b.createModule(.{
        .root_source_file = b.path("extensions/extension.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Session module tests
    const session_mod = b.createModule(.{
        .root_source_file = b.path("session/session.zig"),
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

    // Components module tests
    const components_tests = b.addTest(.{
        .root_module = components_mod,
    });
    const run_components_tests = b.addRunArtifact(components_tests);

    // Editor module tests
    const editor_tests = b.addTest(.{
        .root_module = editor_mod,
    });
    const run_editor_tests = b.addRunArtifact(editor_tests);

    // Overlay module tests
    const overlay_tests = b.addTest(.{
        .root_module = overlay_mod,
    });
    const run_overlay_tests = b.addRunArtifact(overlay_tests);

    // AI module tests
    const ai_tests = b.addTest(.{
        .root_module = ai_mod,
    });
    const run_ai_tests = b.addRunArtifact(ai_tests);

    // Extensions module tests
    const extensions_tests = b.addTest(.{
        .root_module = extensions_mod,
    });
    const run_extensions_tests = b.addRunArtifact(extensions_tests);

    // Session module tests
    const session_tests = b.addTest(.{
        .root_module = session_mod,
    });
    const run_session_tests = b.addRunArtifact(session_tests);

    // Test step runs all tests
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_lib_unit_tests.step);
    test_step.dependOn(&run_terminal_tests.step);
    test_step.dependOn(&run_rendering_tests.step);
    test_step.dependOn(&run_components_tests.step);
    test_step.dependOn(&run_editor_tests.step);
    test_step.dependOn(&run_overlay_tests.step);
    test_step.dependOn(&run_ai_tests.step);
    test_step.dependOn(&run_extensions_tests.step);
    test_step.dependOn(&run_session_tests.step);
}
