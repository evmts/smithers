package main

import (
	"context"
	"os"
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowhost"
)

// Invoked only by the external-process claim harness. The install entry point
// already supports this programmatic test configuration; production cannot
// opt into process isolation by environment. No coding work runs in this test.
func TestOwnerClaimProcessHelper(t *testing.T) {
	if os.Getenv("SMITHERS_ACC_CLAIM_PROCESS_TEST") != "1" {
		return
	}
	if err := run(context.Background(), nil, flowhost.WorkspaceLauncherConfig{AllowTrustedProcessForTests: true}); err != nil {
		t.Fatal(err)
	}
}
