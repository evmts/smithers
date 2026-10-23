# Collect TODO work from its recorded base

Status: accepted, 2026-10-23. Implements Will's production T7 fix and decision 0016 §5.

Collection compares the branch machine's complete working tree with `Begun.baseSha`, rather than its current `HEAD`. Local agent commits and pending changes therefore produce the same collected file changes. The sandbox SDK uses a private temporary index; collection does not stage or reset the agent's index. An equal tree fails `empty_change`.

Publish remains one host-created commit with the TODO message, parented at the recorded base and fenced by `expectedHeadOid`. Agent commit messages and intermediate history do not leave the machine. Additions and deletions retain the existing integration path validation. No machine push is introduced, and the host writes only the TODO branch.

Library catalog entries: `@smthrs/sandbox` for base-relative status and file reads; `@smthrs/integrations` for the fenced commit and pull request. Existing durable flow steps, metrics and spans cover collection and publication.
