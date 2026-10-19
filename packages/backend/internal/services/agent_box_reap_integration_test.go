package services

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A RUN'S PROCESSES DO NOT SURVIVE INTO THE NEXT TURN (Security s-3fffpl,
// plue#866). A quiesced box keeps running, so a process a prompt-injected run
// started in turn N (a backgrounded command, a cron entry, a watcher of a
// token file) could read the fresh credentials turn N+1 mints. The box is
// reused only when the runtime confirms every run process ended; otherwise it
// is retired and rebuilt from its recorded head, and a box neither reaped nor
// retired mints nothing.
//
// The guest is simulated: the double keeps the box's process table, and a
// live "reader" captures every service a credential is minted for.

// nextTurn admits a second change request on the box through the session
// path, as the dispatch does, and answers the join's error.
func (f *agentBoxRelease) nextTurn(t *testing.T) error {
	t.Helper()
	box := f.box(t)
	definition, err := f.q.UpsertAgentWorkflowDefinition(f.ctx, box.RepositoryID)
	require.NoError(t, err)
	run, err := f.q.CreateWorkflowRun(f.ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
		TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
	require.NoError(t, err)
	claimed, err := f.q.ClaimAgentSessionForDispatch(f.ctx, f.session, run.ID)
	require.NoError(t, err)
	require.True(t, claimed)
	slug, err := f.q.GetRepoOwnerSlugAndNameByID(f.ctx, box.RepositoryID)
	require.NoError(t, err)
	_, err = f.boxes.CreateAgentWorkspace(f.ctx, CreateAgentWorkspaceInput{RepositoryID: box.RepositoryID, UserID: f.person,
		SessionID: f.session, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName})
	return err
}

func TestQuiesceEndsTheRunsProcessesBeforeTheNextTurnMints(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.hosted.processes["reader"] = true // turn 1 left a background reader

	f.finish(t)

	require.Equal(t, 1, f.reaper.reaped, "the runtime ends the run's processes at quiesce")
	require.False(t, f.hosted.processes["reader"], "the reader is gone")
	require.True(t, f.hosted.processes["relay"], "the box's relay survives")
	require.True(t, f.hosted.processes["supervisor"], "the box's agent supervisor survives")
	require.Contains(t, f.releaseLog(t), "outcome=quiesced")

	require.NoError(t, f.nextTurn(t))
	require.True(t, f.box(t).HeadPushTokenID.Valid, "turn 2 mints its head token")
	require.Empty(t, f.hosted.captured, "the reader captured nothing")
}

// A runtime that cannot confirm the reap never has its box reused: the box is
// retired at turn end, and turn 2 gets a new box rebuilt from the head.
func TestABoxWhoseRunProcessesCannotBeReapedIsRetiredBeforeTheNextTurn(t *testing.T) {
	for _, name := range []string{"no reaper", "reap failed"} {
		t.Run(name, func(t *testing.T) {
			f := newAgentBoxReleaseWith(t, "running", name == "reap failed")
			if f.reaper != nil {
				f.reaper.reapErr = errors.New("guest agent unreachable")
			}
			_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, f.workspace, idleCapTestHead)
			require.NoError(t, err)
			f.boxes.branchHeads = publishedHeads{heads: map[string]string{f.workspace: idleCapTestHead}}
			f.hosted.head = idleCapTestHead
			f.hosted.processes["reader"] = true

			f.finish(t)

			require.Equal(t, int32(1), f.runtime.deletes.Load(), "the box is not reused")
			require.False(t, f.hosted.processes["reader"], "the reader went with the box")
			box := f.box(t)
			require.Equal(t, "suspended", box.Status)
			require.Equal(t, db.AgentBoxRetiredStage, box.ProvisioningStage)
			require.Contains(t, f.releaseLog(t), "outcome=retired")

			require.NoError(t, f.nextTurn(t), "turn 2 gets a new box, never a refusal")
			require.Equal(t, 1, f.hosted.creates)
			require.True(t, f.hosted.processes["relay"])
			require.True(t, f.hosted.processes["supervisor"])
			require.True(t, f.box(t).HeadPushTokenID.Valid)
			require.Empty(t, f.hosted.captured, "the reader captured nothing")
		})
	}
}

// A box that can be neither reaped nor retired (its head is not published)
// is kept but mints nothing: turn 2 is refused, retryably, and the reader
// never sees a credential.
func TestAnUnreapedBoxWithAnUnpublishedHeadMintsNothing(t *testing.T) {
	agentBoxHeadVerifyAttempts = 1
	t.Cleanup(func() { agentBoxHeadVerifyAttempts = 4 })
	f := newAgentBoxReleaseWith(t, "running", false)
	f.hosted.processes["reader"] = true

	f.finish(t)

	require.Zero(t, f.runtime.deletes.Load())
	box := f.box(t)
	require.Equal(t, "running", box.Status)
	require.Equal(t, db.AgentBoxUnreapedStage, box.ProvisioningStage)
	require.False(t, box.HeadPushTokenID.Valid)
	require.Contains(t, f.releaseLog(t), "outcome=quiesced_unreaped")

	err := f.nextTurn(t)
	require.Error(t, err, "turn 2 is refused until the box is reaped or retired")
	require.Contains(t, err.Error(), "still being cleaned")
	require.False(t, f.box(t).HeadPushTokenID.Valid, "nothing was minted")
	require.Empty(t, f.hosted.captured, "the reader captured nothing")

	// Once the head is published, the next attempt retires the box and the
	// turn proceeds on a new one.
	_, err = f.pool.Exec(context.Background(), `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, f.workspace, idleCapTestHead)
	require.NoError(t, err)
	f.boxes.branchHeads = publishedHeads{heads: map[string]string{f.workspace: idleCapTestHead}}
	f.hosted.head = idleCapTestHead
	// The refused turn's run settles as the dispatch failure records it.
	_, err = f.pool.Exec(f.ctx, `UPDATE workflow_runs SET status='failure' WHERE repository_id=$1 AND status IN ('queued','running')`, box.RepositoryID)
	require.NoError(t, err)
	require.NoError(t, f.nextTurn(t))
	require.Equal(t, int32(1), f.runtime.deletes.Load())
	require.Equal(t, 1, f.hosted.creates)
	require.Empty(t, f.hosted.captured)
}
