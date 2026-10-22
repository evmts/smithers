---
"@smthrs/engine-store": patch
---

A drive that steals a running run first releases the claim a dead stealer
left on it, as a claim of a parked run already was. A process that died
between `steal` and `activate` used to leave its claim on the running row, and
every later steal lost to it with `AlreadyClaimed`: on Cloudflare the
execution's alarm retried `Undriven` every five minutes, for hours. The
`stolen-and-activated` decision records the released claim as
`recoveredClaim`.
