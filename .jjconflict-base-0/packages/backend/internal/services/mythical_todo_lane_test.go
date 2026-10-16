package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/microsandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// launchOn is the last launch of flowID on workspaceID.
func (o *mythicalOrchestration) launchOn(flowID, workspaceID string) flowdispatch.LaunchRequest {
	o.t.Helper()
	var found flowdispatch.LaunchRequest
	for _, request := range o.launcher.byFlow(flowID) {
		if request.Target.WorkspaceID == workspaceID {
			found = request
		}
	}
	require.NotEmpty(o.t, found.RequestID, "no %s launch on %s", flowID, workspaceID)
	return found
}

// A TODO's lane is its own branch machine (T-MCH-04): two TODOs work on two
// lanes at once, and a TODO's fresh attempt, after any failure, runs again on
// the lane it holds. Nothing is provisioned or retired for the retry, and the
// other TODO's lane is untouched.
func TestTodoLanesAreTheirOwnAndARetryKeepsIt(t *testing.T) {
	for _, tc := range []struct{ name, fault, tag string }{
		{name: "plan failed", fault: "factory", tag: "coding/Error/fast_gate"},
		{name: "infrastructure", fault: "infra", tag: "flows/InfraInterrupt"},
		{name: "provider quota", fault: "wait", tag: "flows/model/ModelError/quota_exceeded"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			o, session := newTodoAdmission(t)
			ctx := context.Background()
			first := uuidString(o.fileTodo(session, "first").ID)
			second := uuidString(o.fileTodo(session, "second").ID)
			o.wake()
			one, two := o.byID(first), o.byID(second)
			require.Equal(t, "running", one.State, one.Reason)
			require.Equal(t, "running", two.State, two.Reason)
			require.NotEmpty(t, one.WorkspaceID)
			require.NotEmpty(t, two.WorkspaceID)
			require.NotEqual(t, one.WorkspaceID, two.WorkspaceID, "each TODO gets its own lane")
			require.Len(t, o.lanes.created, 2)

			o.fail(o.launchOn("coding/request", one.WorkspaceID), "run-first-1", tc.fault, tc.tag, "")
			o.wake()
			failed := o.byID(first)
			require.Equal(t, "retrying", failed.State, failed.Reason)
			_, err := o.pool.Exec(ctx, `UPDATE mythical_items SET next_attempt_at = NOW() - INTERVAL '1 minute' WHERE repository_id = $1`, o.repoID)
			require.NoError(t, err)
			o.wake()
			retried := o.byID(first)
			require.Equal(t, "running", retried.State, retried.Reason)
			assert.Equal(t, one.WorkspaceID, retried.WorkspaceID, "the TODO's own lane runs it again")
			assert.Equal(t, one.Generation+1, retried.Generation, "the retry is a new launch")
			assert.Len(t, o.lanes.created, 2, "no lane is provisioned")
			assert.Empty(t, o.lanes.deleted, "no lane is retired")
			assert.Equal(t, two.WorkspaceID, o.byID(second).WorkspaceID)
			assert.Len(t, o.launcher.byFlow("coding/request"), 3)
			o.launchOn("coding/request", one.WorkspaceID)
		})
	}
}

