package services

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// A composed install's first roster add waited past its caller's 30 s deadline
// with the host idle and nothing in the record naming the stage that held it.
// Every stage of the add must be able to name itself — while it is still in
// flight as well as when it returns, because a stage that never returns would
// otherwise never be recorded at all — and only when it alone ran long.
func TestMemberAddSlowStageNamesItself(t *testing.T) {
	stages := []string{
		memberAddStageAuthorize, memberAddStageRepository, memberAddStageInstall,
		memberAddStageGitHubUser, memberAddStagePermission, memberAddStageMutation,
		memberAddStageRosterWrite, memberAddStageCommit,
	}
	for _, stage := range stages {
		t.Run(stage+" returning long", func(t *testing.T) {
			records, restore := captureMemberAddRecords(t)
			defer restore()
			clock := &memberAddClock{ctx: t.Context(), budget: memberAddSlowStage}
			clock.since(stage, time.Now().Add(-memberAddSlowStage-time.Second)).passed(errors.New("github unavailable"))
			require.Contains(t, records.String(), "members.add_stage_slow")
			require.Contains(t, records.String(), "stage="+stage)
			require.Contains(t, records.String(), "phase="+memberAddPhaseReturned)
			require.Contains(t, records.String(), "seconds=6")
			require.Contains(t, records.String(), "refused=true")
			require.Contains(t, records.String(), "caller="+memberAddCallerLive)
			// The upstream's own text never joins the record.
			require.NotContains(t, records.String(), "github unavailable")
		})
	}
	t.Run("a stage still in flight past the budget says so once, then again when it returns", func(t *testing.T) {
		records, restore := captureMemberAddRecords(t)
		defer restore()
		clock := &memberAddClock{ctx: t.Context(), budget: 20 * time.Millisecond}
		watch := clock.at(memberAddStageInstall)
		require.Eventually(t, func() bool {
			return strings.Contains(records.String(), "phase="+memberAddPhaseInFlight)
		}, 2*time.Second, 5*time.Millisecond, "a stuck stage is recorded before it returns")
		require.Contains(t, records.String(), "stage="+memberAddStageInstall)
		require.Equal(t, 1, strings.Count(records.String(), "phase="+memberAddPhaseInFlight), "exactly once")
		watch.passed(nil)
		require.Contains(t, records.String(), "phase="+memberAddPhaseReturned)
		require.Equal(t, 1, strings.Count(records.String(), "phase="+memberAddPhaseInFlight), "still exactly once")
	})
	t.Run("a stage that returns inside the budget reports nothing at all", func(t *testing.T) {
		records, restore := captureMemberAddRecords(t)
		defer restore()
		clock := &memberAddClock{ctx: t.Context(), budget: time.Hour}
		clock.at(memberAddStageInstall).passed(nil)
		time.Sleep(30 * time.Millisecond)
		require.Empty(t, records.String())
	})
	t.Run("a stage the caller had already given up on says so", func(t *testing.T) {
		for state, cancel := range map[string]func(context.Context) (context.Context, context.CancelFunc){
			memberAddCallerCanceled: func(parent context.Context) (context.Context, context.CancelFunc) {
				ctx, stop := context.WithCancel(parent)
				stop()
				return ctx, func() {}
			},
			memberAddCallerExpired: func(parent context.Context) (context.Context, context.CancelFunc) {
				return context.WithDeadline(parent, time.Now().Add(-time.Second))
			},
		} {
			records, restore := captureMemberAddRecords(t)
			ctx, stop := cancel(t.Context())
			clock := &memberAddClock{ctx: ctx, budget: memberAddSlowStage}
			clock.since(memberAddStageGitHubUser, time.Now().Add(-memberAddSlowStage-time.Second)).passed(errors.New("context canceled"))
			require.Contains(t, records.String(), "caller="+state)
			require.NotContains(t, records.String(), "context canceled")
			stop()
			restore()
		}
	})
	t.Run("every stage of the add is one of the closed set", func(t *testing.T) {
		require.Len(t, stages, 8)
		seen := map[string]bool{}
		for _, stage := range stages {
			require.False(t, seen[stage], "stage names are distinct")
			seen[stage] = true
		}
	})
}

// lockedRecords is the records buffer. The in-flight report is written by the
// stage's own timer goroutine while the test reads, so a plain bytes.Buffer
// would be a race in the test itself rather than in the product.
type lockedRecords struct {
	mu      sync.Mutex
	records bytes.Buffer
}

func (l *lockedRecords) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.records.Write(p)
}

func (l *lockedRecords) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.records.String()
}

func captureMemberAddRecords(t *testing.T) (*lockedRecords, func()) {
	t.Helper()
	records := &lockedRecords{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(records, nil)))
	return records, func() { slog.SetDefault(previous) }
}
