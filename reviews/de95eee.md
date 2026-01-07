# Review: de95eee

**Commit:** de95eee1a983b36730766c15854d127f0e8abcc2
**Message:** fix: address example bugs from codex review 8da3269
**Date:** 2026-01-07 02:30:01 UTC

## Feedback

- Duplicate React keys now possible when directory files share identical content; `key={item}` uses the full content string, so identical items will collide and later items can be dropped. Use a stable unique key (e.g., include filename or index) and consider carrying source metadata alongside content. `examples/11-rate-limited-batch/agent.tsx:74`
