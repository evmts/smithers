# C-PRC-03 Check receipts required to close a ticket

Proves: mvp.md §12.1, M-29 · Layer: integration · Stage: S1 · Tickets: T-PRC-03
Automation: `node --test flows/evidence/check-receipts.test.mjs` · Runs in: CI

Folded into T-PRC-03's tests (minimal-code synthesis, 2026-10-03).
The production recorder and issue-close CLI use isolated GitHub transport and
real result artifact zips. The recorder executes no mapped command. The existing
`//flows:issueClaim` CI target includes this suite; its mapping remains
pending-owner until smithers-22 approves it and smithers-3f accepts the security
boundary. A passing local suite does not approve or activate a mapping.
