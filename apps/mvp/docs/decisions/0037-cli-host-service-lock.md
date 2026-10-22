# 0037: Crash-safe CLI host exclusion

Date: 2026-10-22
Status: accepted

The existing CLI host adapter serializes install, stop and restore with an
exclusive SQLite transaction. SQLite supplies process-death release; the file
is never unlinked, so every entrant locks the same inode. It stores no user
content or credentials. Effect owns acquisition, release, metrics and spans.
Restore acquires before checking stopped state and releases after the backend
exits. Bundle verification's canonical directory is the installation input.

This fixes the existing adapter; it does not change hosted product architecture
or any device schema. The library catalog's existing journal redaction entry
continues to supply diagnostic scrubbing. No additional dependency is selected.
