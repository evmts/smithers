package services

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A REFUSED ASYNCHRONOUS CLAIM LEAVES A RECORD (plue#839).
//
// provisionWorkspaceAsyncWithStart used to return on any in-progress error
// without a trace, so a create the claim gate refused every five seconds for
// days left the row's stage and updated_at untouched and nothing in the logs.
// It now logs one finite line per row per change of stage and reason. A claim
// another claimant holds is provisioning, not refused, and logs nothing.
func TestAsyncProvisionRefusalLeavesOneRecordPerChange(t *testing.T) {
	records, restore := captureMemberAddRecords(t)
	defer restore()
	svc := &WorkspaceService{provisionTasks: newWorkspaceProvisionTasks()}
	workspace := db.Workspace{ID: "6a1f0c52-2d0e-4b8e-9d6f-8f0c839a0001", Status: "starting"}

	headroom := workspaceProvisionInProgress(workspaceProvisionClaimStall{
		stage: interruptedReleaseStageAcquireConnection, cause: errCorePoolHeadroom})
	slot := workspaceProvisionInProgress(workspaceProvisionClaimStall{
		stage: interruptedReleaseStageAwaitClaimSlot, cause: context.DeadlineExceeded})
	contended := workspaceProvisionInProgress(nil)

	drive := func(err error) {
		t.Helper()
		svc.provisionWorkspaceAsyncWithStart(context.Background(), workspace, CreateWorkspaceSessionInput{},
			func(context.Context, db.Workspace, CreateWorkspaceSessionInput) (db.Workspace, error) {
				return workspace, err
			})
		waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		require.NoError(t, svc.WaitForProvisioning(waitCtx))
	}
	lines := func() []string {
		var refused []string
		for _, line := range strings.Split(records.String(), "\n") {
			if strings.Contains(line, "async workspace provisioning refused") {
				refused = append(refused, line)
			}
		}
		return refused
	}

	for range 3 {
		drive(headroom)
	}
	require.Len(t, lines(), 1, "a repeated refusal logged more than once, or not at all")
	require.Contains(t, lines()[0], "stage=acquire_connection")
	require.Contains(t, lines()[0], "reason=core_pool_exhausted")
	require.Contains(t, lines()[0], "workspace="+workspaceCorrelationToken(workspace.ID))
	require.NotContains(t, records.String(), workspace.ID, "the record carries the row's identifier")

	drive(slot)
	require.Len(t, lines(), 2, "a refusal at a new stage left no record")
	require.Contains(t, lines()[1], "stage=await_claim_slot")
	require.Contains(t, lines()[1], "reason=deadline_exceeded")

	drive(contended)
	require.Len(t, lines(), 2, "a claim another claimant holds was logged as refused")

	// After any other outcome the next refusal is a change again.
	drive(slot)
	require.Len(t, lines(), 3)
	drive(nil)
	drive(slot)
	require.Len(t, lines(), 4, "a refusal after a start went unrecorded")
}

// A row deleted while refused is never forgotten by an outcome, so the memory
// is bounded: past the cap it starts over rather than growing with every row.
func TestAsyncProvisionRefusalMemoryIsBounded(t *testing.T) {
	var refusals asyncProvisionRefusals
	refusal := interruptedReleaseStopOutcome{stage: interruptedReleaseStageAcquireConnection, reason: interruptedReleaseReasonPoolExhausted}
	for i := range 3 * asyncProvisionRefusalsCap {
		require.True(t, refusals.changed(fmt.Sprintf("row-%d", i), refusal))
	}
	require.LessOrEqual(t, len(refusals.last), asyncProvisionRefusalsCap)
	last := fmt.Sprintf("row-%d", 3*asyncProvisionRefusalsCap-1)
	require.False(t, refusals.changed(last, refusal), "the newest refusal was forgotten")
	refusals.forget(last)
	require.True(t, refusals.changed(last, refusal))
}
