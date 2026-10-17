import { Smithers } from "@smthrs/targets"

// sqlc owns product row models; the backend suite regenerates and compiles them.
// The root package registers this as `//:backendSQLC`, beside the suites that
// put `.backend-sqlc` on PATH.
export const backendSQLC = Smithers.Shell.Build({
  shell: "GOBIN=\"$PWD/.backend-sqlc\" go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0",
  outDirs: ["//.backend-sqlc"],
  data: [Smithers.file("//go.mod")],
  sandbox: { network: true },
  timeout: "15m"
})
