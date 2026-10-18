package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// THE LOCK-ORDER MATRIX (G4 re-review of g3b delta 2). Two starts, one release
// and one join admission on the same session and box, launched in every
// order, each on its own replica. A start parks right after its dirty check,
// holding the session row FOR SHARE; every later operation is launched once
// the one before it is parked, blocked on a database lock, or done. Then the
// starts resume. No operation may end in a deadlock (40P01) or a lock timeout
// (55P03, or a wait as long as db.AgentBoxLockWait), and nothing may hang.
// The admission runs plain and over a dead release's lease, which makes it
// take the box row before the session row.
func TestTwoStartsAReleaseAndAJoinAdmissionNeverDeadlock(t *testing.T) {
	ops := []string{"start1", "start2", "release", "admission"}
	for _, takeover := range []bool{false, true} {
		for _, order := range lockMatrixPermutations(ops) {
			name := strings.Join(order, ">")
			if takeover {
				name = "takeover/" + name
			}
			t.Run(name, func(t *testing.T) { runLockMatrixOrder(t, order, takeover) })
		}
	}
}

func lockMatrixPermutations(items []string) [][]string {
	if len(items) <= 1 {
		return [][]string{append([]string(nil), items...)}
	}
	var out [][]string
	for i := range items {
		rest := append(append([]string(nil), items[:i]...), items[i+1:]...)
		for _, tail := range lockMatrixPermutations(rest) {
			out = append(out, append([]string{items[i]}, tail...))
		}
	}
	return out
}

type lockMatrixResult struct {
	name string
	err  error
	took time.Duration
	note string
}

func runLockMatrixOrder(t *testing.T, order []string, takeover bool) {
	f := newAgentBoxRelease(t, "running")
	repo := f.box(t).RepositoryID
	replicas := map[string]*WorkspaceService{"start1": f.boxes, "start2": f.replicaB(t), "release": f.replicaB(t)}
	type parked struct {
		reached chan struct{}
		resume  chan struct{}
		once    sync.Once
	}
	park := map[string]*parked{}
	for _, name := range []string{"start1", "start2"} {
		p := &parked{reached: make(chan struct{}), resume: make(chan struct{})}
		park[name] = p
		replicas[name].agentBoxReleaseHook = func(point, id string) {
			if point != agentBoxAfterStartCheck || id != f.workspace {
				return
			}
			p.once.Do(func() {
				close(p.reached)
				<-p.resume
			})
		}
	}
	lockWaits := func() int {
		var n int
		_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM pg_stat_activity
			WHERE wait_event_type = 'Lock' AND datname = current_database() AND pid <> pg_backend_pid()`).Scan(&n)
		return n
	}
	op := func(name string) lockMatrixResult {
		ctx := context.Background()
		start := time.Now()
		var err error
		note := ""
		switch name {
		case "start1", "start2":
			_, err = replicas[name].ResumeWorkspace(ctx, f.workspace, repo, f.person)
		case "release":
			var got AgentWorkspaceRelease
			got, err = replicas[name].ReleaseAgentWorkspace(ctx, f.workspace, f.session, f.run)
			note = got.Outcome + " " + got.Detail
		case "admission":
			if takeover {
				setup, cancel := context.WithTimeout(ctx, 2*time.Second)
				_, setErr := f.pool.Exec(setup, `UPDATE workspaces SET provisioning_stage = $2 || (floor(extract(epoch FROM now()))::bigint - $3::bigint)::text || ':dead' WHERE id = $1`,
					f.workspace, db.AgentBoxLeasePrefix, 2*db.AgentBoxLeaseSeconds)
				cancel()
				if setErr != nil {
					note = "dead lease not set: " + setErr.Error() + "; "
				}
			}
			var admission db.AgentBoxAdmission
			admission, err = f.q.AdmitAgentBoxJoin(ctx, f.workspace, f.session, f.person)
			note += fmt.Sprintf("busy=%v tookOver=%v", admission.Busy, admission.TookOver)
		}
		return lockMatrixResult{name: name, err: err, took: time.Since(start), note: note}
	}

	results := make(chan lockMatrixResult, len(order))
	orderStart := time.Now()
	for _, name := range order {
		before := lockWaits()
		done := make(chan struct{})
		go func(name string) {
			defer close(done)
			results <- op(name)
		}(name)
		var reached <-chan struct{}
		if p, ok := park[name]; ok {
			reached = p.reached
		}
		deadline := time.After(2 * time.Second)
	position:
		for {
			select {
			case <-reached:
				break position
			case <-done:
				break position
			case <-deadline:
				break position
			case <-time.After(10 * time.Millisecond):
				if lockWaits() > before {
					break position
				}
			}
		}
	}
	for _, name := range []string{"start1", "start2"} {
		close(park[name].resume)
	}

	var got []lockMatrixResult
	timeout := time.After(60 * time.Second)
	for len(got) < len(order) {
		select {
		case r := <-results:
			got = append(got, r)
		case <-timeout:
			t.Fatalf("an operation hung; finished: %v", got)
		}
	}
	took := time.Since(orderStart)
	t.Logf("order took %s", took.Round(time.Millisecond))
	for _, r := range got {
		t.Logf("%s: took=%s err=%v %s", r.name, r.took.Round(time.Millisecond), r.err, r.note)
	}
	for _, r := range got {
		var pgErr *pgconn.PgError
		if errors.As(r.err, &pgErr) {
			require.NotEqual(t, "40P01", pgErr.Code, "%s deadlocked", r.name)
			require.NotEqual(t, "55P03", pgErr.Code, "%s timed out on a lock", r.name)
		}
		if r.err != nil {
			text := r.err.Error()
			require.NotContains(t, text, "deadlock", r.name)
			require.NotContains(t, text, "lock timeout", r.name)
			require.NotContains(t, text, "40P01", r.name)
			require.NotContains(t, text, "55P03", r.name)
		}
		require.Less(t, r.took, 2*time.Second, "%s waited too long on a lock", r.name)
	}
	require.Less(t, took, 2*time.Second, "every operation of the order finished within 2 s")
	logs := f.logs.String()
	for _, needle := range []string{"40P01", "55P03", "deadlock detected", "lock timeout"} {
		require.NotContains(t, logs, needle)
	}
}
