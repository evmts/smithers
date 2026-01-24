/// Agent provider interface for dependency injection via comptime generics
/// 
/// Usage:
/// ```zig
/// const MyLoop = AgentLoop(AnthropicProvider);
/// ```

const std = @import("std");

pub const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};

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
