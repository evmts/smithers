# 0088: Capture worker configuration when building the program

Date: 2026-10-23. Fixes the production CI dispatch refusal and enforces PROC-4 after the earlier SUMMARY_MODEL defect.

Alchemy captures deployment configuration while building a Worker's program. Request handlers, flow implementations, and layers acquired by either must consume captured values or injected services. They must never evaluate Effect Config against the runtime host's ambient environment.

ChatApi reads REPO_FLOWS and REPO_FLOWS_REPOSITORIES together, then passes the repository set into the execution program and dispatch services. Both matching and starting require that set. Decision 0082 still applies: absent, blank or invalid entries allow nothing. Each deployment captures its own set; each step independently checks it.

The same audit moves ALERT_APP_URL, the home repository, secrets egress hosts, sandbox idle timeout, and the docs and branch-forge Config layers to program construction. Invalid alert URL configuration stays a per-request refusal. The home repository is an injected service with the existing unconfigured deployment default.

`tests/worker-config.test.ts` scans worker sources through TypeScript's compiler API. It starts at request handlers, step factories, flow bodies and runtime callbacks, follows worker-owned deferred Effect/Layer/function references, and rejects Config use there. Values yielded during program construction remain captured. Compiler fixtures cover Config aliases, imported Config, lazy layers, named and factory-created callbacks, and captured values. Docs settings are captured without acquiring a cache; the source acquires its HTTP/cache context at runtime. The check failed on the original Dispatch match/start reads and the other deferred reads before their fixes. This is a source guard for the current worker authoring patterns, not a proof for dynamically computed calls or erased types.

Library catalog entries: `@smthrs/flow` owns dispatch and job execution, `@smthrs/integrations` owns GitHub, and Effect Config/services supply deployment choices. No new dependency or public SDK API.
