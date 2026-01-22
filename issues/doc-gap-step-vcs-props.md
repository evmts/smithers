# Step: VCS integration props not implemented

## Status
Resolved

## Description
Missing props: snapshotBefore, snapshotAfter, commitAfter, commitMessage

## Resolution
The VCS props were already implemented in Step.tsx. The issue was stale.

Implementation details:
- Props defined in StepProps interface (lines 196-202)
- doSnapshotBefore() helper creates JJ snapshot before step execution
- doSnapshotAfter() helper creates JJ snapshot after step completion
- doCommitAfter() helper commits via JJ after step completion
- All VCS operations fail gracefully with warnings if JJ unavailable
- VCS logs stored in db.vcs table

## Files
- docs/components/step.mdx
- src/components/Step.tsx

## Tasks
- [x] Implement VCS props or remove from docs
