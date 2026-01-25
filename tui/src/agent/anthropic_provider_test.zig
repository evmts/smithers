const std = @import("std");
const anthropic_provider = @import("anthropic_provider.zig");
const AnthropicStreamingProvider = anthropic_provider.AnthropicStreamingProvider;
const provider_interface = @import("provider_interface.zig");

test "AnthropicStreamingProvider interface validation" {
    provider_interface.validateProviderInterface(AnthropicStreamingProvider);
}
