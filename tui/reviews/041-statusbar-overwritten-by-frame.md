# Status Bar Custom Status Overwritten by FrameRenderer

**Severity:** 🟢 Low  
**Type:** UX Bug  
**Files:** `src/keys/handler.zig`, `src/rendering/frame.zig`

## Problem

`KeyHandler` sets prefix mode status:
```zig
ctx.status_bar.setCustomStatus(" [Ctrl+B] c:new n:next p:prev 0-9:switch");
```

But `FrameRenderer.render()` unconditionally overwrites:
```zig
if (ctx.loading.isLoading()) {
    ctx.status_bar.setCustomStatus(" Smithers is thinking...");
} else if (now - ctx.key_handler.last_ctrl_c < 1500 ...) {
    ctx.status_bar.setCustomStatus(" Press Ctrl+C again ...");
} else {
    ctx.status_bar.setCustomStatus(null);  // clears prefix mode message!
}
```

The `else` branch clears the prefix-mode message immediately on next render.

## Impact

- Prefix mode prompt invisible or single-frame flicker
- User doesn't see available commands
- Confusing UX

## Fix

Incorporate prefix mode into status decision:

```zig
if (ctx.loading.isLoading()) {
    ctx.status_bar.setCustomStatus(" Smithers is thinking...");
} else if (ctx.key_handler.prefix_mode) {
    ctx.status_bar.setCustomStatus(" [Ctrl+B] c:new n:next p:prev 0-9:switch");
} else if (now - ctx.key_handler.last_ctrl_c < 1500 ...) {
    ctx.status_bar.setCustomStatus(" Press Ctrl+C again ...");
} else {
    ctx.status_bar.setCustomStatus(null);
}
```

Or: Don't set status in handler, only in FrameRenderer based on handler state.

## Effort

S (15 min)
