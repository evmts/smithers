---
"@smthrs/platform-browser": patch
---

The browser engine resumes two runs at a time, so a run a tab starts after a reload goes ahead of the runs the reload resumed. After a reload that cut off 60 runs, the new run reached its first step after 60 ms instead of 447 ms and settled after 133 ms instead of 2.8 s, and no more than two resumed runs ran at once (the engine's own sweep had driven 48 together). `pnpm bench` times what one run costs the engine, about 100 ms over the in-memory OPFS.
