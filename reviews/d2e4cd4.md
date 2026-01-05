# Review: d2e4cd4

**Commit:** d2e4cd45854fe895481af4289d7a4a4934596c23
**Message:** ✨ feat: add research pipeline example
**Date:** 2026-01-05 23:25:42 UTC

## Feedback

- `examples/03-research-pipeline/agent.tsx`: `fileSystemTool.execute` only logs and never writes a file, but the report phase instructs “Save the report to output/research-report.md”. Either implement the write (e.g., `fs.promises.mkdir` + `writeFile`) or clarify in the prompt/README that saving is mocked so users don’t expect a file to appear.
- `examples/03-research-pipeline/agent.tsx`: `ReportPhase` uses `<OutputFormat>` without a schema, unlike the other phases. If Smithers relies on schema to validate/parse JSON, this can lead to inconsistent results or parse failures. Add a schema with `{ report: string }` to make the contract explicit.
