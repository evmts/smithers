# Writer acquisition timing

`DatabaseMetrics.tally` records summed `lockWait` and the longest individual
`maxLockWait`. Both measure client-side acquisition: outer transactions
include BEGIN, lock statements, any retries/backoff and network transport;
savepoint lock additions contribute too. They do not measure lock hold time.

Use the maximum to distinguish one slow acquisition from many short ones.
A large sum alone does not prove a blocked writer. The scope counts actual
outer transactions and schema-wide acquisitions, including inherited child
fibers and nested tallies. Read-only clients and SQLite report zero.

The retained benchmark in `test/PostgresPooling.test.ts` performs 101 real
inserts under one run partition with no competing writer. A real TCP proxy
adds 20 ms each way. It verifies every returned id, the stored count and sum.
The [Latitude receipt](benchmarks/acquisition-transport-2026-10-22.json)
records 8,230 ms summed acquisition and 82 ms maximum on direct Postgres;
PgBouncer records 8,278 ms and 86 ms. These are single observations, not
percentiles, and are not production measurements. They demonstrate how a
multi-second aggregate can arise entirely without a competing writer.

Run the package's `pnpm coverage` matrix; the benchmark is part of that
suite, with elapsed time reported and correctness/count assertions gated.
