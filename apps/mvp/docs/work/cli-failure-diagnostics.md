---
title: Unexpected CLI failure diagnostics
status: done
area: sdk
owner: codex-scorers-durable
updated: 2026-10-22
links: []
---

Use catalog entries @smthrs/build-cli for target execution and @smthrs/journal
Redaction for bounded diagnostics. Build command failures, unified command
failures and executable startup failures print their redacted tag/message and
a private diagnostic log path. Log files contain only that diagnostic, with
0700 directories and 0600 files. No payload, stack, argument or environment
dump. An unwritable log directory preserves the diagnostic and reports the
missing receipt honestly. Unicode truncation preserves complete characters.

Latitude: old Entry and bootstrap reporters each fail the diagnostic assertions;
restoring the implementation passes. Build-cli Diagnostic/TaggedErrors: 41
passed. CLI selected suites: 173 passed; existing-output refusals: 2 passed
(11 other EvaluationCli cases not selected); bootstrap: 17 passed. Both
programs' production typechecks and changed-source lint pass. Corrected a
stale bootstrap assertion to include main's existing Prompt JSX resolver alias.
No push or local dependency installation.

The startup regression uses the existing injected command-entry fixture to
throw before command initialization; it exercises the real executable catch
boundary and real diagnostic filesystem writes. No external-service mock was
added.
