package services_test

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
	"io"
	"strings"
	"testing"
	"time"
)

func TestHostedTimelineSummariesBackfillAndIsolation(t *testing.T) {
	for _, outcome := range []string{"written", "revoked", "stale"} {
		t.Run(outcome, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			ctx := t.Context()
			owner, err := seed.CreateUser(ctx, pool, "timeline-owner")
			require.NoError(t, err)
			other, err := seed.CreateUser(ctx, pool, "timeline-other")
			require.NoError(t, err)
			store, err := chat.NewStore(pool)
			require.NoError(t, err)
			queue, err := jobs.NewStore(pool)
			require.NoError(t, err)
			admit := func(user int64, login, run string) string {
				scope := chat.Scope{UserID: user, Owner: login}
				payload := json.RawMessage(fmt.Sprintf(`{"purpose":"conversation","privateConversation":true,"conversationId":"account-%d-main","runId":%q,"instructions":"private-canary","messages":[{"role":"user","content":"Use the theme command to change my theme to dark"}]}`, user, run))
				turn, e := store.Admit(ctx, chat.AdmitInput{Scope: scope, RunID: run, Journal: chat.JournalRequest{Version: 1, LegID: run + "-leg", Token: strings.Repeat("a", 64)}, Request: payload})
				require.NoError(t, e)
				grant, e := store.Claim(ctx, scope, turn.TurnID, time.Minute)
				require.NoError(t, e)
				_, e = store.Commit(ctx, chat.CommitInput{TurnID: turn.TurnID, Generation: grant.Generation, Token: grant.Token, Expected: grant.Cursor, Frames: []json.RawMessage{
					json.RawMessage(fmt.Sprintf(`{"runId":%q,"type":"delta","kind":"text","text":"The theme command is unavailable."}`, run)),
					json.RawMessage(fmt.Sprintf(`{"runId":%q,"type":"done","reason":"stop"}`, run)),
				}})
				require.NoError(t, e)
				return turn.TurnID
			}
			turn := admit(owner, "timeline-owner", "owner-run")
			_ = admit(other, "timeline-other", "other-run")
			entered, release := make(chan struct{}, 1), make(chan struct{})
			summaries := &services.ConversationSummaries{Pool: pool, Jobs: queue, Model: func(call context.Context, user, repo int64, body json.RawMessage) (io.ReadCloser, error) {
				require.Equal(t, owner, user)
				require.Zero(t, repo)
				require.NotContains(t, string(body), "private-canary")
				var request struct {
					Messages []struct {
						Content string `json:"content"`
					} `json:"messages"`
					Tools []any           `json:"tools"`
					Model json.RawMessage `json:"model"`
				}
				require.NoError(t, json.Unmarshal(body, &request))
				require.Empty(t, request.Tools)
				require.Empty(t, request.Model)
				var data map[string]string
				require.NoError(t, json.Unmarshal([]byte(request.Messages[0].Content), &data))
				require.Equal(t, "completed", data["state"])
				require.Equal(t, "The theme command is unavailable.", data["answer"])
				entered <- struct{}{}
				select {
				case <-release:
				case <-call.Done():
					return nil, call.Err()
				}
				text, _ := json.Marshal(map[string]string{"type": "delta", "kind": "text", "text": `{"prompt":"Switch to dark mode","answer":"Theme change unavailable"}`})
				return io.NopCloser(strings.NewReader(string(text) + "\n{\"type\":\"done\"}\n")), nil
			}}
			// Hosted accounts have no install, repository or fast-model setting.
			branch := fmt.Sprintf("account-%d-main", owner)
			require.NoError(t, summaries.Backfill(ctx, 0, owner, fmt.Sprintf("account-%d-main", other)))
			require.NoError(t, summaries.Backfill(ctx, 0, owner, branch))
			require.NoError(t, summaries.Backfill(ctx, 0, owner, branch))
			var count int
			require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM product_job_requests WHERE operation=$1`, services.ConversationSummaryOperation).Scan(&count))
			require.Equal(t, 1, count)
			worker, cancel := context.WithCancel(ctx)
			defer cancel()
			finished := make(chan error, 1)
			go func() {
				finished <- queue.RunWorker(worker, jobs.WorkerConfig{WorkerID: "timeline", Capacity: 1, Lease: time.Minute, PollInterval: time.Millisecond, Operations: []string{services.ConversationSummaryOperation}}, summaries.Handle)
			}()
			select {
			case <-entered:
			case <-time.After(5 * time.Second):
				t.Fatal("summary model did not run")
			}
			if outcome == "revoked" {
				_, err = pool.Exec(ctx, `UPDATE users SET prohibit_login=true WHERE id=$1`, owner)
				require.NoError(t, err)
			}
			if outcome == "stale" {
				_, err = pool.Exec(ctx, `UPDATE chat_turns SET state='uncertain' WHERE id=$1`, turn)
				require.NoError(t, err)
			}
			close(release)
			require.Eventually(t, func() bool {
				var n int
				return pool.QueryRow(ctx, `SELECT count(*) FROM product_job_requests WHERE operation=$1 AND state='completed'`, services.ConversationSummaryOperation).Scan(&n) == nil && n == 1
			}, 5*time.Second, 10*time.Millisecond)
			cancel()
			require.NoError(t, <-finished)
			var summary *string
			require.NoError(t, pool.QueryRow(ctx, `SELECT summary FROM chat_turns WHERE id=$1`, turn).Scan(&summary))
			if outcome != "written" {
				require.Nil(t, summary)
				return
			}
			require.NotNil(t, summary)
			require.JSONEq(t, `{"v":2,"prompt":"Switch to dark mode","answer":"Theme change unavailable"}`, *summary)
			shared, err := store.SharedEntries(ctx, chat.Scope{UserID: owner, Owner: "timeline-owner"}, branch)
			require.NoError(t, err)
			require.Len(t, shared.Entries, 1)
			require.Equal(t, *summary, *shared.Entries[0].Summary)
			_, err = store.SharedEntries(ctx, chat.Scope{UserID: other, Owner: "timeline-other"}, branch)
			require.Error(t, err)
			store.OnSharedCommit = func(ctx context.Context, tx pgx.Tx, change chat.SharedCommit) error {
				return summaries.Admit(ctx, tx, change.TurnID, string(change.Previous))
			}
			_ = admit(owner, "timeline-owner", "new-run")
			require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM product_job_requests WHERE operation=$1`, services.ConversationSummaryOperation).Scan(&count))
			require.Equal(t, 3, count)
		})
	}
}