// A TODO whose lane was retired while it waited gets a fresh lane of its own.
func TestTodoRetryOpensANewLaneWhenItsLaneIsRetired(t *testing.T) {
	o, session := newTodoAdmission(t)
	ctx := context.Background()
	id := uuidString(o.fileTodo(session, "first").ID)
	o.wake()
	first := o.byID(id)
	require.Equal(t, "running", first.State, first.Reason)
	o.fail(o.launchOn("coding/request", first.WorkspaceID), "run-first-1", "factory", "coding/Error/fast_gate", "")
	o.wake()
	_, err := o.pool.Exec(ctx, `UPDATE mythical_lanes SET retired_at = NOW() WHERE workspace_id = $1`, first.WorkspaceID)
	require.NoError(t, err)
	_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET next_attempt_at = NOW() - INTERVAL '1 minute' WHERE repository_id = $1`, o.repoID)
	require.NoError(t, err)
	o.wake()
	second := o.byID(id)
	require.Equal(t, "running", second.State, second.Reason)
	assert.NotEqual(t, first.WorkspaceID, second.WorkspaceID)
	assert.Len(t, o.lanes.created, 2)
}

// A completed historical run releases its coding lane. A live composition
// retains its working copy for review re-entry; both release the isolated
// review lane when the engine review answers.
func TestTodoReleasesItsCodingAndReviewLanes(t *testing.T) {
	for _, mode := range []string{"completed", "live", "completed-during-review"} {
		t.Run(mode, func(t *testing.T) {
			o, session := newTodoAdmission(t)
			if mode != "completed" {
				o.service.SetTodoFlow(func(context.Context, int64, string) (string, error) { return todoPinOne, nil })
			}
			ctx := context.Background()
			id := uuidString(o.fileTodo(session, "first").ID)
			o.wake()
			item := o.byID(id)
			require.Equal(t, "running", item.State, item.Reason)
			if mode != "completed" {
				// The lane provider stands in for machine provisioning, including
				// the workspace the retained coding branch resolves through.
				_, err := o.pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,status) VALUES($1,$2,$3,'running')`, item.WorkspaceID, o.repoID, o.userID)
				require.NoError(t, err)
				// A live composition must attach before its published PR can
				// enter review. GitHub facts observed during startup are deferred.
				o.projectTodo(o.launcher.last("todo"), jobs.StateWaiting, "coding-run", todoPinOne, "")
				item = o.byID(id)
				require.True(t, mythicalChecksOf(item).RunAttached)
			}
			coding := item.WorkspaceID
			tip := o.hostRef("refs/heads/main")
			candidate := o.laneResult(coding, tip, map[string]string{"JOURNEY.md": "Hello, reader.\n"}, "✨ feat: greet the reader")
			// Stands in for the candidate the run records: the engine pins it.
			_, err := o.pool.Exec(ctx, `UPDATE mythical_items SET state='integrating', generation=generation+1, candidate_base=$2, candidate_head=$3, candidate_verified=true,
		summary='✨ feat: greet the reader' WHERE id=$1`, item.ID, tip, candidate)
			require.NoError(t, err)
			o.wake()
			require.Equal(t, "proposing", o.byID(id).State)
			if mode == "completed" {
				_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET request_outcome='completed' WHERE id=$1`, item.ID)
				require.NoError(t, err)
			}
			// Stands in for publication: the pull request is open at the candidate.
			_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET state='proposed', pr_number=41, pr_head=$2, pr_state='open', reason='' WHERE id=$1`, item.ID, candidate)
			require.NoError(t, err)
			o.github.mu.Lock()
			if o.github.pulls == nil {
				o.github.pulls = map[int64]*mythicalPull{}
			}
			o.github.pulls[41] = &mythicalPull{Number: 41, State: "open", HeadSHA: candidate, HeadRef: "smithers/todo-1", MergeableState: "clean"}
			o.github.mu.Unlock()
			stack := o.wake()
			require.Empty(t, stack.LastError)

			item = o.byID(id)
			require.Equal(t, "proposed", item.State, item.Reason)
			if mode != "completed" {
				assert.NotContains(t, o.lanes.deleted, coding)
			} else {
				assert.Contains(t, o.lanes.deleted, coding)
			}
			review := o.launcher.last(mythicalReviewFlow)
			require.NotEmpty(t, review.RequestID, "the review launched: reason %q checks %s next %v", item.Reason, item.Checks, item.NextAttemptAt)
			reviewLane := review.Target.WorkspaceID
			assert.NotEqual(t, coding, reviewLane)
			if mode != "completed" {
				assert.Equal(t, coding, item.WorkspaceID)
			} else {
				assert.Equal(t, reviewLane, item.WorkspaceID)
			}
			assert.NotContains(t, o.lanes.deleted, reviewLane)
			var name string
			require.NoError(t, o.pool.QueryRow(ctx, `SELECT name FROM mythical_lanes WHERE workspace_id=$1`, reviewLane).Scan(&name))
			assert.Equal(t, "TODO 1 review g2", name)

			if mode == "completed-during-review" {
				_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET request_outcome='completed' WHERE id=$1`, item.ID)
				require.NoError(t, err)
			}
			o.answerReviews(`"request-changes"`)
			item = o.byID(id)
			assert.Contains(t, o.lanes.deleted, reviewLane, "the review lane is retired once it answers")
			if mode == "completed-during-review" {
				assert.NotEqual(t, reviewLane, item.WorkspaceID, "subsequent work does not retain the settled reviewer")
			} else if mode == "live" {
				assert.Equal(t, coding, item.WorkspaceID)
				assert.True(t, item.Lane.Valid)
				assert.NotContains(t, o.lanes.deleted, coding)
			} else {
				assert.Empty(t, item.WorkspaceID)
				assert.False(t, item.Lane.Valid)
			}

		})
	}
}

// Install run 14 (#3776): a person merged a TODO whose review lane had not
// answered. The lane took the only machine, its review was refused because the
// item had landed, and nothing retired it. A settled item's review is moot:
// the merge pass retires its lane, and the lane sweep retires one the merge
// pass missed.
func TestMergedTodoRetiresItsUnansweredReviewLane(t *testing.T) {
	for _, mode := range []string{"merge pass", "sweep", "starting"} {
		t.Run(mode, func(t *testing.T) {
			o, session := newTodoAdmission(t)
			o.service.SetTodoFlow(func(context.Context, int64, string) (string, error) { return todoPinOne, nil })
			ctx := context.Background()
			id := uuidString(o.fileTodo(session, "first").ID)
			o.wake()
			item := o.byID(id)
			require.Equal(t, "running", item.State, item.Reason)
			_, err := o.pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,status) VALUES($1,$2,$3,'running')`, item.WorkspaceID, o.repoID, o.userID)
			require.NoError(t, err)
			o.projectTodo(o.launcher.last("todo"), jobs.StateWaiting, "coding-run", todoPinOne, "")
			coding := o.byID(id).WorkspaceID
			tip := o.hostRef("refs/heads/main")
			candidate := o.laneResult(coding, tip, map[string]string{"JOURNEY.md": "Hello, reader.\n"}, "✨ feat: greet the reader")
			_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET state='integrating', generation=generation+1, candidate_base=$2, candidate_head=$3, candidate_verified=true,
		summary='✨ feat: greet the reader' WHERE id=$1`, item.ID, tip, candidate)
			require.NoError(t, err)
			o.wake()
			_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET state='proposed', pr_number=41, pr_head=$2, pr_state='open', reason='' WHERE id=$1`, item.ID, candidate)
			require.NoError(t, err)
			o.github.mu.Lock()
			if o.github.pulls == nil {
				o.github.pulls = map[int64]*mythicalPull{}
			}
			o.github.pulls[41] = &mythicalPull{Number: 41, State: "open", HeadSHA: candidate, HeadRef: "smithers/todo-1", MergeableState: "clean"}
			o.github.mu.Unlock()
			require.Empty(t, o.wake().LastError)
			reviewLane := o.launcher.last(mythicalReviewFlow).Target.WorkspaceID
			require.NotEmpty(t, reviewLane, "the review launched")
			require.NotEqual(t, coding, reviewLane)
			review := mythicalChecksOf(o.byID(id)).Review
			require.NotNil(t, review)
			require.Equal(t, reviewLane, review.Lane)
			require.Empty(t, review.Verdict, "the review has not answered")

			// A person merges before the review answers.
			var starting *startingReviewLane
			var learning chan error
			if mode == "starting" {
				queue := mergedReviewQueue(t)
				holder := "workspace:" + reviewLane
				_, err = queue.Request("person", holder, "review", "machine")
				require.NoError(t, err)
				grants := microsandbox.AdmissionProviders{Ready: func(context.Context, microsandbox.AdmissionRequest) error { return nil }, FreeDisk: func(context.Context) (int64, error) {
					return microsandbox.MinFreeDiskBytes + microsandbox.MachineDiskBytes, nil
				}}
				grant, err := queue.GrantNext(ctx, grants)
				require.NoError(t, err)
				require.Equal(t, holder, grant.Holder)
				learning = make(chan error, 1)
				go func() {
					_, err := queue.WaitAdmission(t.Context(), grants, "background", "learning", "learning", "learning")
					learning <- err
				}()
				require.Eventually(t, func() bool {
					for _, row := range queue.AdmissionSnapshot() {
						if row.Holder == "learning" {
							return true
						}
					}
					return false
				}, time.Second, time.Millisecond)
				grant, err = queue.GrantNext(ctx, grants)
				require.NoError(t, err)
				require.Empty(t, grant.Holder)
				_, err = o.pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,status,target_bookmark) VALUES($1,$2,$3,'starting',$4)`, reviewLane, o.repoID, o.userID, reviewLane)
				require.NoError(t, err)
				machines := NewWorkspaceService(db.New(o.pool), WithWorkspaceRuntime(&mergedReviewRuntime{queue: queue}))
				starting = &startingReviewLane{fakeMythicalLanes: o.lanes, lane: reviewLane, machines: machines}
				o.service.lanes = starting
			}
			if mode == "sweep" {
				// The merge pass already released the coding lane; only the
				// review lane is left, past the sweep's grace period.
				_, err = o.pool.Exec(ctx, `UPDATE mythical_lanes SET retired_at=NOW() WHERE workspace_id=$1`, coding)
				require.NoError(t, err)
				_, err = o.pool.Exec(ctx, `UPDATE mythical_lanes SET created_at=NOW()-INTERVAL '3 minutes' WHERE workspace_id=$1`, reviewLane)
				require.NoError(t, err)
				_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET state='landed', pr_state='merged', workspace_id='', lane=NULL WHERE id=$1`, item.ID)
			} else {
				_, err = o.pool.Exec(ctx, `UPDATE mythical_items SET state='landed', pr_state='merged' WHERE id=$1`, item.ID)
			}
			require.NoError(t, err)
			stack := o.wake()
			if starting != nil {
				require.NotContains(t, o.lanes.deleted, reviewLane)
				require.Equal(t, stack.ProcessedGeneration+1, stack.RequestedGeneration, "the failed stop schedules a durable retry")
				_, err = o.pool.Exec(ctx, `UPDATE workspaces SET status='running' WHERE id=$1`, reviewLane)
				require.NoError(t, err)
				time.Sleep(time.Until(stack.NextAttemptAt.Time) + 100*time.Millisecond)
				require.NoError(t, o.service.PollOnce(ctx))
				row, err := db.New(o.pool).GetWorkspace(ctx, reviewLane)
				require.NoError(t, err)
				require.Equal(t, "stopped", row.Status)
				select {
				case err := <-learning:
					require.NoError(t, err, "learning obtains the only slot without a person's action")
				case <-time.After(5 * time.Second):
					t.Fatal("learning was not admitted after the review machine stopped")
				}
			}
			assert.Contains(t, o.lanes.deleted, reviewLane, "a merged TODO's unanswered review releases its machine")
			var retired bool
			require.NoError(t, o.pool.QueryRow(ctx, `SELECT retired_at IS NOT NULL FROM mythical_lanes WHERE workspace_id=$1`, reviewLane).Scan(&retired))
			assert.True(t, retired)
		})
	}
}

