# Review: 2ab7f4d

**Commit:** 2ab7f4d8edd407c79427cb2761eea771d7f1b774
**Message:** fix: add backward compatibility for Tool.parameters
**Date:** 2026-01-05 23:16:44 UTC

## Feedback

- `src/core/claude-executor.ts:207` The legacy `parameters` format shown in `README.md` uses `required: true` per property, but the conversion hard-codes `required: []`, so required fields are silently dropped. That’s a behavior regression for users relying on required params. Suggest deriving `required` from legacy properties (and removing `required` from each property schema), or detect full schema vs properties and map accordingly.
