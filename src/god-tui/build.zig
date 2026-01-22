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
    // ai-zig exports multiple modules: "ai", "anthropic", "openai", etc.
    const ai_mod = ai_dep.module("ai");
    const anthropic_mod = ai_dep.module("anthropic");
    const provider_mod = ai_dep.module("provider");

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
                .{ .name = "anthropic", .module = anthropic_mod },
                .{ .name = "provider", .module = provider_mod },
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
                .{ .name = "anthropic", .module = anthropic_mod },
                .{ .name = "provider", .module = provider_mod },
                .{ .name = "god_tui", .module = god_tui_mod },
            },
        }),
    });
    const run_exe_tests = b.addRunArtifact(exe_tests);
    const exe_test_step = b.step("test-exe", "Run executable tests");
    exe_test_step.dependOn(&run_exe_tests.step);

    // Config tests
    const config_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("config.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    const run_config_tests = b.addRunArtifact(config_tests);
    const config_test_step = b.step("test-config", "Run config tests");
    config_test_step.dependOn(&run_config_tests.step);

    // All tests
    const test_step = b.step("test", "Run all tests");
    test_step.dependOn(&run_lib_tests.step);
    test_step.dependOn(&run_exe_tests.step);
    test_step.dependOn(&run_config_tests.step);

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

    // Agent module tests
    const agent_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("agent/agent.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    const run_agent_tests = b.addRunArtifact(agent_tests);
    const agent_test_step = b.step("test-agent", "Run agent module tests");
    agent_test_step.dependOn(&run_agent_tests.step);
    test_step.dependOn(&run_agent_tests.step);

    // UI module
    const ui_mod = b.createModule(.{
        .root_source_file = b.path("ui/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    // UI module tests
    const ui_tests = b.addTest(.{
        .root_module = ui_mod,
    });
    const run_ui_tests = b.addRunArtifact(ui_tests);
    const ui_test_step = b.step("test-ui", "Run UI module tests");
    ui_test_step.dependOn(&run_ui_tests.step);
    test_step.dependOn(&run_ui_tests.step);

    // Agent module for modes
    const agent_mod = b.createModule(.{
        .root_source_file = b.path("agent/agent.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Modes module tests
    const modes_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("modes/test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "agent", .module = agent_mod },
            },
        }),
    });
    const run_modes_tests = b.addRunArtifact(modes_tests);
    const modes_test_step = b.step("test-modes", "Run modes module tests");
    modes_test_step.dependOn(&run_modes_tests.step);
    test_step.dependOn(&run_modes_tests.step);
}
