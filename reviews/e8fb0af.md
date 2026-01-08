# Review: e8fb0af

**Commit:** e8fb0afe5b08a0619e0a6777a1afd288d0b3b4d5
**Message:** docs: Update important memories with CLI version fix session
**Date:** 2026-01-08 02:54:31 UTC

## Feedback

The doc claims `assert { type: 'json' }` “works in Node 16.14+, 18+, 20+”; that’s likely inaccurate—Node 16 requires `--experimental-json-modules`, and stable JSON import assertions only land in later versions (Node 17+/18). Please уточ/clarify the minimum Node version and whether a flag is required.
