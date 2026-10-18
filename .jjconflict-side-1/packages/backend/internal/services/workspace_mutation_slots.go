package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// A workspace mutation (a start, a resume, an exec, a preview publish, a
// snapshot, a fork) holds its authorization transaction for its whole run,
// and the run's ordinary reads and writes take further pool connections
// beside it. With more concurrent holders than the pool has spare
// connections, every holder waits for a connection the others hold, and a
// launch spike of box starts exhausts the pool. The service therefore admits
// at most a set number of holders at once (a third of the pool in
// production); the rest wait briefly for a slot, then are refused
// retryably.

// WorkspaceMutationPoolShare is the share of the database pool that may
// hold mutation transactions at once: one in this many connections, so every
// holder finds a connection for its own reads (smithers#4347 removes the
// need).
const WorkspaceMutationPoolShare = 3

// WorkspaceMutationConcurrencyFor is the cap for a pool of maxConns
// connections: a third of the pool, at least one.
func WorkspaceMutationConcurrencyFor(maxConns int32) int {
	return max(1, int(maxConns)/WorkspaceMutationPoolShare)
}

// workspaceMutationSlotWait bounds how long a mutation waits for a slot. It
// stays at most half the smithers.sh edge's upstream deadline
// (DEFAULT_UPSTREAM_TIMEOUT_MS, 20 s, apps/server/src/Http.ts), so a
// synchronous start through the edge gets the typed 503 box_busy, never the
// edge's 504 upstream_timeout.
var workspaceMutationSlotWait = 10 * time.Second

// workspaceMutationBusyRetryAfter is the Retry-After, in seconds, a refused
// mutation answers with: the client retries with backoff and shows the box as
// starting, never a dead end.
const workspaceMutationBusyRetryAfter = 5

// errWorkspaceStartsBusy is the cause of a mutation refused because every
// slot was held; agentSessionFailureForError names it box_busy.
var errWorkspaceStartsBusy = errors.New("every workspace mutation slot is held")

// WithWorkspaceMutationConcurrency caps the concurrent holders of a workspace
// mutation's authorization transaction at limit; zero or less leaves them
// uncapped.
func WithWorkspaceMutationConcurrency(limit int) WorkspaceServiceOption {
	return func(s *WorkspaceService) {
		if limit > 0 {
			s.mutationSlots = make(chan struct{}, limit)
		} else {
			s.mutationSlots = nil
		}
	}
}

// errWorkspaceMutationBusy refuses a mutation that found no slot in time: a
// 503 with Retry-After whose details carry the session read's box_busy
// reason_code and retryable, under the same sentence.
func errWorkspaceMutationBusy(cause error) error {
	refused := pkgerrors.New(pkgerrors.CodeServiceUnavailable, agentSessionBoxBusy.Reason).
		WithCause(errors.Join(errWorkspaceStartsBusy, cause))
	refused.RetryAfter = workspaceMutationBusyRetryAfter
	refused.Details = map[string]any{"reason_code": agentSessionBoxBusy.Code, "retryable": agentSessionBoxBusy.Retryable}
	return refused
}

// isWorkspaceMutationBusy reports whether err is, or wraps, that refusal.
func isWorkspaceMutationBusy(err error) bool {
	var apiErr *pkgerrors.APIError
	return errors.As(err, &apiErr) && errors.Is(apiErr.Cause(), errWorkspaceStartsBusy)
}

// workspaceMutationSlotKey marks a context whose mutation already holds a
// slot, so a nested mutation reuses it instead of waiting on itself.
type workspaceMutationSlotKey struct{}

// acquireMutationSlot takes a slot before a mutation opens its authorization
// transaction and answers the context that carries it and its release. It
// waits at most workspaceMutationSlotWait, within ctx; a caller that gives up
// first gets its own context error, not a refusal.
func (s *WorkspaceService) acquireMutationSlot(ctx context.Context) (context.Context, func(), error) {
	if s.mutationSlots == nil || ctx.Value(workspaceMutationSlotKey{}) != nil {
		return ctx, func() {}, nil
	}
	started := time.Now()
	wait, cancel := context.WithTimeout(ctx, workspaceMutationSlotWait)
	defer cancel()
	select {
	case s.mutationSlots <- struct{}{}:
		return context.WithValue(ctx, workspaceMutationSlotKey{}, true), func() { <-s.mutationSlots }, nil
	case <-wait.Done():
		if err := ctx.Err(); err != nil {
			return ctx, nil, err
		}
		slog.WarnContext(ctx, "workspace mutation refused: every slot is held",
			"holders", len(s.mutationSlots), "slots", cap(s.mutationSlots), "waited", time.Since(started).Round(time.Millisecond).String())
		return ctx, nil, errWorkspaceMutationBusy(wait.Err())
	}
}
