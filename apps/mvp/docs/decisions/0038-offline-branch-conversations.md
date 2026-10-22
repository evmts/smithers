# Restore saved branch conversations offline

A branch route must retain the conversation identity the server verified. Previously
only the open tab kept that identity: reopening offline left chat at home while the
outbox correctly restored questions belonging to the branch. The Connection pill
therefore counted the home queue, and the branch's saved questions disappeared.

Keep a device-owned `branch-conversations` collection mapping a verified repository
and branch route to its conversation. Restore it when tracking cannot finish because
the shared connection is offline. This includes failed transport after a reload
even when the browser still reports online. This is core route state, using the library catalog's
`@smthrs/effect-tanstack-db` persisted collections and existing chat queries; it grants
no plugin or workspace capability. Register its schema in the device registry.

The saved conversation can be read offline, including queued questions. The cache
contains no branch grant: sharing, terminals and the composer wait for fresh tracking.
An unknown branch retains its public chrome only. A definitive missing, signed-out
or forbidden response removes the mapping; transient failures retain it. Device
ownership and sign-out apply to this collection as to all other saved app data.

On reconnection the existing route follower waits for the shared connection to
recover and tracks again; the server determines the
current conversation and access. No new retry mechanism or UI copy is introduced.
