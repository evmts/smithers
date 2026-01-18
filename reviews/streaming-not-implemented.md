# Real-Time Streaming Not Implemented

## Status: FEATURE GAP

## Summary
The design documents describe real-time streaming output for long-running agents. This is not yet implemented.

## Impact
- No real-time visibility into agent progress
- Must wait for full completion to see output
- Poor UX for long-running workflows

## Design Location
- `issues/streaming-protocol.md`

## Suggested Implementation
1. Define streaming protocol
2. Implement streaming transport (WebSocket or SSE)
3. Add streaming output to Claude component
4. Create streaming consumer for UI

## Priority
**P4** - Feature enhancement (post-MVP)

## Estimated Effort
5+ days (per design doc)
