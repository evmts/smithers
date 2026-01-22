# Git/Commit: filesChanged type mismatch

## Status
Closed

## Description
Docs show filesChanged: number; impl uses filesChanged: string[]

## Resolution
Updated docs to match implementation. The `filesChanged: string[]` is the correct design - it provides the actual file paths which is more useful than just a count. Users can get the count via `filesChanged.length`.

## Files
- docs/components/commit.mdx
- src/components/Git/Commit.tsx

## Tasks
- [x] Align docs and implementation
