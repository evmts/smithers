/** C-SPK-03 and C-SPK-07 measurements (T-COL-01) and local behavioral checks. */
import { Smithers } from "@smthrs/targets"
import { Package as backendPackage } from "../../../../packages/backend/PACKAGE.ts"

const data = [Smithers.glob("//apps/backend/checks/C-SPK-03-07/**"), backendPackage.buildInputs, Smithers.file("//go.mod"), Smithers.file("//go.sum")]
export const Package = Smithers.Package({
  targets: {
    /** The result writer's verdicts over fixture evidence; needs no VM or toolchain. */
    result: Smithers.NodeTest({
      runner: Smithers.testRunner([Smithers.file("//apps/backend/checks/C-SPK-03-07/result.test.mjs")]),
      srcs: [Smithers.file("//apps/backend/checks/C-SPK-03-07/result.mjs")],
      deps: []
    }),
    test: Smithers.Shell.Test({
      shell: "bash apps/backend/checks/C-SPK-03-07/test.sh",
      data,
      timeout: "20m",
      exclusive: true,
      hosts: ["darwin", "linux"]
    }),
    rtt: Smithers.Shell.Test({
      shell: "bash apps/backend/checks/C-SPK-03-07/run.sh rtt",
      data,
      timeout: "3h",
      exclusive: true,
      hosts: ["darwin"]
    }),
    keystrokes: Smithers.Shell.Test({
      shell: "bash apps/backend/checks/C-SPK-03-07/run.sh keystrokes",
      data,
      timeout: "3h",
      exclusive: true,
      hosts: ["darwin"]
    }),
    snapshot: Smithers.Shell.Test({
      shell: "bash apps/backend/checks/C-SPK-03-07/run.sh snapshot",
      data,
      timeout: "3h",
      exclusive: true,
      hosts: ["darwin"]
    })
  }
})
