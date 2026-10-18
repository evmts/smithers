package services

import (
	"errors"
	"slices"
	"testing"

	"github.com/stretchr/testify/require"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// The head reporter runs jj and git in the box's checkout as the developer,
// with the network, outside the offline facet the turn's test runs in. A
// quiesce stops it and reads it back as stopped, so a .git or .jj config the
// test planted never runs there (Security d-w8ycrp).
func TestAQuiesceStopsTheHeadReporter(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	require.True(t, f.hosted.running[workspaceHeadReporterService], "the turn's reporter runs before the quiesce")

	// As the coding turn's observer calls it: the session still holds its run.
	quiesce, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)

	require.NoError(t, err)
	require.Equal(t, agentWorkspaceQuiesced, quiesce.Outcome)
	require.True(t, quiesce.Quiesced)
	require.Empty(t, quiesce.Detail)
	require.Contains(t, f.hosted.stopped, workspaceHeadReporterService)
	require.False(t, f.hosted.running[workspaceHeadReporterService], "the reporter reads back as stopped")
	require.False(t, f.box(t).HeadPushTokenID.Valid)
}

// A reporter the quiesce cannot confirm stopped leaves the box unquiesced:
// it is named, and the guest stays dirty for its retirement (G4: Quiesced
// only when everything is confirmed).
func TestAQuiesceThatCannotStopTheHeadReporterIsNotClean(t *testing.T) {
	for name, fail := range map[string]func(*hostedBoxRuntime){
		"stop fails": func(r *hostedBoxRuntime) {
			r.stopErrs = map[string]error{workspaceHeadReporterService: errors.New("guest agent unreachable")}
		},
		"still running after its stop": func(r *hostedBoxRuntime) {
			r.stuck = map[string]bool{workspaceHeadReporterService: true}
		},
	} {
		t.Run(name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			fail(f.hosted)

			quiesce, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)

			require.NoError(t, err)
			require.Equal(t, agentWorkspaceKeptDirty, quiesce.Outcome)
			require.False(t, quiesce.Quiesced)
			require.Contains(t, quiesce.Detail, "head reporter "+workspaceHeadReporterService+" still running")
			require.Equal(t, "vm-agent-box", f.box(t).AgentBoxDirtyVmID, "the guest stays dirty")
			require.False(t, f.box(t).HeadPushTokenID.Valid, "its head token is revoked all the same")
		})
	}
}

// The coding turn's test never runs beside a head reporter it could not
// confirm stopped.
func TestCodingResultNeverRunsBesideALiveHeadReporter(t *testing.T) {
	for name, fail := range map[string]func(*hostedBoxRuntime){
		"stop fails": func(r *hostedBoxRuntime) {
			r.stopErrs = map[string]error{workspaceHeadReporterService: errors.New("guest agent unreachable")}
		},
		"still running after its stop": func(r *hostedBoxRuntime) {
			r.stuck = map[string]bool{workspaceHeadReporterService: true}
		},
	} {
		t.Run(name, func(t *testing.T) {
			f := newCodingResultFixture(t, map[string]string{codingProjectPath: codingProject("true")})
			fail(f.hosted)
			requireNotRun(t, f.result(t), codingTestNotRunBoxNotQuiesced)
			require.Empty(t, f.rt.runs, "agent code never runs beside a live head reporter")
		})
	}
}

// Nothing starts the reporter again on a quiesced box's guest before it
// retires: not a start's reconcile, not a coding host's repair, not the
// sweep. Each would mint a head token and run jj and git in a checkout the
// test may have written.
func TestAQuiescedBoxsHeadReporterStaysStoppedUntilItRetires(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	quiesce, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)
	require.NoError(t, err)
	require.True(t, quiesce.Quiesced)
	tokens := func() int {
		var n int
		require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT count(*) FROM access_tokens WHERE name=$1`, "sandbox-workspace-"+f.workspace).Scan(&n))
		return n
	}
	minted := tokens()

	// A start's reconcile of the running box (ensureRuntimeWorkspaceRunning).
	observed := workspaceapi.Workspace{ID: f.workspace, State: workspaceapi.WorkspaceRunning, Home: "/home/developer", Root: "/workspace/repo"}
	row := f.boxes.ensureRuntimeWorkspaceHeadReporter(f.ctx, f.box(t), f.person, observed)
	require.False(t, row.HeadPushTokenID.Valid)
	// A coding host's binding repairs the reporter it needs; it is refused.
	_, err = f.boxes.repairRuntimeWorkspaceHeadReporter(f.ctx, f.box(t), f.person)
	require.ErrorContains(t, err, "quiesced until it retires")
	// The sweep.
	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

	require.False(t, slices.Contains(f.hosted.started, workspaceHeadReporterService), "no reporter was started again")
	require.False(t, f.hosted.running[workspaceHeadReporterService])
	require.False(t, f.box(t).HeadPushTokenID.Valid, "the box names no head token")
	require.Equal(t, minted, tokens(), "no head token was minted")
}
