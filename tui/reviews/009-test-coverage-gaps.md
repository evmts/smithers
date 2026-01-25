# Test Coverage Gaps

**Severity:** 🟢 Low  
**Type:** Testing  
**Files:** `src/tests/`

## Missing Tests

### 1. Concurrency Correctness
No tests for thread interaction:
```zig
test "submit message while agent streaming" {
    // Start streaming
    // Submit another message from "main thread"
    // Assert no crash, no DB corruption
}

test "cancel during streaming" {
    // Start streaming
    // Set cancel flag
    // Assert isLoading == false
    // Assert curl process killed
}
```

### 2. UAF Regression
```zig
test "Action.start_ai_query does not contain freed pointer" {
    // After payload removed, this becomes moot
    // But add test to prevent reintroduction
}
```

### 3. Crash Recovery
```zig
test "recovers interrupted agent run on startup" {
    // Insert agent_run row with status='tools'
    // Init AgentThread
    // Assert run marked as error
    // Assert system message added
}
```

### 4. ToolExecutor Ownership
```zig
test "deinit while tool running does not leak" {
    // Start tool execution
    // Call deinit before poll
    // Assert no memory leak (use testing allocator)
}

test "cancel mid-tool does not leak" {
    // Start tool
    // Set cancel
    // Assert cleanup frees tool_id, tool_name
}
```

### 5. Provider Interface Validation
```zig
// In AgentLoop comptime block:
comptime {
    provider_interface.validateProviderInterface(Provider);
}
```

## Effort

M (2-3 hours) to add all tests
