# Review Processor

Parallel review processing workflow with 16 concurrent subagents.

## XML Pseudocode Model

```xml
<orchestration name="review-processor">
  <config>
    <maxParallel>16</maxParallel>
    <reviewsDir>reviews/</reviewsDir>
    <retryLimit>2</retryLimit>
  </config>

  <!-- Phase 1: Scan all reviews -->
  <phase name="scan">
    <scan-reviews dir="reviews/">
      <categorize>
        <normal condition="!isDifficult" />
        <difficult condition="isDifficult || complexity:high" />
      </categorize>
    </scan-reviews>
  </phase>

  <!-- Phase 2: Parallel processing (non-difficult) -->
  <phase name="parallel-process" depends="scan">
    <parallel max="16">
      <foreach reviews="normal">
        <subagent name="review-{name}" parallel>
          <step name="process-{name}">
            <claude>
              <read file="reviews/{name}.md" />
              <decide>
                <if condition="already-implemented">
                  <action>close</action>
                  <delete file="reviews/{name}.md" />
                </if>
                <else>
                  <action>implement</action>
                  <commit no-verify="true" />
                  <delete file="reviews/{name}.md" />
                </else>
              </decide>
            </claude>
          </step>
        </subagent>
      </foreach>
    </parallel>
    
    <!-- Retry failed agents -->
    <retry max="2">
      <foreach reviews="failed">
        <subagent name="retry-{name}" parallel>
          <step name="retry-{name}">
            <claude>Retry processing with fresh context</claude>
          </step>
        </subagent>
      </foreach>
    </retry>
  </phase>

  <!-- Phase 3: Serial processing (difficult) -->
  <phase name="serial-process" depends="parallel-process">
    <serial>
      <foreach reviews="difficult">
        <step name="difficult-{name}">
          <claude>
            <careful-analysis />
            <incremental-commits no-verify="true" />
            <verify-with-tests />
          </claude>
        </step>
      </foreach>
    </serial>
  </phase>

  <!-- Phase 4: Report -->
  <phase name="report" depends="serial-process">
    <step name="generate-report">
      <claude>
        <summarize>
          <implemented count="{implemented.length}" />
          <closed count="{closed.length}" />
          <failed count="{failed.length}" />
        </summarize>
        <write file="reviews/PROCESSING_REPORT.md" />
      </claude>
    </step>
  </phase>
</orchestration>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ReviewProcessor                              │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Scan                                                  │
│  ├── List reviews/*.md                                          │
│  ├── Parse content for difficulty markers                       │
│  └── Store in SQLite state                                      │
├─────────────────────────────────────────────────────────────────┤
│  Phase 2: Parallel (16 concurrent)                              │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐     │
│  │ A1   │ A2   │ A3   │ A4   │ A5   │ A6   │ A7   │ A8   │     │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤     │
│  │ A9   │ A10  │ A11  │ A12  │ A13  │ A14  │ A15  │ A16  │     │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘     │
│  Each agent: Read → Decide → Implement/Close → Commit           │
├─────────────────────────────────────────────────────────────────┤
│  Phase 3: Serial (difficult reviews)                            │
│  ├── R1 → Careful analysis → Implement → Verify                 │
│  ├── R2 → Careful analysis → Implement → Verify                 │
│  └── ...                                                        │
├─────────────────────────────────────────────────────────────────┤
│  Phase 4: Report                                                │
│  └── Generate PROCESSING_REPORT.md                              │
└─────────────────────────────────────────────────────────────────┘
```

## Key Patterns

### 1. Parallel Subagent Execution
```tsx
<Parallel>
  {reviews.map(review => (
    <Subagent name={`review-${review.name}`} parallel>
      <Step name={`Process ${review.name}`}>
        <Claude>...</Claude>
      </Step>
    </Subagent>
  ))}
</Parallel>
```

### 2. Chaos-Resistant Commits
```tsx
<Claude>
  Use `git commit --no-verify` to bypass precommit hooks
</Claude>
```

### 3. Deferred Difficult Processing
```tsx
<Phase name="Parallel Processing">
  {/* Only non-difficult reviews */}
  <ParallelProcessPhase reviews={normalReviews} />
</Phase>

<Phase name="Serial Processing">
  {/* Process difficult reviews after parallel completes */}
  <SerialProcessPhase reviews={difficultReviews} />
</Phase>
```

### 4. SQLite State Management
```tsx
const state: ProcessorState = storedState
  ? JSON.parse(storedState)
  : { reviews: [], scanned: false }

// Update state
db.state.set(stateKey, newState, 'scan-complete')
```

## Usage

```bash
bun examples/review-processor/index.tsx
```

## Files

```
examples/review-processor/
├── index.tsx              # Entry point
├── ReviewProcessor.tsx    # Main orchestration
├── types.ts               # TypeScript types
├── README.md              # This file
└── components/
    ├── ScanPhase.tsx           # Phase 1
    ├── ParallelProcessPhase.tsx # Phase 2
    ├── SerialProcessPhase.tsx   # Phase 3
    └── ReportPhase.tsx          # Phase 4
```
