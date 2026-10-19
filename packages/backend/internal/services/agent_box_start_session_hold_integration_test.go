package services

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"


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

// MEASUREMENT (G4 review of g3b delta 3): how long session writes wait while
// a box start inside its turn provisions for 5 s. The start's authorization
// transaction holds the session row FOR SHARE from its dirty check until it
// commits, after the provision.
func TestSessionWritesWaitWhileABoxStartProvisions(t *testing.T) {
	const provision = 5 * time.Second
	for _, tc := range []struct {
		name string
		op   func(t *testing.T, f *agentBoxRelease) error
	}{
		{"a message append", func(t *testing.T, f *agentBoxRelease) error {
			_, err := f.agent.AppendMessage(context.Background(), f.session, "user",
				[]db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"more"}`)}})
			return err
		}},
		{"a turn-end finalize", func(t *testing.T, f *agentBoxRelease) error {
			return f.agent.ProjectFlowRuntime(context.Background(), f.update)
		}},
		{"the turn-timeout reaper", func(t *testing.T, f *agentBoxRelease) error {
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
			startDone := make(chan time.Duration, 1)
			startedAt := time.Now()
			go func() {
				_, err := f.boxes.ResumeWorkspace(context.Background(), f.workspace, repo, f.person)
				if err != nil {
					t.Logf("start: %v", err)
				}
				startDone <- time.Since(startedAt)
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
			startTook := <-startDone
			t.Logf("WAIT %s: waited=%s err=%v (start took %s, provision %s)", tc.name,
				waited.Round(time.Millisecond), err, startTook.Round(time.Millisecond), provision)
		})
	}
}
