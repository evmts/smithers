const std = @import("std");
const anthropic = @import("../agent/anthropic_provider.zig");

// The anthropic_provider module is primarily for network I/O.
// We test the types and structures that can be tested without network access.

test "anthropic_provider module imports" {
    // Verify module compiles
    _ = anthropic;
}

test "anthropic_provider exports expected types" {
    // Check that expected types/functions exist
    const has_streaming = @hasDecl(anthropic, "StreamingState") or
        @hasDecl(anthropic, "AnthropicStreamingState") or
        @hasDecl(anthropic, "startStream");

    // Module should have some streaming functionality
    try std.testing.expect(has_streaming);
}
