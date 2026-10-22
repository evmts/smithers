# 0034: Inject the model wire trace sink

Date: 2026-10-22. Implements SDK-4, SDK-5 and OBS-1/OBS-2.

`CallTiming` only reads the Effect clock. Its route caller passed readings to
`internal/WireTrace`, which read `process.env` and synchronously appended files
through `node:fs`. Keep the diagnostic records: they include cache-prefix hashes
and response headers that the existing timing span attributes do not carry.

`@smthrs/model` now captures an optional `WireTrace.WireTrace` service when a
route becomes a model. With no service it performs no file access. Both records
of a call use the captured sink; sink failures emit a content-free debug log
and do not fail the model call. Cooperative writes are bounded by a
1,000 ms deadline (overridable on the sink); cancellation retains its response
record and may wait up to this budget for cleanup. `WireTrace.layerFileSystem(path)` writes JSONL
through the host's injected Effect `FileSystem`, serializing appends. Hosts
choose the path explicitly, including any environment configuration.

This is generic SDK infrastructure. Node callers provide the filesystem from
`@smthrs/platform-node`; no new dependency from that host onto the model package
is needed. Timing continues on settle events, model errors and existing spans.
The library catalog entries used are `@smthrs/model` for model calls and
`@smthrs/platform-node`, `-bun`, `-browser` for filesystem services.
