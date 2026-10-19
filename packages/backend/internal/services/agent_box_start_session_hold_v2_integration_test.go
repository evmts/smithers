package services

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A box start inside its session's turn holds its session's fence for its
// whole authorization transaction, including a 5 s provision. Writes to the
// session itself (a message append, the turn's end) never wait on it; a
// release does, and then revokes everything, the start's credentials included
// (G4 review of g3b: the session row lock held message appends for the whole
// provision).
func TestSessionWritesNeverWaitOnABoxStartButAReleaseDoes(t *testing.T) {
	const provision = 5 * time.Second
	for _, tc := range []struct {
		name  string
		op    func(t *testing.T, f *agentBoxRelease) error
		check func(t *testing.T, f *agentBoxRelease, waited time.Duration)
	}{
		{"a message append", func(t *testing.T, f *agentBoxRelease) error {
			_, err := f.agent.AppendMessage(context.Background(), f.session, "user",
				[]db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"more"}`)}})
			return err
		}, func(t *testing.T, _ *agentBoxRelease, waited time.Duration) {
			require.Less(t, waited, 500*time.Millisecond, "an append never waits on a start")
		}},
		{"the turn's end", func(t *testing.T, f *agentBoxRelease) error {
			_, err := f.pool.Exec(context.Background(), `UPDATE agent_sessions SET status='completed', finished_at=NOW() WHERE id=$1`, f.session)
			return err
		}, func(t *testing.T, _ *agentBoxRelease, waited time.Duration) {
			require.Less(t, waited, 500*time.Millisecond, "the session's end never waits on a start")
		}},
		{"a release", func(t *testing.T, f *agentBoxRelease) error {
			got, err := f.replicaB(t).ReleaseAgentWorkspace(context.Background(), f.workspace, f.session, f.run)
			t.Logf("release outcome %s %s", got.Outcome, got.Detail)
			return err
		}, func(t *testing.T, f *agentBoxRelease, waited time.Duration) {
			require.Greater(t, waited, 3*time.Second, "the release waits for the start")
			require.Less(t, waited, db.AgentBoxLockWait, "and is not refused busy")
			live, err := f.q.AgentBoxCredentialsLive(f.ctx, f.workspace, workspaceChildrenTokenName(f.workspace))
			require.NoError(t, err)
			require.False(t, live, "then revokes every credential, the start's included")
			for _, name := range []string{"head", "landing", "cache"} {
				require.False(t, f.tokenLive(t, name), "the %s token is revoked", name)
			}
		}},
		{"a turn-end finalize", func(t *testing.T, f *agentBoxRelease) error {
			return f.agent.ProjectFlowRuntime(context.Background(), f.update)
		}, nil},
		{"the turn-timeout reaper", func(t *testing.T, f *agentBoxRelease) error {
			session, err := f.q.GetAgentSession(context.Background(), f.session)
			if err != nil {
				return err
			}
			return f.agent.reapExpiredSession(context.Background(), session)
		}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			runtime := &slowStartRuntime{reapingBoxRuntime: f.reaper, delay: provision}
			f.boxes.runtime = runtime
			inTx := make(chan struct{})
			var once sync.Once
			f.boxes.agentBoxReleaseHook = func(point, id string) {
				if point == agentBoxAfterStartCheck && id == f.workspace {
					once.Do(func() {
						runtime.armed.Store(true)
						close(inTx)
					})
				}
			}
			repo := f.box(t).RepositoryID
			startDone := make(chan error, 1)
			go func() {
				_, err := f.boxes.ResumeWorkspace(context.Background(), f.workspace, repo, f.person)
				startDone <- err
			}()
			select {
			case <-inTx:
			case <-time.After(20 * time.Second):
				t.Fatal("the start never reached its dirty check")
			}
			time.Sleep(100 * time.Millisecond)

			opStart := time.Now()
			err := tc.op(t, f)
			waited := time.Since(opStart)
			startErr := <-startDone
			t.Logf("WAIT %s: waited=%s err=%v start err=%v (provision %s)", tc.name, waited.Round(time.Millisecond), err, startErr, provision)
			require.NoError(t, startErr, "the start inside its turn goes ahead")
			require.NoError(t, err)
			if tc.check != nil {
				tc.check(t, f, waited)
			}
		})
	}
}
