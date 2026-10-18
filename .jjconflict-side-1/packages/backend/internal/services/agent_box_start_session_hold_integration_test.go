package services

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// slowStartRuntime is the box runtime whose first call after a start's dirty
// check (the provision: inspect, start or create) takes delay.
type slowStartRuntime struct {
	*reapingBoxRuntime
	armed atomic.Bool
	delay time.Duration
}

func (r *slowStartRuntime) slow() {
	if r.armed.CompareAndSwap(true, false) {
		time.Sleep(r.delay)
	}
}

func (r *slowStartRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	r.slow()
	return r.reapingBoxRuntime.InspectWorkspace(ctx, id)
}

func (r *slowStartRuntime) StartWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	r.slow()
	return r.reapingBoxRuntime.StartWorkspace(ctx, id)
}

func (r *slowStartRuntime) CreateWorkspace(ctx context.Context, spec workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
	r.slow()
	return r.reapingBoxRuntime.CreateWorkspace(ctx, spec)
}

// SESSION WRITES NEVER WAIT ON A BOX START (G4 review of g3b delta 3,
// inverted from its measurement). A box start inside its turn provisions for
// 5 s inside its authorization transaction (smithers#4347). It holds only its
// session's advisory lock, shared: a message append and the session's end
// each finish in under 500 ms, while a turn-end finalize's and the
// turn-timeout reaper's releases wait for the start, never longer than the
// lock wait before they would answer busy, and then revoke what it minted.
func TestSessionWritesNeverWaitOnABoxStart(t *testing.T) {
	const provision = 5 * time.Second
	for _, tc := range []struct {
		name    string
		bound   time.Duration
		release bool
		op      func(t *testing.T, f *agentBoxRelease) error
	}{
		{"a message append", 500 * time.Millisecond, false, func(t *testing.T, f *agentBoxRelease) error {
			_, err := f.agent.AppendMessage(context.Background(), f.session, "user",
				[]db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"more"}`)}})
			return err
		}},
		{"the session's end", 500 * time.Millisecond, false, func(t *testing.T, f *agentBoxRelease) error {
			_, err := f.pool.Exec(context.Background(), `UPDATE agent_sessions SET status = 'completed', finished_at = NOW() WHERE id = $1`, f.session)
			return err
		}},
		{"a turn-end finalize", db.AgentBoxLockWait + time.Second, true, func(t *testing.T, f *agentBoxRelease) error {
			return f.agent.ProjectFlowRuntime(context.Background(), f.update)
		}},
		{"the turn-timeout reaper", db.AgentBoxLockWait + time.Second, true, func(t *testing.T, f *agentBoxRelease) error {
			session, err := f.q.GetAgentSession(context.Background(), f.session)
			if err != nil {
				return err
			}
			return f.agent.reapExpiredSession(context.Background(), session)
		}},
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
			startErr := make(chan error, 1)
			go func() {
				_, err := f.boxes.ResumeWorkspace(context.Background(), f.workspace, repo, f.person)
				startErr <- err
			}()
			select {
			case <-inTx:
			case <-time.After(20 * time.Second):
				t.Fatal("the start never reached its dirty check")
			}

			opStart := time.Now()
			err := tc.op(t, f)
			waited := time.Since(opStart)
			require.NoError(t, <-startErr, "the start provisions and finishes")
			t.Logf("%s: waited=%s", tc.name, waited.Round(time.Millisecond))
			require.NoError(t, err, tc.name)
			require.Less(t, waited, tc.bound, "%s waited on the start", tc.name)
			if tc.release {
				live, err := f.q.AgentBoxCredentialsLive(f.ctx, f.workspace, workspaceChildrenTokenName(f.workspace))
				require.NoError(t, err)
				require.False(t, live, "the release, after the start, revoked what it minted")
			}
		})
	}
}
