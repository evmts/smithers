const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const fields = b.option(
        []const []const u8,
        "fields",
        "Fields to build into table for `get` (alias for `fields_0`)",
    );

    const fields_0 = b.option(
        []const []const u8,
        "fields_0",
        "Fields to build into table 0 for `get`",
    );

    const fields_1 = b.option(
        []const []const u8,
        "fields_1",
        "Fields to build into table 1 for `get`",
    );

    const fields_2 = b.option(
        []const []const u8,
        "fields_2",
        "Fields to build into table 2 for `get`",
    );

    const fields_3 = b.option(
        []const []const u8,
        "fields_3",
        "Fields to build into table 3 for `get`",
    );

    const fields_4 = b.option(
        []const []const u8,
        "fields_4",
        "Fields to build into table 4 for `get`",
    );

    const fields_5 = b.option(
        []const []const u8,
        "fields_5",
        "Fields to build into table 5 for `get`",
    );

    const fields_6 = b.option(
        []const []const u8,
        "fields_6",
        "Fields to build into table 6 for `get`",
    );

    const fields_7 = b.option(
        []const []const u8,
        "fields_7",
        "Fields to build into table 7 for `get`",
    );

    const fields_8 = b.option(
        []const []const u8,
        "fields_8",
        "Fields to build into table 8 for `get`",
    );

    const fields_9 = b.option(
        []const []const u8,
        "fields_9",
        "Fields to build into table 9 for `get`",
    );

    const build_log_level = b.option(
        std.log.Level,
        "build_log_level",
        "Log level to use when building tables",
    );

    const build_config_zig_opt = b.option(
        []const u8,
        "build_config.zig",
        "Build config source code",
    );

    const build_config_path_opt = b.option(
        std.Build.LazyPath,
        "build_config_path",
        "Path to uucode_build_config.zig file",
    );

    const tables_path_opt = b.option(
        std.Build.LazyPath,
        "tables_path",
        "Path to built tables source file",
    );

    const build_config_path = build_config_path_opt orelse blk: {
        const build_config_zig = build_config_zig_opt orelse buildBuildConfig(
            b.allocator,
            fields orelse fields_0,
            fields_1,
            fields_2,
            fields_3,
            fields_4,
            fields_5,
            fields_6,
            fields_7,
            fields_8,
            fields_9,
            build_log_level,
        );

        break :blk b.addWriteFiles().add("build_config2.zig", build_config_zig);
    };

    const mod = createLibMod(b, target, optimize, tables_path_opt, build_config_path);

    // b.addModule with an existing module
    _ = b.modules.put(b.dupe("uucode"), mod.lib) catch @panic("OOM");
    b.addNamedLazyPath("tables.zig", mod.tables_path);

    const test_mod = createLibMod(b, target, optimize, null, b.path("src/build/test_build_config.zig"));

    const src_tests = b.addTest(.{
        .root_module = test_mod.lib,
    });

    const build_tables_tests = b.addTest(.{
        .root_module = test_mod.build_tables.?,
    });

    const build_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("build.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    const run_src_tests = b.addRunArtifact(src_tests);
    const run_build_tables_tests = b.addRunArtifact(build_tables_tests);
    const run_build_tests = b.addRunArtifact(build_tests);

    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_src_tests.step);
    test_step.dependOn(&run_build_tables_tests.step);
    test_step.dependOn(&run_build_tests.step);
}

fn buildBuildConfig(
    allocator: std.mem.Allocator,
    fields_0: ?[]const []const u8,
    fields_1: ?[]const []const u8,
    fields_2: ?[]const []const u8,
    fields_3: ?[]const []const u8,
    fields_4: ?[]const []const u8,
    fields_5: ?[]const []const u8,
    fields_6: ?[]const []const u8,
    fields_7: ?[]const []const u8,
    fields_8: ?[]const []const u8,
    fields_9: ?[]const []const u8,
    build_log_level: ?std.log.Level,
) []const u8 {
    var bytes = std.Io.Writer.Allocating.init(allocator);
    defer bytes.deinit();
    const writer = &bytes.writer;

    if (fields_0 == null) {
        return bytes.toOwnedSlice() catch @panic("OOM");
    }

    writer.writeAll(
        \\const config = @import("config.zig");
        \\const d = config.default;
        \\
        \\
    ) catch @panic("OOM");

    if (build_log_level) |level| {
        writer.print(
            \\pub const log_level = .{s};
            \\
            \\
        , .{@tagName(level)}) catch @panic("OOM");
    }

    writer.writeAll(
        \\pub const tables = [_]config.Table{
        \\    .{
        \\        .fields = &.{
        \\
    ) catch @panic("OOM");

    for (fields_0.?) |f| {
        writer.print("            d.field(\"{s}\"),\n", .{f}) catch @panic("OOM");
    }

    const fields_lists = [_]?[]const []const u8{
        fields_1,
        fields_2,
        fields_3,
        fields_4,
        fields_5,
        fields_6,
        fields_7,
        fields_8,
        fields_9,
    };

    for (fields_lists) |fields_opt| {
        if (fields_opt) |fields| {
            writer.writeAll(
                \\         },
                \\     },
                \\    .{
                \\        .fields = &.{
                \\
            ) catch @panic("OOM");

            for (fields) |f| {
                writer.print("            d.field(\"{s}\"),\n", .{f}) catch @panic("OOM");
            }
        } else {
            break;
        }
    }

    writer.writeAll(
        \\         },
        \\     },
        \\};
        \\
    ) catch @panic("OOM");

    return bytes.toOwnedSlice() catch @panic("OOM");
}

