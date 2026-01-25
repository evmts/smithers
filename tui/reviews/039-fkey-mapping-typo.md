# F-Key Mapping Typo (Duplicate F8)

**Severity:** 🟢 Low  
**Type:** Bug  
**File:** `renderer/keys.zig` (vendored vaxis)

## Problem

```zig
0x76 => Key.f8,
0x77 => Key.f8,  // Should be f7?
```

Both virtual key codes map to F8. One is likely a typo (F7 or another key).

## Impact

- F7 key doesn't work correctly on Windows
- Hard to detect without targeted tests

## Fix

Audit against Microsoft VK_* constants:
- VK_F7 = 0x76
- VK_F8 = 0x77

```zig
0x76 => Key.f7,  // VK_F7
0x77 => Key.f8,  // VK_F8
```

Add unit tests for function key mappings.

## Effort

S (10 min)
