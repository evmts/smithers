---
name: fix-build
description: Diagnose and fix broken builds or failing tests with coordinated retries. Use when a build/test is broken, pre-commit hooks fail, or agents should coordinate a fix.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
user-invocable: true
recommend-plan-mode: false
---

# Fix Build

Purpose: coordinate a single fixer when builds/tests fail, run targeted diagnostics, apply minimal fixes, and re-verify.

## Trigger

Use this skill when:
- pre-commit hooks fail (lint/typecheck/test)
- tests fail in CI or locally
- multiple agents might attempt the same fix

## Flow

1. Inspect the failure output and identify the first actionable root cause.
2. Check build coordination state via SQLite (build_state).
3. If this agent is the fixer, apply the smallest viable fix.
4. Re-run the failing checks and report results.
5. Mark build state as fixed on success.

## Coordination

- If build_state indicates another fixer is active, wait before retrying.
- Avoid duplicate fix attempts; respect the fixer lock.
- If lock is stale, claim and proceed.

## Reporting

Always report:
- failing command(s) and error snippet
- files changed and rationale
- verification commands and outcomes
- if coordination required waiting or lock cleanup
