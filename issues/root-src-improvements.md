# Root src Files Improvements

## Files Reviewed
- `src/index.ts` - Main barrel export
- `src/jsx-runtime.ts` - JSX runtime re-export
- `src/jsx-runtime.test.ts` - JSX runtime tests
- `src/globals.d.ts` - Global type declarations
- `src/jsx.d.ts` - JSX intrinsic elements

## Issues Found

### 1. Test imports wrong file (FIXED)
`jsx-runtime.test.ts` imports from `./reconciler/jsx-runtime.js` but should test the re-export from `./jsx-runtime.ts` to ensure the barrel export works correctly.

### 2. Missing test coverage
No test verifies that `SmithersNode` type is exported from `jsx-runtime.ts`.

### 3. globals.d.ts uses NodeJS namespace
Declares `NodeJS.ProcessEnv` but Bun provides its own `process.env` types. The file may cause conflicts. Keep minimal - only MOCK_MODE is Smithers-specific.

## Changes Made

### jsx-runtime.test.ts
- Changed import to use `./jsx-runtime.js` (the re-export file)
- Added test for SmithersNode type export

## Status
- [x] All tests pass
- [x] TypeScript compiles without errors
