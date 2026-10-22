---
"@smthrs/platform-browser": minor
---

A leader handover never runs a committed write of the shared database twice.

Every change a tab's request commits now carries the request's receipt in the
same SQLite transaction (`shared_sqlite_commits`). A transaction a request
opens is receipted at once, inside it. A write outside a transaction is
refused by SQLite's commit hook and runs again inside a transaction the leader
opens with the receipt, so all of the request commits or none of it does; a
read commits nothing and pays for no receipt. A new leader answers a tab's
first request outside a transaction as committed, with the rows it returned
(kept in `shared_sqlite_replies`), when its receipt names it. When it can't read the receipt, it commits nothing of the
request (`TransactionUndecided`) and still runs reads. A request that writes
outside a transaction and opens one of its own fails as a nested `BEGIN` does.

The commit hook also refuses a commit before a request's last statement, so a
request commits at most once; a rollback to a savepoint that takes the receipt
writes it again; SQLite's authorizer refuses a tab's statement that would
change the leader's tables, hang a trigger or an index on them, create a table
or view by their names or set `PRAGMA writable_schema`, and the leader names them as `main.` tables; replies keep
infinities; and a receipt is kept,
however old, until its tab's Web Lock comes free, instead of for a day.
