# Review: 13cf8ee

**Commit:** 13cf8ee46f86a97e2280b9ecc3976d4b5ee3ef17
**Message:** fix: Read CLI version from package.json instead of hardcoding
**Date:** 2026-01-08 02:49:49 UTC

## Feedback

Importing JSON via `import { version as VERSION } from '../../package.json'` can break in Node ESM because JSON imports require an assertion (`assert { type: 'json' }`). If this CLI is expected to run under Node (not just Bun), consider using `createRequire` or `fs` to read package.json, or add the import assertion where supported.
