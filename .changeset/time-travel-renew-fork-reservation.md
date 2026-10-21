---
"@smthrs/time-travel": minor
---

Add `TimeTravelStore.renewForkIntent` and renew a fork's reservation immediately before provisioning its lane. A reclaimed reservation now fails `fence_lost` without adding a workspace, preventing a failed add with failed cleanup from stranding a lane after an earlier sweep recorded its intent forgotten.
