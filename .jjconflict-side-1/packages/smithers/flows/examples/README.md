# Durable runtime examples

Each example runs a flow on the durable Node engine over SQLite, through
`@smthrs/flows`. Its test is in `test/examples/`; run
`pnpm exec vitest run test/examples` in `packages/smithers/flows`.

## Inspecting parked runs

Examples 06 and 38 use `park-run.ts` before rewinding or monitoring a parked
execution. The helper drives the execution in a private engine layer and waits
for the journal's committed suspension record. Stopping that caller alone is not
enough: the record can reach the reader after the caller's automatic retry has
already admitted a new coordinator drive, and the coordinator owns its drives
separately. The helper therefore stops the caller to end retry admission and
then closes the private engine, whose scope joins every admitted drive. A
running drive would otherwise move a rewind's journal tail or count as progress
to a monitor. The helper requests no durable cancellation and confirms through
storage that the run is still suspended, so a later engine can resume it.
The monitor recognizes an explicit event wait as healthy, even beyond its stall
threshold. Example 38 verifies that neither opt-in recovery nor a zero-delay
alert policy resumes or pages about that expected wait.

## Host containment

`37-host-containment.ts` starts a host, kills it, and verifies that its
replacement reaps the abandoned process group. The runtime creates the SQLite
parent directory, which may also be the host's repository root. The jj version
probe can run before that directory exists.
Both hosts run that probe through the contained spawner, so the shared journal
also records its spawn and normal exit before and after the orphan's reaping.

The companion `37-host-containment-host.ts` prints its process group id only
after recording the child durably and after the child tree ignores SIGTERM. A
dead host's process owner stops its group with SIGTERM at once and holds it for
a 60-second grace period, so only the replacement's reaper can end this tree
within the example. Startup failures print the Effect cause to
stderr and exit with status 1. The example summary preserves `hostStderr`,
including Node runtime warnings such as an experimental-feature notice.
