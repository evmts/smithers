# Command safety

Rejected checkout remotes produce a generic usage error. The diagnostic never
includes the rejected URL, including credentials, queries, or fragments.
`resolveRepo` honors `remoteName` independently of the optional host allowlist;
an absent or disallowed named remote cannot fall back to another remote.

A failed bug-report transport cannot establish whether the server received the
POST. The command reports that delivery could not be confirmed and the report
may have been sent. Explicitly declining consent still reports that it was not
sent. Reports are previewed and redacted before submission.

Claude node waiting applies one Effect timeout to the initial run lookup,
history reads, summary reads, and polling. Timeout interrupts an outstanding
read and produces the existing pending/timedOut document. After observing a
terminal run, it reads the final history suffix before reporting a node as
vanished. The bounded history and sequence cursor span both reads.

Control catalog listings share a budget of 50,000 retained entries and 16 MiB
of encoded data across flow items, distinct warnings, and continuation cursors.
Each is charged before retention. Repeated warnings remain deduplicated;
repeated cursors still fail explicitly. Empty pages consume cursor budget, so
fresh cursors cannot extend pagination indefinitely. Resource refusals use the
existing typed flow-listing error, including operation, subject, limit and unit;
no remote payload is included in that diagnostic.

The implementation uses the library catalog's `@smthrs/control` entry and
existing Effect services, without new dependencies. Command regressions use
fault injection through Control, TestClock for deadlines, the existing
synchronous Open Host seam for malformed remote inputs, and a real loopback
HTTP server that receives a synthetic POST then closes its socket. No report
is sent to an external service. `importRules` checks public imports on these
four command modules and forbids mocks and fixed waits in their command tests.
