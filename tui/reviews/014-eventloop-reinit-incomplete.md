# EventLoop.reinitTty() Doesn't Restore Mouse Mode or Resize

**Severity:** 🟡 Medium  
**Type:** UI Bug  
**File:** `src/event_loop.zig`

## Problem

`start()` does:
- `enterAltScreen`
- `setMouseMode(..., true)`
- `getWinsize` + `resize(ws)`

But `reinitTty()` only does:
- init tty
- init loop
- start loop
- enterAltScreen

**Missing:** `setMouseMode` and `resize`.

## Impact

After external editor or suspend/resume:
- Mouse scrolling stops working
- Layout uses stale window size until next resize event
- Poor UX after Ctrl+Z or Ctrl+E

## Fix

Factor out post-start setup or call same steps:

```zig
pub fn reinitTty(self: *Self) !void {
    // existing init code...
    
    try self.vx.enterAltScreen(self.tty.writer());
    try self.vx.setMouseMode(self.tty.writer(), true);  // ADD
    const ws = try self.getWinsize();                    // ADD
    try self.resize(ws);                                 // ADD
}
```

Or extract to shared helper:

```zig
fn postStartSetup(self: *Self) !void {
    try self.vx.enterAltScreen(self.tty.writer());
    try self.vx.setMouseMode(self.tty.writer(), true);
    const ws = try self.getWinsize();
    try self.resize(ws);
}

pub fn start(self: *Self) !void {
    // ... existing init
    try self.postStartSetup();
}

pub fn reinitTty(self: *Self) !void {
    // ... existing reinit
    try self.postStartSetup();
}
```

## Effort

S (15 min)
