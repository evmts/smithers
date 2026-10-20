---
"@smthrs/engine-store": minor
---

`RunInspection` reads one run as a person debugging it needs it, from the
engine's own tables: the run's lifecycle with its input and result, each plan
node as a step with its attempts and output, the runs it started, and a page of
its journal (`inspect(runId, { afterSeq, limit })`, at most 500 events). `list`
pages runs newest first, roots by default, and `payload` returns the encoded,
unredacted payload so a host can run the same flow again inside the engine.

Every released value passes through `@smthrs/journal`'s `Redaction.redact` and
is cut to 16 KiB of UTF-8 at a character boundary. A failure is reduced to its
closed code, so no typed failure's message, defect text or provider error text
leaves the read. `layerWith({ flows })` learns each flow's schemas and, from
each flow's plan, each action's success schema, and shows every value it can
place through its schema: a `Schema.Redacted` value reads as `<redacted>` at
any depth (`redactedMarker`), and a value its schema no longer decodes, a cut
preview of a schema holding one, or a node output with no action reads as
`<withheld>` (`withheldMarker`), never as the stored text. A value whose flow
or action is not reachable from the given flows has the redaction rules alone.
Reads run in one read transaction on SQLite and PostgreSQL.
