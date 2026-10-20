---
"@smthrs/platform-browser": patch
---

The shared SQLite commits a tab's transaction exactly once across a leader
handover. The leader's record of a tab's transaction now fails closed:

- When the leader can't write the record, it rolls the transaction back and
  the statement that opened it fails with `TransactionUnrecorded`. Before, it
  kept the unrecorded transaction, and a COMMIT the old leader made just
  before it ended was run again by the next leader.
- When the next leader can't read the record, the statement fails with
  `TransactionUndecided` and runs nothing; the tab's next statement asks
  again. Before, an unreadable record counted as absent, and the tab replayed
  a transaction that may have committed.
- A leader that can't create the record's table logs `outcome: "unprepared"`
  and still serves: reads and single statements run, and every statement that
  opens a transaction fails until the table can be written.

`browser_runtime_statements` and the `browser.runtime.statement` line count
the new outcomes as `unrecorded` and `undecided`.
