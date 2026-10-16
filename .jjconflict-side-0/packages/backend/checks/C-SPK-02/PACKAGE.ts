import { Smithers } from "@smthrs/targets"

// T-MCH-02: the existing Python suites had no declared target. Keep their
// ownership beside the harness; no second test runner or VM harness is added.
const test = Smithers.Shell.Test({
  shell: "python3 -B packages/backend/checks/C-SPK-02/test-verdict.py && python3 -B packages/backend/checks/C-SPK-02/test-concurrent.py",
  data: [Smithers.glob("//packages/backend/checks/C-SPK-02/*")],
  timeout: "2m"
})

export const Package = Smithers.Package({ targets: { test } })
