# @smthrs/flows

Rules for changing this package. User documentation lives in [`docs/`](docs/README.md).

## Database ownership

Use the current flow execution identity and existing durable stores for coding
plans, checks, results, waits and recovery. A product-specific projection may
have its own migration namespace in the injected database when existing stores
do not represent it. It must not create a separate connection, job queue,
command ledger or lease system to repeat the engine's responsibilities.

## Runtime parity: evidence and regression contract

`test/NativeRuntimeParity.test.ts` launches separate real Node and Bun processes.
A flow executes a recorded action and parks on a durable deferred; the other
runtime opens the same database, completes the deferred and resumes the flow.
Reopening it in the first runtime must not repeat that action. Both directions
are exercised on SQLite and, with `SMITHERS_TEST_PG_URL`, PostgreSQL. This is native Bun execution, not running Node through a Bun
package-manager shim.

The Node suite contains named regression cases for registration ordering,
ownership, process containment and signal cleanup. These sources describe test
coverage; they do not certify that a particular test run passed. Bun-specific host and database contract
coverage must be expanded alongside behavior changes. A Node sidecar is not a
compatibility solution: when a supported runtime cannot run a flow, repair its
injected platform implementation and add a regression scenario here.

The shared confined filesystem also has a native Node/Bun regression for
concurrent macOS developer-tool launches. This covers helper identity when
developer-tool entry points share a hard-linked inode: choosing a different
hard-link name can dispatch the wrong tool. The shared host resolves the interpreter's parent directory and
follows actual leaf symlinks while preserving a hard-linked executable's entry
name. Explicit configuration still uses `AtomicFileSystem.layerWith`; domain
flows do not choose interpreters. Preserve executable identity, workspace confinement,
environment isolation and process limits in the shared host layer for both
runtimes; do not recreate those policies inside domain flows.
