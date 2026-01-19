# Reactive SQLite Improvements

## Overview

Review of `src/reactive-sqlite/**` completed. The implementation is solid with comprehensive test coverage.

## Current State

- **Tests**: 288+ tests all passing
- **Type Errors**: None
- **TODOs/FIXMEs**: None

## Issues Found

### 1. Duplicate RowFilter Type Definition (Fixed)

**File**: `parser.ts` lines 126-131 and `types.ts` lines 12-20

The `RowFilter` interface is defined in both files. This violates DRY and could lead to type drift.

**Fix**: Remove duplicate from `parser.ts`, import from `types.ts`.

### 2. useMutation Uses useState (Policy Violation)

**File**: `hooks/useMutation.ts` lines 71-72

Per AGENTS.md: "NEVER use useState. All state must be in SQLite, useRef, or derived."

```typescript
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<Error | null>(null)
```

**Fix**: Replace with useRef since this is ephemeral, non-reactive state for synchronous SQLite operations.

### 3. Missing Test: prepare() throws on closed database

**File**: `database.ts` line 86-87

The code throws when calling `prepare()` on a closed database, but this isn't tested.

**Fix**: Add test case.

### 4. Missing Export: RowFilter from types.ts

**File**: `index.ts`

The `RowFilter` type is used publicly (in `subscribeWithRowFilter`, `invalidateRows`) but not exported from the barrel.

**Fix**: Add to exports.

## Changes Made

1. ✅ Removed duplicate `RowFilter` from `parser.ts`, now imports from `types.ts`
2. ✅ Replaced `useState` with `useRef` in `useMutation.ts`
3. ✅ Added test for `prepare()` throws on closed database
4. ✅ Added `RowFilter` to exports in `index.ts`

## Test Results

All tests pass after changes.
