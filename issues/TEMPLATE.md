# [Feature/Issue Title]

<metadata>
  <priority>P0|P1|P2|P3</priority>
  <category>component|hook|infrastructure|tooling|docs</category>
  <status>proposed|in-progress|blocked|implemented</status>
  <dependencies>
    - [Related Issue](./related-issue.md)
  </dependencies>
  <blocked-by>
    - [Blocking Issue](./blocking-issue.md)
  </blocked-by>
  <docs>["path/to/doc.mdx"]</docs>
</metadata>

## Executive Summary

**What**: [One-line description of the feature/issue]

**Why**: [Business/technical justification - why this matters]

**Impact**: [What changes when this is implemented]

## Problem Statement

[Detailed explanation of the current problem or gap]

### Concrete Examples

```tsx
// Example demonstrating the problem
// Show current broken/missing behavior
```

**Current Behavior:**
- [What happens now]
- [Pain points]

**Expected Behavior:**
- [What should happen]
- [How it should work]

## Proposed Solution

### Architecture

[High-level architectural approach]

```
┌─────────────────┐
│  Component A    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ System B│
    └─────────┘
```

### Key Design Decisions

1. **Decision**: [Choice made]
   - **Rationale**: [Why this approach]
   - **Alternatives Considered**: [Other options and why rejected]

### API Design

```tsx
interface ProposedAPI {
  // TypeScript interface for new API
}

// Usage example
<NewComponent prop="value">
  {/* Example usage */}
</NewComponent>
```

## Implementation Plan

### Phase 1: [Phase Name]

**Goal**: [What this phase achieves]

**Files to Create:**
- `path/to/new-file.ts`
  ```tsx
  // Skeleton implementation
  ```

**Files to Modify:**
- `path/to/existing-file.ts` (lines 10-50)
  ```tsx
  // Before
  const old = 'code'

  // After
  const new = 'code'
  ```

**Code Changes:**

```tsx
// Detailed implementation code for this phase
```

**Tests:**
```tsx
// Test cases for this phase
describe('Phase 1', () => {
  it('should...', () => {
    // Test implementation
  })
})
```

### Phase 2: [Next Phase]

[Repeat structure for each phase]

## Acceptance Criteria

- [ ] **AC1**: [Specific, testable criterion]
- [ ] **AC2**: [Another criterion]
- [ ] **AC3**: [Performance/quality bar]
- [ ] **AC4**: [Documentation updated]
- [ ] **AC5**: [Tests passing]

## Testing Strategy

### Unit Tests

```tsx
// Critical unit test cases
describe('ComponentName', () => {
  it('handles edge case X', () => {})
  it('validates prop Y', () => {})
})
```

### Integration Tests

```tsx
// Integration test scenarios
describe('Integration with SystemZ', () => {
  it('works end-to-end', () => {})
})
```

### Manual Testing

1. **Scenario**: [User flow to test]
   - **Steps**: [How to reproduce]
   - **Expected**: [What should happen]

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| CREATE | `path/to/new.ts` | [Purpose] |
| MODIFY | `path/to/existing.ts` | [Changes] |
| DELETE | `path/to/old.ts` | [Reason] |

## Open Questions

- [ ] **Q1**: [Unresolved question]
  - **Impact**: [What's blocked by this]
  - **Resolution**: [How/when to decide]

## References

- [Related Documentation](../docs/path.mdx)
- [External Resource](https://example.com)
- [Prior Art](./similar-issue.md)
