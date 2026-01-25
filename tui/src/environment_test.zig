const std = @import("std");
const environment = @import("environment.zig");

const Environment = environment.Environment;
const PosixEnv = environment.PosixEnv;

test "Environment basics" {
    const ProdEnv = Environment(PosixEnv);
    const home = ProdEnv.home();
    _ = home;
}
