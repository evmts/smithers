const std = @import("std");
const registry = @import("tools/registry.zig");
const ToolRegistry = registry.ToolRegistry;
const ToolResult = registry.ToolResult;

/// Async tool executor that runs tools in a background thread
/// Allows main event loop to remain responsive during tool execution
pub const ToolExecutor = struct {
    allocator: std.mem.Allocator,
    thread: ?std.Thread = null,
    result: ?ThreadResult = null,
    mutex: std.Thread.Mutex = .{},
    
    /// Tool execution context passed to thread
    const ThreadContext = struct {
        allocator: std.mem.Allocator,
        tool_name: []const u8,
        tool_id: []const u8,
        input_json: []const u8,
        executor: *ToolExecutor,
    };
    
    /// Result from thread execution
    pub const ThreadResult = struct {
        tool_id: []const u8,
        tool_name: []const u8,
        result: ToolResult,
        input_value: ?std.json.Value = null,
    };
    
    pub fn init(allocator: std.mem.Allocator) ToolExecutor {
        return .{ .allocator = allocator };
    }
    
    pub fn deinit(self: *ToolExecutor) void {
        if (self.thread) |t| {
            t.join();
        }
        self.thread = null;
    }
    
    /// Check if a tool is currently executing
    pub fn isRunning(self: *ToolExecutor) bool {
        return self.thread != null and self.result == null;
    }
    
    /// Poll for completion - returns result if done, null if still running
    pub fn poll(self: *ToolExecutor) ?ThreadResult {
        self.mutex.lock();
        defer self.mutex.unlock();
        
        if (self.result) |r| {
            // Join the thread now that we have result
            if (self.thread) |t| {
                t.join();
                self.thread = null;
            }
            self.result = null;
            return r;
        }
        return null;
    }
    
    /// Start executing a tool in background
    pub fn execute(
        self: *ToolExecutor,
        tool_id: []const u8,
        tool_name: []const u8,
        input_json: []const u8,
    ) !void {
        // Don't start if already running
        if (self.isRunning()) return error.AlreadyRunning;
        
        // Dupe strings for thread ownership
        const id_copy = try self.allocator.dupe(u8, tool_id);
        const name_copy = try self.allocator.dupe(u8, tool_name);
        const input_copy = try self.allocator.dupe(u8, input_json);
        
        const ctx = ThreadContext{
            .allocator = self.allocator,
            .tool_name = name_copy,
            .tool_id = id_copy,
            .input_json = input_copy,
            .executor = self,
        };
        
        self.result = null;
        self.thread = try std.Thread.spawn(.{}, threadFn, .{ctx});
    }
    
    fn threadFn(ctx: ThreadContext) void {
        var tool_registry = ToolRegistry.initBuiltin(ctx.allocator);
        defer tool_registry.deinit();
        
        // Parse input JSON
        const maybe_parsed = std.json.parseFromSlice(
            std.json.Value, 
            ctx.allocator, 
            ctx.input_json, 
            .{}
        ) catch null;
        defer if (maybe_parsed) |p| p.deinit();
        
        const input_value = if (maybe_parsed) |p| p.value else std.json.Value.null;
        
        // Execute the tool
        const result = tool_registry.execute(ctx.tool_name, input_value);
        
        // Store result
        ctx.executor.mutex.lock();
        ctx.executor.result = .{
            .tool_id = ctx.tool_id,
            .tool_name = ctx.tool_name,
            .result = result,
        };
        ctx.executor.mutex.unlock();
        
        // Note: tool_id and tool_name are NOT freed here - caller owns them after poll()
        ctx.allocator.free(ctx.input_json);
    }
};