fn buildTables(
    b: *std.Build,
    build_config_path: std.Build.LazyPath,
) struct {
    build_tables: *std.Build.Module,
    tables: std.Build.LazyPath,
} {
    const target = b.graph.host;

    const config_mod = b.createModule(.{
        .root_source_file = b.path("src/config.zig"),
        .target = target,
    });

    const types_mod = b.createModule(.{
        .root_source_file = b.path("src/types.zig"),
        .target = target,
    });
    types_mod.addImport("config.zig", config_mod);
    config_mod.addImport("types.zig", types_mod);

    const config_x_mod = b.createModule(.{
        .root_source_file = b.path("src/x/config.x.zig"),
        .target = target,
    });

    const types_x_mod = b.createModule(.{
        .root_source_file = b.path("src/x/types.x.zig"),
        .target = target,
    });
    types_x_mod.addImport("config.x.zig", config_x_mod);
    config_x_mod.addImport("types.x.zig", types_x_mod);
    config_x_mod.addImport("types.zig", types_mod);
    config_x_mod.addImport("config.zig", config_mod);

    // Create build_config
    const build_config_mod = b.createModule(.{
        .root_source_file = build_config_path,
        .target = target,
    });
    build_config_mod.addImport("types.zig", types_mod);
    build_config_mod.addImport("config.zig", config_mod);
    build_config_mod.addImport("types.x.zig", types_x_mod);
    build_config_mod.addImport("config.x.zig", config_x_mod);

    // Generate tables.zig with build_config
    const build_tables_mod = b.createModule(.{
        .root_source_file = b.path("src/build/tables.zig"),
        .target = b.graph.host,
    });
    const build_tables_exe = b.addExecutable(.{
        .name = "uucode_build_tables",
        .root_module = build_tables_mod,

        // Zig's x86 backend is segfaulting, so we choose the LLVM backend always.
        .use_llvm = true,
    });
    build_tables_mod.addImport("config.zig", config_mod);
    build_tables_mod.addImport("build_config", build_config_mod);
    build_tables_mod.addImport("types.zig", types_mod);
    const run_build_tables_exe = b.addRunArtifact(build_tables_exe);
    run_build_tables_exe.setCwd(b.path(""));
    const tables_path = run_build_tables_exe.addOutputFileArg("tables.zig");

    return .{
        .tables = tables_path,
        .build_tables = build_tables_mod,
    };
}

