---
"@smthrs/views": patch
---

Bound reduce output before host JSON parsing, accept explicit class constructors while retaining constructor-access checks, and quarantine shared QuickJS modules after a host stack overflow so abandoned runtimes cannot accumulate. Add forbidden-global and dynamic-import probes, workerd recursion coverage, and correct the documented validation evidence. Uses the library catalog's generated-view rendering entry (`@smthrs/views`).