// Provisioning owns the machine until it settles; retirement must survive it.
type startingReviewLane struct {
	*fakeMythicalLanes
	lane     string
	machines *WorkspaceService
}

func (l *startingReviewLane) Delete(ctx context.Context, repo, actor int64, id string) error {
	if id == l.lane && l.machines != nil {
		if err := l.machines.StopLaneMachine(ctx, repo, id); err != nil {
			return err
		}
	}
	return l.fakeMythicalLanes.Delete(ctx, repo, actor, id)
}

type mergedReviewRuntime struct {
	workspaceapi.WorkspaceRuntime
	queue *microsandbox.Runtime
}

func (r *mergedReviewRuntime) StopWorkspace(_ context.Context, id string) error {
	r.queue.ConfirmAdmissionStop("workspace:"+id, false)
	return nil
}
func mergedReviewQueue(t *testing.T) *microsandbox.Runtime {
	t.Helper()
	root := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(root, "owner"), []byte("smithers-backend-0123456789abcdef\n"), 0600))
	binary := filepath.Join(root, "msb")
	require.NoError(t, os.WriteFile(binary, []byte("#!/bin/sh\nprintf '[]\\n'\n"), 0700))
	profile := microsandbox.HostProfile{MemoryBytes: 64 << 30, PerfCores: 10, PhysicalCores: 14, DiskFreeBytes: microsandbox.MinFreeDiskBytes + microsandbox.MachineDiskBytes, MacOSVersion: "15.6", Hypervisor: true}
	sizing := microsandbox.ComputeSizing(profile)
	queue, err := microsandbox.New(t.Context(), microsandbox.Config{Root: root, Binary: binary, SkipQualification: true, HostProfile: &profile, CPUs: sizing.CPUs, MemoryMiB: sizing.MemoryMiB, DiskMiB: int(microsandbox.MachineDiskBytes >> 20), MaxRunningVMs: 1})
	require.NoError(t, err)
	t.Cleanup(func() { _ = queue.Close() })
	queue.SetCapacityReader(func(context.Context) (int, error) { return 1, nil })
	return queue
}
