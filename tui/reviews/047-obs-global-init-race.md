# Obs Global Init Not Thread-Safe

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**File:** `src/obs.zig#L298-L306`

## Problem

```zig
pub var global: Obs = undefined;
var global_initialized: bool = false;

pub fn initGlobal() void {
    if (!global_initialized) {      // RACE: check
        global = Obs.init();        // RACE: write
        global_initialized = true;  // RACE: write
    }
}
```

Two threads calling `initGlobal()` simultaneously can:
1. Both see `global_initialized == false`
2. Both call `Obs.init()` and overwrite each other
3. One thread uses partially initialized state

## Impact

- Double initialization
- Torn reads on `global` struct
- Random crashes during startup if multiple threads exist

## Fix

Use `std.once` or atomic CAS:

```zig
var init_once = std.Thread.Once{};

pub fn initGlobal() void {
    init_once.call(doInit);
}

fn doInit() void {
    global = Obs.init();
}
```

Or atomic flag:

```zig
var global_init_state: std.atomic.Value(u8) = .init(0);

pub fn initGlobal() void {
    const UNINIT = 0;
    const INITIALIZING = 1;
    const INITIALIZED = 2;
    
    if (global_init_state.cmpxchgStrong(UNINIT, INITIALIZING, .acquire, .acquire)) |_| {
        // Another thread is initializing, spin-wait
        while (global_init_state.load(.acquire) != INITIALIZED) {
            std.atomic.spinLoopHint();
        }
        return;
    }
    global = Obs.init();
    global_init_state.store(INITIALIZED, .release);
}
```

## Effort

S (15 min)
