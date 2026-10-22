---
"@smthrs/flow": minor
---

`ExternalJob`'s `run` records how long each wait in the step held its drive on `ExternalJob.stepWaits` (`flows_external_job_step_wait_ms`, by `job` and `outcome`: `collected`, `handed_off`, `interrupted`), and takes a `wait` of 0, which hands the work to the job at once.
