package product

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The stalled-job reclaim reads only 'processing' rows by updated_at. Its
// partial index must match that predicate, or every sweep scans every job
// ever received (#4296).
func TestGitHubWebhookJobsReclaimUsesTheProcessingIndex(t *testing.T) {
	pool := reviewDatabase(t, 176)
	tx, err := pool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(t.Context()) }()
	_, err = tx.Exec(t.Context(), `SET LOCAL enable_seqscan = off`)
	require.NoError(t, err)
	rows, err := tx.Query(t.Context(), `EXPLAIN UPDATE github_webhook_jobs SET status = 'pending', available_at = NOW(), updated_at = NOW()
WHERE status = 'processing' AND updated_at < NOW() - make_interval(secs => 300)`)
	require.NoError(t, err)
	var plan string
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		plan += line + "\n"
	}
	require.NoError(t, rows.Err())
	require.Contains(t, plan, "github_webhook_jobs_processing_updated_idx", plan)
}
