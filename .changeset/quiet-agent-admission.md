---
"@smthrs/agent": patch
---

Wait for committed control admission through the injected journal instead of polling the control store every 10 ms. Uses the catalog's @smthrs/agent session adapter and existing @smthrs/journal service; retains cancellation and a bounded admission deadline.
