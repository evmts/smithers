package services

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A QUIESCED AGENT BOX IS RETIRED AFTER ITS IDLE CAP (PM d-kebcxw). A box kept
// running between turns bills its payer, or a free visitor's daily sandbox
// hours, for every awake second with no bound. Hosted cannot wake a slept box
// (plue#862), so an idle box is retired: its guest and disk are deleted, its
// usage stops, and the next turn builds a new box from the branch head the
// old one recorded.

// publishedHeads is the repo host's branch-head advertisement: each box's
// recorded head published at refs/smithers/branches/<id>/head.
type publishedHeads struct {
	workspaceSnapshotStore
	heads map[string]string
}

func (h publishedHeads) InfoRefsUploadPack(context.Context, string, string) ([]byte, error) {
	var b bytes.Buffer
	for id, head := range h.heads {
		writePktLine(&b, head+" "+repohost.BranchHeadRef(id)+"\n")
	}
	b.WriteString("0000")
	return b.Bytes(), nil
}

func (h publishedHeads) GetChange(_ context.Context, _, _, commit string) (repohost.Change, error) {
	return repohost.Change{CommitID: commit}, nil
}

const idleCapTestHead = "0123456789abcdef0123456789abcdef01234567"

// idleBox is the release fixture after one finished turn whose head was not
// yet published when the turn ended, so its release kept the box with its
// guest dirty, left idle past the cap. published says whether the head has
// published since.
func idleBox(t *testing.T, published bool) *agentBoxRelease {
	t.Helper()
	attempts := agentBoxHeadVerifyAttempts
	agentBoxHeadVerifyAttempts = 1
	t.Cleanup(func() { agentBoxHeadVerifyAttempts = attempts })
	f := newAgentBoxRelease(t, "running")
	_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, f.workspace, idleCapTestHead)
	require.NoError(t, err)
	f.boxes.branchHeads = publishedHeads{heads: map[string]string{}}
	f.finish(t)
	require.Contains(t, f.releaseLog(t), "outcome=kept_dirty")
	_, err = f.pool.Exec(f.ctx, `UPDATE workspaces SET last_activity_at=NOW()-interval '20 minutes' WHERE id=$1`, f.workspace)
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET finished_at=NOW()-interval '20 minutes' WHERE workspace_id=$1`, f.workspace)
	require.NoError(t, err)
	meterSandboxUsage(f.ctx, f.q, f.machines, "workspace", f.workspace, true)
	heads := map[string]string{}
	if published {
		heads[f.workspace] = idleCapTestHead
	}
	f.boxes.branchHeads = publishedHeads{heads: heads}
	f.hosted.head = idleCapTestHead
	f.boxes.agentBoxIdleCap = 15 * time.Minute
	return f
}

func (f *agentBoxRelease) openUsageIntervals(t *testing.T) (open, total int) {
	t.Helper()
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT count(*) FILTER (WHERE ended_at IS NULL), count(*) FROM sandbox_usage_intervals
		WHERE sandbox_kind='workspace' AND sandbox_id=$1`, f.workspace).Scan(&open, &total))
	return open, total
}

func TestAnAgentBoxIdlePastItsCapIsRetiredAndStopsAccruing(t *testing.T) {
	f := idleBox(t, true)
	open, _ := f.openUsageIntervals(t)
	require.Equal(t, 1, open, "the awake box is metered")

	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

	require.Equal(t, int32(1), f.runtime.deletes.Load(), "the guest and its disk are deleted, not slept")
	box := f.box(t)
	require.Equal(t, "suspended", box.Status)
	require.Empty(t, box.VmID, "no guest remains")
	require.True(t, box.DiskReclaimedAt.Valid, "the next box rebuilds from the recorded head")
	require.Equal(t, db.AgentBoxRetiredStage, box.ProvisioningStage, "the reason is recorded")
	require.Equal(t, idleCapTestHead, box.HeadCommitID)
	require.False(t, box.HeadPushTokenID.Valid)
	f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
	open, total := f.openUsageIntervals(t)
	require.Zero(t, open, "a retired box accrues no awake time")
	require.Contains(t, f.logs.String(), `msg="agent box retired after its idle cap"`)

	// A later sweep finds nothing to retire and opens no new interval.
	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
	require.Equal(t, int32(1), f.runtime.deletes.Load())
	open, again := f.openUsageIntervals(t)
	require.Zero(t, open)
	require.Equal(t, total, again, "no usage interval after retirement")
}