fn createLibMod(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    tables_path_opt: ?std.Build.LazyPath,
    build_config_path: std.Build.LazyPath,
) struct {
    lib: *std.Build.Module,
    build_tables: ?*std.Build.Module,
    tables_path: std.Build.LazyPath,
} {
    const config_mod = b.createModule(.{
        .root_source_file = b.path("src/config.zig"),
        .target = target,
        .optimize = optimize,
    });

    const types_mod = b.createModule(.{
        .root_source_file = b.path("src/types.zig"),
        .target = target,
        .optimize = optimize,
    });
    types_mod.addImport("config.zig", config_mod);
    config_mod.addImport("types.zig", types_mod);

    const config_x_mod = b.createModule(.{
        .root_source_file = b.path("src/x/config.x.zig"),
        .target = target,
        .optimize = optimize,
    });

    const types_x_mod = b.createModule(.{
        .root_source_file = b.path("src/x/types.x.zig"),
        .target = target,
        .optimize = optimize,
    });
    types_x_mod.addImport("config.x.zig", config_x_mod);
    config_x_mod.addImport("types.x.zig", types_x_mod);
    config_x_mod.addImport("types.zig", types_mod);
    config_x_mod.addImport("config.zig", config_mod);

    // TODO: expose this to see if importing can work?
    const build_config_mod = b.createModule(.{
        .root_source_file = build_config_path,
        .target = target,
    });
    build_config_mod.addImport("types.zig", types_mod);
    build_config_mod.addImport("config.zig", config_mod);
    build_config_mod.addImport("types.x.zig", types_x_mod);
    build_config_mod.addImport("config.x.zig", config_x_mod);

    var build_tables: ?*std.Build.Module = null;
    const tables_path = tables_path_opt orelse blk: {
        const t = buildTables(b, build_config_path);
        build_tables = t.build_tables;
        break :blk t.tables;
    };

    const tables_mod = b.createModule(.{
        .root_source_file = tables_path,
        .target = target,
        .optimize = optimize,
    });
    tables_mod.addImport("types.zig", types_mod);
    tables_mod.addImport("types.x.zig", types_x_mod);
    tables_mod.addImport("config.zig", config_mod);
    tables_mod.addImport("build_config", build_config_mod);

    const get_mod = b.createModule(.{
        .root_source_file = b.path("src/get.zig"),
        .target = target,
        .optimize = optimize,
    });
    get_mod.addImport("types.zig", types_mod);
    get_mod.addImport("tables", tables_mod);
    types_mod.addImport("get.zig", get_mod);

    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    lib_mod.addImport("types.zig", types_mod);
    lib_mod.addImport("config.zig", config_mod);
    lib_mod.addImport("types.x.zig", types_x_mod);
    lib_mod.addImport("tables", tables_mod);
    lib_mod.addImport("get.zig", get_mod);

    return .{
        .lib = lib_mod,
        .build_tables = build_tables,
        .tables_path = tables_path,
    };
}

test "simple build config with just fields/fields_0" {
    const build_config = buildBuildConfig(
        std.testing.allocator,
        &.{ "name", "is_emoji", "bidi_class" },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        .debug,
    );
    defer std.testing.allocator.free(build_config);

    errdefer std.debug.print("build_config: {s}", .{build_config});

    try std.testing.expect(std.mem.eql(u8,
        \\const config = @import("config.zig");
        \\const d = config.default;
        \\
        \\pub const log_level = .debug;
        \\
        \\pub const tables = [_]config.Table{
        \\    .{
        \\        .fields = &.{
        \\            d.field("name"),
        \\            d.field("is_emoji"),
        \\            d.field("bidi_class"),
        \\         },
        \\     },
        \\};
        \\
    , build_config));
}

test "complex build config with all fields_0 through fields_9" {
    const build_config = buildBuildConfig(
        std.testing.allocator,
        &.{ "name", "is_emoji" },
        &.{ "general_category", "bidi_class" },
        &.{ "decomposition_type", "decomposition_mapping" },
        &.{ "numeric_type", "numeric_value_numeric" },
        &.{ "unicode_1_name", "simple_uppercase_mapping" },
        &.{ "simple_lowercase_mapping", "simple_titlecase_mapping" },
        &.{ "case_folding_simple", "case_folding_full" },
        &.{ "special_lowercase_mapping", "special_titlecase_mapping" },
        &.{ "lowercase_mapping", "titlecase_mapping" },
        &.{ "uppercase_mapping", "is_emoji_presentation", "is_emoji_modifier" },
        .info,
    );
    defer std.testing.allocator.free(build_config);

    errdefer std.debug.print("build_config: {s}", .{build_config});

    const substrings = [_][]const u8{
        "pub const log_level = .info;",
        "Table{",
        "fields",
        "name",
        "is_emoji",
        "fields",
        "general_category",
        "bidi_class",
        "fields",
        "decomposition_type",
        "decomposition_mapping",
        "fields",
        "numeric_type",
        "numeric_value_numeric",
        "fields",
        "unicode_1_name",
        "simple_uppercase_mapping",
        "fields",
        "simple_lowercase_mapping",
        "simple_titlecase_mapping",
        "fields",
        "case_folding_simple",
        "case_folding_full",
        "fields",
        "special_lowercase_mapping",
        "special_titlecase_mapping",
        "fields",
        "lowercase_mapping",
        "titlecase_mapping",
        "fields",
        "uppercase_mapping",
        "is_emoji_presentation",
        "is_emoji_modifier",
        "};",
    };

    var i: usize = 0;

    for (substrings) |substring| {
        const foundI = std.mem.indexOfPos(u8, build_config, i, substring);
        try std.testing.expect(foundI != null);
        try std.testing.expect(foundI.? > i);
        i = foundI.?;
    }
}
