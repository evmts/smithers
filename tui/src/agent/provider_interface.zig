/// Agent provider interface for dependency injection via comptime generics
/// 
/// Usage:
/// ```zig
/// const MyLoop = AgentLoop(AnthropicProvider);
/// ```
///
/// Multi-provider support:
/// - Parse SMITHERS_MODEL env var (format: `provider/model-id`)
/// - Default: `anthropic/claude-sonnet-4-20250514`
/// - Supported providers: anthropic, openai, google

const std = @import("std");

pub const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};

/// Supported LLM providers
pub const ProviderType = enum {
    anthropic,
    openai,
    google,

    pub fn fromString(s: []const u8) ?ProviderType {
        if (std.mem.eql(u8, s, "anthropic")) return .anthropic;
        if (std.mem.eql(u8, s, "openai")) return .openai;
        if (std.mem.eql(u8, s, "google")) return .google;
        if (std.mem.eql(u8, s, "gemini")) return .google;
        return null;
    }

    pub fn toString(self: ProviderType) []const u8 {
        return switch (self) {
            .anthropic => "anthropic",
            .openai => "openai",
            .google => "google",
        };
    }
};

/// Model configuration parsed from SMITHERS_MODEL env var
pub const ModelConfig = struct {
    provider: ProviderType,
    model_id: []const u8,
    context_window: u32,
    max_tokens: u32,

    pub const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
    pub const DEFAULT_OPENAI_MODEL = "gpt-4o";
    pub const DEFAULT_GOOGLE_MODEL = "gemini-2.0-flash";

    /// Parse model config from SMITHERS_MODEL env var
    /// Format: `provider/model-id` (e.g., `openai/gpt-4o`)
    /// Default: `anthropic/claude-sonnet-4-20250514`
    pub fn fromEnv() ModelConfig {
        const model_env = std.posix.getenv("SMITHERS_MODEL") orelse "anthropic/claude-sonnet-4-20250514";
        return parse(model_env);
    }

    pub fn parse(model_str: []const u8) ModelConfig {
        if (std.mem.indexOf(u8, model_str, "/")) |sep_idx| {
            const provider_str = model_str[0..sep_idx];
            const model_id = model_str[sep_idx + 1 ..];
            if (ProviderType.fromString(provider_str)) |provider| {
                return .{
                    .provider = provider,
                    .model_id = model_id,
                    .context_window = getContextWindow(provider, model_id),
                    .max_tokens = getMaxTokens(provider, model_id),
                };
            }
        }
        // Default to anthropic
        return .{
            .provider = .anthropic,
            .model_id = DEFAULT_ANTHROPIC_MODEL,
            .context_window = 200000,
            .max_tokens = 8192,
        };
    }

    fn getContextWindow(provider: ProviderType, model_id: []const u8) u32 {
        _ = model_id;
        return switch (provider) {
            .anthropic => 200000,
            .openai => 128000,
            .google => 1000000,
        };
    }

    fn getMaxTokens(provider: ProviderType, model_id: []const u8) u32 {
        _ = model_id;
        return switch (provider) {
            .anthropic => 8192,
            .openai => 16384,
            .google => 8192,
        };
    }
};

/// Get API key for a provider from environment variables
pub fn getApiKey(provider: ProviderType) ?[]const u8 {
    return switch (provider) {
        .anthropic => std.posix.getenv("ANTHROPIC_API_KEY"),
        .openai => std.posix.getenv("OPENAI_API_KEY"),
        .google => std.posix.getenv("GEMINI_API_KEY") orelse std.posix.getenv("GOOGLE_API_KEY"),
    };
}

/// Comptime-generic agent provider wrapper
/// Impl must provide:
/// - StreamingState type
/// - fn startStream(allocator, api_key, request_body) !StreamingState
/// - fn poll(state: *StreamingState) !bool (returns true when done)
/// - fn getText(state: *StreamingState) []const u8
/// - fn hasToolCalls(state: *StreamingState) bool  
/// - fn getToolCalls(state: *StreamingState) []const ToolCallInfo
/// - fn cleanup(state: *StreamingState) void
pub fn AgentProvider(comptime Impl: type) type {
    return struct {
        pub const StreamingState = Impl.StreamingState;

        pub fn startStream(alloc: std.mem.Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
            return Impl.startStream(alloc, api_key, request_body);
        }

        pub fn poll(state: *StreamingState) !bool {
            return Impl.poll(state);
        }

        pub fn getText(state: *StreamingState) []const u8 {
            return Impl.getText(state);
        }

        pub fn hasToolCalls(state: *StreamingState) bool {
            return Impl.hasToolCalls(state);
        }

        pub fn getToolCalls(state: *StreamingState) []const ToolCallInfo {
            return Impl.getToolCalls(state);
        }

        pub fn cleanup(state: *StreamingState, alloc: std.mem.Allocator) void {
            Impl.cleanup(state, alloc);
        }
    };
}

/// Validates that a type implements the AgentProvider interface
pub fn validateProviderInterface(comptime Impl: type) void {
    comptime {
        if (!@hasDecl(Impl, "StreamingState")) {
            @compileError("Provider must have StreamingState type");
        }
        if (!@hasDecl(Impl, "startStream")) {
            @compileError("Provider must have startStream function");
        }
        if (!@hasDecl(Impl, "poll")) {
            @compileError("Provider must have poll function");
        }
        if (!@hasDecl(Impl, "getText")) {
            @compileError("Provider must have getText function");
        }
        if (!@hasDecl(Impl, "hasToolCalls")) {
            @compileError("Provider must have hasToolCalls function");
        }
        if (!@hasDecl(Impl, "getToolCalls")) {
            @compileError("Provider must have getToolCalls function");
        }
        if (!@hasDecl(Impl, "cleanup")) {
            @compileError("Provider must have cleanup function");
        }
    }
}
