# SmithersProvider: config.maxIterations defined but unused

## Status
Closed

## Description
maxIterations is defined in SmithersConfig but never consumed/passed to Ralph

## Files
- docs/components/smithers-provider.mdx
- src/components/SmithersProvider.tsx
- src/components/While.tsx (fixed)
- src/components/While.test.tsx (tests added)

## Tasks
- [x] Wire up or remove from config

## Resolution
Wired up config.maxIterations to While component (which Ralph wraps). The fallback chain is:
1. `maxIterations` prop on While/Ralph component
2. `config.maxIterations` from SmithersProvider
3. DEFAULT_MAX_ITERATIONS (10)

Added tests and updated documentation.
