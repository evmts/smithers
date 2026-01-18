# useHumanInteractive Hook Not Implemented

## Status: FEATURE GAP

## Summary
The design documents describe a `useHumanInteractive` hook for interactive Claude sessions with full tool access. Currently only simple `useHuman` prompts exist.

## Impact
- No interactive human-in-the-loop sessions
- Cannot have multi-turn conversations during orchestration
- Limited human interaction capabilities

## Design Location
- `issues/use-human-interactive.md`

## Current State
- `useHuman` exists for simple yes/no or text prompts
- No support for interactive sessions with tool access

## Suggested Implementation
1. Implement `useHumanInteractive` hook
2. Support multi-turn conversation context
3. Allow tool access during interaction
4. Add timeout and cancellation support

## Priority
**P3** - Feature enhancement (post-MVP)

## Estimated Effort
2-3 days (per design doc)
