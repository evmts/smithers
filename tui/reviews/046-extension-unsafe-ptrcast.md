# Extension API Unsafe Pointer Cast

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/extensions/extension.zig#L40-L45`

## Problem

```zig
pub fn getData(self: *const Event, comptime T: type) ?*T {
    if (self.data) |d| {
        return @ptrCast(@alignCast(d));  // No type validation!
    }
    return null;
}
```

`Event.data` is `?*anyopaque`. Extensions can call `getData(WrongType)` and get a pointer to garbage. No runtime validation that `T` matches the actual stored type.

## Impact

- Type confusion vulnerability
- Memory corruption if extension casts to wrong type
- Security issue: malicious extension could exploit this

## Fix

Add type tag to Event:

```zig
pub const Event = struct {
    type: EventType,
    data: ?*anyopaque = null,
    data_type_hash: u64 = 0,  // Hash of type name
    
    pub fn setData(self: *Event, comptime T: type, ptr: *T) void {
        self.data = ptr;
        self.data_type_hash = comptime std.hash.Wyhash.hash(0, @typeName(T));
    }
    
    pub fn getData(self: *const Event, comptime T: type) ?*T {
        const expected = comptime std.hash.Wyhash.hash(0, @typeName(T));
        if (self.data_type_hash != expected) return null;
        if (self.data) |d| {
            return @ptrCast(@alignCast(d));
        }
        return null;
    }
};
```

## Effort

S (30 min)
