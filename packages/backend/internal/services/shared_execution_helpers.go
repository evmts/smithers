package services

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

const AlertRemediationTriggerEvent = "monitoring_alert"

type runnerTxStarter interface {
	BeginTx(context.Context) (pgx.Tx, error)
}

// workflowRunLogAppender is the one product query both run-log appenders fall
// back to when their store has no BeginTx.
type workflowRunLogAppender interface {
	InsertWorkflowRunLogNextSequence(context.Context, db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error)
}

// workflowRunLogSequenceAttempts bounds the retry below. Each attempt is one
// statement, so a loser re-reads MAX(sequence) under a fresh snapshot.
//
// A round admits exactly one winner: pg_advisory_xact_lock releases every
// loser at the same instant, so without the pause below they all take their
// next snapshot together and all but one collide again. Ten lockstep attempts
// were not enough — with 6 writers appending 8 lines each, 3 of 6 measured
// runs still dropped a line. The bound is a safety valve on a pathological
// store, not the mechanism that keeps the line.
const workflowRunLogSequenceAttempts = 64

// workflowRunLogSequenceBackoff is the upper bound of the jittered pause
// between attempts. It desynchronizes the losers a round released together, so
// a retry is usually the only writer reading MAX(sequence); it is deliberately
// shorter than a log line is worth waiting for.
const workflowRunLogSequenceBackoff = 2 * time.Millisecond

// appendWorkflowRunLogWithoutTx allocates MAX(sequence)+1 for a store that
// does not carry BeginTx (#3959 classified that as a deployment capability, so
// a hosted store may legitimately lack it).
//
// The lock inside InsertWorkflowRunLogNextSequence's CTE cannot save a lone
// statement: READ COMMITTED fixes the statement's snapshot before
// pg_advisory_xact_lock is acquired, so every waiter still reads the same
// MAX(sequence) and all but one lose the UNIQUE (workflow_run_id, sequence) —
// measured on PostgreSQL 18.6, 23 of 48 concurrent lines lost with this retry
// disabled; the exact count moves with scheduling. #3866 fixed that by taking
// the lock in its own statement, which only a transaction can do.
//
// Retrying the statement is what remains: the next attempt starts a new
// snapshot that sees the winner's row, so the line lands at the next free
// sequence instead of being dropped. The caller still publishes nothing it did
// not write, because a failed append returns its error.
func appendWorkflowRunLogWithoutTx(ctx context.Context, store workflowRunLogAppender, arg db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error) {
	var inserted db.InsertWorkflowRunLogNextSequenceRow
	var err error
	for attempt := 0; attempt < workflowRunLogSequenceAttempts; attempt++ {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return db.InsertWorkflowRunLogNextSequenceRow{}, ctxErr
		}
		inserted, err = store.InsertWorkflowRunLogNextSequence(ctx, arg)
		if err == nil || !workflowRunLogSequenceTaken(err) {
			return inserted, err
		}
		if waitErr := waitForWorkflowRunLogRetry(ctx); waitErr != nil {
			return db.InsertWorkflowRunLogNextSequenceRow{}, waitErr
		}
	}
	return inserted, err
}

// waitForWorkflowRunLogRetry pauses a loser for a jittered moment, or reports
// the caller gave up first.
func waitForWorkflowRunLogRetry(ctx context.Context) error {
	timer := time.NewTimer(rand.N(workflowRunLogSequenceBackoff) + time.Microsecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// workflowRunLogSequenceTaken reports whether err is another appender winning
// the same sequence, and nothing else: any other failure is returned as it is.
func workflowRunLogSequenceTaken(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}
	return strings.Contains(pgErr.ConstraintName, "workflow_run_logs") &&
		strings.Contains(pgErr.ConstraintName, "sequence")
}

func IsTerminalWorkflowRunStatus(status string) bool {
	switch status {
	case "success", "failure", "cancelled", "error":
		return true
	default:
		return false
	}
}

func WorkflowRunStatusDescription(status string) string {
	switch status {
	case "success":
		return "Workflow completed successfully"
	case "failure":
		return "Workflow failed"
	case "cancelled":
		return "Workflow was cancelled"
	case "error":
		return "Workflow hit an infrastructure error"
	default:
		return fmt.Sprintf("Workflow status: %s", status)
	}
}

func ResourceStoreError(err error, resource string) error {
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sandbox.ErrNotFound) {
		return pkgerrors.NotFound(resource + " not found")
	}
	return pkgerrors.Internal("could not load " + resource)
}