// The next change on the repository gets a working box through the session
// path and its turn reaches the coding host: the same session's box rebuilt
// from the previous head, a new session's box of its own (plue#869). Nothing
// is refused.
func TestTheNextChangeAfterRetirementGetsANewBoxAtThePreviousHead(t *testing.T) {
	f := idleBox(t, true)
	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
	box := f.box(t)

	for i, name := range []string{"same session", "new session"} {
		t.Run(name, func(t *testing.T) {
			sessionID := f.session
			if name == "new session" {
				session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: box.RepositoryID, UserID: f.person, Title: "after retirement"})
				require.NoError(t, err)
				sessionID = session.ID
			}
			definition, err := f.q.UpsertAgentWorkflowDefinition(f.ctx, box.RepositoryID)
			require.NoError(t, err)
			run, err := f.q.CreateWorkflowRun(f.ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
				TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
			require.NoError(t, err)
			claimed, err := f.q.ClaimAgentSessionForDispatch(f.ctx, sessionID, run.ID)
			require.NoError(t, err)
			require.True(t, claimed)
			slug, err := f.q.GetRepoOwnerSlugAndNameByID(f.ctx, box.RepositoryID)
			require.NoError(t, err)

			joined, err := f.boxes.CreateAgentWorkspace(f.ctx, CreateAgentWorkspaceInput{RepositoryID: box.RepositoryID, UserID: f.person,
				SessionID: sessionID, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName})
			require.NoError(t, err, "the dispatch gets a working box, never a refusal")
			if i == 0 {
				require.Equal(t, box.ID, joined.WorkspaceID, "the session's own box")
			} else {
				require.NotEqual(t, box.ID, joined.WorkspaceID, "a new session's box of its own")
			}
			require.Equal(t, i+1, f.hosted.creates, "each turn after retirement gets a new guest")
			require.Zero(t, f.hosted.starts, "the new box is created, not woken")
			current, err := f.q.GetWorkspace(f.ctx, joined.WorkspaceID)
			require.NoError(t, err)
			require.Equal(t, "running", current.Status)
			require.NotEmpty(t, current.VmID)
			require.False(t, current.DiskReclaimedAt.Valid, "the rebuild is complete")
			require.True(t, current.HeadPushTokenID.Valid, "the new box publishes with a fresh head token")
			if i == 0 {
				var fetched, checkedOut, worked bool
				for _, args := range f.hosted.commands {
					joinedArgs := strings.Join(args, " ")
					fetched = fetched || strings.HasPrefix(joinedArgs, "git fetch") && strings.HasSuffix(joinedArgs, repohost.BranchHeadRef(box.ID))
					checkedOut = checkedOut || joinedArgs == "git checkout --detach "+idleCapTestHead
					worked = worked || joinedArgs == "jj new "+idleCapTestHead
				}
				require.True(t, fetched, "the new box fetches the recorded branch head")
				require.True(t, checkedOut, "and checks it out")
				require.True(t, worked, "and its working copy starts on the previous turn's head")
			}

			dispatcher := &recordingAgentFlowDispatcher{}
			f.agent.flowDispatcher = dispatcher
			payload, err := json.Marshal(agentTaskPayload{MessageHistory: []agentTaskPayloadMessage{{Role: "user", Content: "fix the test"}}})
			require.NoError(t, err)
			d := &agentDispatch{svc: f.agent, ctx: f.ctx, payload: payload,
				input: DispatchAgentRunInput{SessionID: sessionID, RepositoryID: box.RepositoryID, UserID: f.person, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName}}
			d.run.ID = run.ID
			require.NoError(t, d.admitCodingTurn())
			require.Len(t, dispatcher.launches, 1, "the turn reaches the coding host")
			f.agent.flowDispatcher = nil
		})
	}
}

func TestABoxWithATurnInProgressIsNeverRetired(t *testing.T) {
	f := idleBox(t, true)
	definition, err := f.q.UpsertAgentWorkflowDefinition(f.ctx, f.box(t).RepositoryID)
	require.NoError(t, err)
	run, err := f.q.CreateWorkflowRun(f.ctx, db.CreateWorkflowRunParams{RepositoryID: definition.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "running",
		TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
	require.NoError(t, err)
	claimed, err := f.q.ClaimAgentSessionForDispatch(f.ctx, f.session, run.ID)
	require.NoError(t, err)
	require.True(t, claimed, "a turn is in progress on the box")

	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

	require.Zero(t, f.runtime.deletes.Load())
	require.Equal(t, "running", f.box(t).Status)
	open, _ := f.openUsageIntervals(t)
	require.Equal(t, 1, open)
}

// A head the repo host has not published is work the next box could not
// restore, so the box is kept and the reason logged.
func TestABoxWhoseHeadIsUnpublishedIsKept(t *testing.T) {
	f := idleBox(t, false)

	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

	require.Zero(t, f.runtime.deletes.Load())
	require.Equal(t, "running", f.box(t).Status)
	require.Contains(t, f.logs.String(), "outcome=kept_head_unverified")
}

func TestTheIdleCapIsConfigurableAndZeroDisablesIt(t *testing.T) {
	t.Run("zero disables it", func(t *testing.T) {
		f := idleBox(t, true)
		WithAgentBoxIdleCap(0)(f.boxes)
		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
		require.Zero(t, f.runtime.deletes.Load())
		require.Equal(t, "running", f.box(t).Status)
	})
	t.Run("a cap longer than the idle time keeps the box", func(t *testing.T) {
		f := idleBox(t, true)
		WithAgentBoxIdleCap(time.Hour)(f.boxes)
		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
		require.Zero(t, f.runtime.deletes.Load())
	})
	t.Run("a cap shorter than the idle time retires it", func(t *testing.T) {
		f := idleBox(t, true)
		WithAgentBoxIdleCap(10 * time.Minute)(f.boxes)
		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
		require.Equal(t, int32(1), f.runtime.deletes.Load())
	})
	t.Run("an install leaves idle boxes to its machine lifecycle", func(t *testing.T) {
		f := idleBox(t, true)
		f.boxes.EnableMachineAdmission(nil)
		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
		require.Zero(t, f.runtime.deletes.Load())
	})
}

var _ workspaceapi.WorkspaceRepositoryReceiptWriter = (*hostedBoxRuntime)(nil)
