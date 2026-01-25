// Multi-Provider - runtime provider selection based on SMITHERS_MODEL env var
// Wraps anthropic, openai, and gemini providers with a unified interface

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;

const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;
const ProviderType = provider_interface.ProviderType;
const ModelConfig = provider_interface.ModelConfig;
const getApiKey = provider_interface.getApiKey;

const anthropic = @import("anthropic_provider.zig");
const openai = @import("openai_provider.zig");
const gemini = @import("gemini_provider.zig");

/// Unified streaming state that wraps provider-specific states
pub const StreamingState = struct {
    provider: ProviderType,
    anthropic_state: ?anthropic.AnthropicProvider.StreamingState = null,
    openai_state: ?openai.StreamingState = null,
    gemini_state: ?gemini.StreamingState = null,
    message_id: ?i64 = null,
    alloc: Allocator,

    pub fn getText(self: *StreamingState) []const u8 {
        return switch (self.provider) {
            .anthropic => if (self.anthropic_state) |*s| anthropic.AnthropicProvider.getText(s) else "",
            .openai => if (self.openai_state) |*s| openai.getText(s) else "",
            .google => if (self.gemini_state) |*s| gemini.getText(s) else "",
        };
    }

    pub fn hasToolCalls(self: *StreamingState) bool {
        return switch (self.provider) {
            .anthropic => if (self.anthropic_state) |*s| anthropic.AnthropicProvider.hasToolCalls(s) else false,
            .openai => if (self.openai_state) |*s| openai.hasToolCalls(s) else false,
            .google => if (self.gemini_state) |*s| gemini.hasToolCalls(s) else false,
        };
    }

    pub fn getToolCalls(self: *StreamingState) []const ToolCallInfo {
        return switch (self.provider) {
            .anthropic => if (self.anthropic_state) |*s| anthropic.AnthropicProvider.getToolCalls(s) else &[_]ToolCallInfo{},
            .openai => if (self.openai_state) |*s| openai.getToolCalls(s) else &[_]ToolCallInfo{},
            .google => if (self.gemini_state) |*s| gemini.getToolCalls(s) else &[_]ToolCallInfo{},
        };
    }
};

/// Multi-provider that implements the AgentProvider interface
pub const MultiProvider = struct {
    config: ModelConfig,

    pub const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

    pub fn init() MultiProvider {
        return .{ .config = ModelConfig.fromEnv() };
    }

    pub fn initWithConfig(config: ModelConfig) MultiProvider {
        return .{ .config = config };
    }

    pub fn getProviderType(self: MultiProvider) ProviderType {
        return self.config.provider;
    }

    pub fn getModelId(self: MultiProvider) []const u8 {
        return self.config.model_id;
    }

    pub fn startStream(self: MultiProvider, alloc: Allocator, messages_json: []const u8, tools_json: []const u8) !StreamingState {
        const api_key = getApiKey(self.config.provider) orelse return error.MissingApiKey;

        var state = StreamingState{
            .provider = self.config.provider,
            .alloc = alloc,
        };

        switch (self.config.provider) {
            .anthropic => {
                const request_body = try buildAnthropicRequest(alloc, self.config.model_id, messages_json, tools_json);
                defer alloc.free(request_body);
                state.anthropic_state = try anthropic.AnthropicProvider.startStream(alloc, api_key, request_body);
            },
            .openai => {
                const request_body = try openai.buildRequestBody(alloc, self.config.model_id, messages_json, tools_json);
                defer alloc.free(request_body);
                state.openai_state = try openai.startStream(alloc, api_key, request_body);
            },
            .google => {
                const request_body = try gemini.buildRequestBody(alloc, self.config.model_id, messages_json, tools_json);
                defer alloc.free(request_body);
                state.gemini_state = try gemini.startStream(alloc, api_key, request_body);
            },
        }

        return state;
    }

    fn buildAnthropicRequest(alloc: Allocator, model_id: []const u8, messages_json: []const u8, tools_json: []const u8) ![]const u8 {
        return std.fmt.allocPrint(alloc,
            \\{{"model":"{s}","max_tokens":4096,"stream":true,"messages":{s},"tools":{s}}}
        , .{ model_id, messages_json, tools_json });
    }
};

pub fn poll(state: *StreamingState) !bool {
    return switch (state.provider) {
        .anthropic => if (state.anthropic_state) |*s| try anthropic.AnthropicProvider.poll(s) else true,
        .openai => if (state.openai_state) |*s| try openai.poll(s) else true,
        .google => if (state.gemini_state) |*s| try gemini.poll(s) else true,
    };
}

pub fn getText(state: *StreamingState) []const u8 {
    return state.getText();
}

pub fn hasToolCalls(state: *StreamingState) bool {
    return state.hasToolCalls();
}

pub fn getToolCalls(state: *StreamingState) []const ToolCallInfo {
    return state.getToolCalls();
}

pub fn cleanup(state: *StreamingState, alloc: Allocator) void {
    switch (state.provider) {
        .anthropic => if (state.anthropic_state) |*s| anthropic.AnthropicProvider.cleanup(s, alloc),
        .openai => if (state.openai_state) |*s| openai.cleanup(s, alloc),
        .google => if (state.gemini_state) |*s| gemini.cleanup(s, alloc),
    }
    state.anthropic_state = null;
    state.openai_state = null;
    state.gemini_state = null;
}

/// Convenience function to get the current model display string
pub fn getModelDisplayString(alloc: Allocator) ![]const u8 {
    const config = ModelConfig.fromEnv();
    return std.fmt.allocPrint(alloc, "{s}/{s}", .{ config.provider.toString(), config.model_id });
}
