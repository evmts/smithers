# Review: d0e0c1a

**Commit:** d0e0c1a8e0d86b32ed0a565867877ee7d6a24417
**Message:** docs: fix stale closure in hero example with useEffect pattern
**Date:** 2026-01-05 21:29:37 UTC

## Feedback

Potential issue in `README.md`: the `useEffect` dependency is `[analyses, sources.length]`, so if `sources` changes to a different set with the same length, the effect won’t re-run. That can leave you stuck in `analyze` or advance based on stale `analyses`. Consider depending on `sources` (or `sources.map(s => s.id)`), and optionally resetting `analyses` when `sources` changes.
