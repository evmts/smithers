package services

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	api "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/stretchr/testify/require"
)

func TestIssueSyncReactionBeforeOutboundReceiptRetries(t *testing.T) {
	for _, provider := range []string{"slack", "telegram"} {
		t.Run(provider, func(t *testing.T) {
			pool := newProductTestPool(t)
			ctx := context.Background()
			actor, repo := issueCovSeedUserRepo(t, pool)
			svc := NewIssueService(db.New(pool))
			cfg := IssueSyncInput{Provider: "slack", ConnectionID: "workspace", ScopeID: "T001", ConversationID: "C001", ThreadID: "100.000001"}
			messageID, version, user := fmt.Sprintf("%d.000001", time.Now().Unix()), "102.000001", "U001"
			if provider == "telegram" {
				cfg = IssueSyncInput{Provider: provider, ConnectionID: "bot", ScopeID: "123", ConversationID: "-100"}
				messageID, version, user = "10", "102.1", "42"
			}
			require.NoError(t, svc.ConfigureIssueSyncChannel(ctx, &actor, actor.Username, repo, cfg))
			issue, err := svc.CreateIssue(ctx, &actor, actor.Username, repo, CreateIssueInput{Title: "chat", Kind: "chat"})
			require.NoError(t, err)
			_, err = svc.PutIssueSync(ctx, &actor, actor.Username, repo, issue.Number, cfg)
			require.NoError(t, err)
			comment, err := svc.CreateIssueComment(ctx, &actor, actor.Username, repo, issue.Number, CreateIssueCommentInput{Body: "outgoing"})
			require.NoError(t, err)
			rows, err := svc.IssueSyncDeliveries(ctx, &actor, actor.Username, repo)
			require.NoError(t, err)
			claim, err := svc.ClaimIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID)
			require.NoError(t, err)
			in := IssueSyncEvent{IssueSyncInput: cfg, DeliveryKey: "reaction-before-receipt", MessageID: messageID, Version: version, UserID: user, Kind: "reaction_add", Reaction: "thumbsup"}
			// Slack reactions do not carry thread_ts; the external message link is not committed yet.
			if provider == "slack" {
				in.ThreadID = ""
			}
			_, err = svc.IngestIssueSync(ctx, &actor, actor.Username, repo, in)
			var retry *api.APIError
			require.ErrorAs(t, err, &retry, "receipt race must remain unacknowledged")
			require.Equal(t, 409, retry.Status)
			// A recent partial/unknown receipt can still identify the exact message.
			receiptID := messageID
			if provider == "telegram" {
				receiptID = "9," + messageID
			}
			require.NoError(t, svc.CompleteIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID, IssueSyncReceipt{State: "outcome_unknown", Token: claim.Token, MessageID: receiptID}))
			_, err = svc.IngestIssueSync(ctx, &actor, actor.Username, repo, in)
			require.ErrorAs(t, err, &retry)
			require.Equal(t, 409, retry.Status)
			require.NoError(t, svc.CompleteIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID, IssueSyncReceipt{State: "sent", Token: claim.Token, MessageID: func() string {
				if provider == "telegram" {
					return "9," + messageID
				}
				return messageID
			}()}))
			for range 2 {
				got, err := NewIssueService(db.New(pool)).IngestIssueSync(ctx, &actor, actor.Username, repo, in)
				require.NoError(t, err)
				require.Equal(t, issue.ID, got)
			}
			reactions, err := svc.IssueReactions(ctx, &actor, actor.Username, repo, issue.Number, comment.ID)
			require.NoError(t, err)
			require.Len(t, reactions, 1)
		})
	}
}

func TestIssueSyncUnrelatedReactionIgnored(t *testing.T) {
	for _, provider := range []string{"slack", "telegram"} {
		t.Run(provider, func(t *testing.T) {
			pool := newProductTestPool(t)
			ctx := context.Background()
			actor, repo := issueCovSeedUserRepo(t, pool)
			svc := NewIssueService(db.New(pool))
			cfg := IssueSyncInput{Provider: provider, ConnectionID: "workspace", ScopeID: "T001", ConversationID: "C001", ThreadID: "100.000001"}
			messageID, version, user := "555.000001", "556.000001", "U001"
			if provider == "telegram" {
				cfg.ScopeID, cfg.ConversationID, cfg.ThreadID = "123", "-100", ""
				messageID, version, user = "555", "556.1", "42"
			}
			require.NoError(t, svc.ConfigureIssueSyncChannel(ctx, &actor, actor.Username, repo, cfg))
			issue, err := svc.CreateIssue(ctx, &actor, actor.Username, repo, CreateIssueInput{Title: "chat", Kind: "chat"})
			require.NoError(t, err)
			_, err = svc.PutIssueSync(ctx, &actor, actor.Username, repo, issue.Number, cfg)
			require.NoError(t, err)
			_, err = svc.CreateIssueComment(ctx, &actor, actor.Username, repo, issue.Number, CreateIssueCommentInput{Body: "outgoing"})
			require.NoError(t, err)
			rows, err := svc.IssueSyncDeliveries(ctx, &actor, actor.Username, repo)
			require.NoError(t, err)
			_, err = svc.ClaimIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID)
			require.NoError(t, err)
			for _, tc := range []struct{ name, state, receipt, age, thread string }{
				{name: "unknown without identity", state: "outcome_unknown", age: "0 seconds"},
				{name: "unknown different identity", state: "outcome_unknown", receipt: "999", age: "0 seconds"},
				{name: "stale dispatch", state: "dispatching", age: "1 minute"},
				{name: "stale unknown matching identity", state: "outcome_unknown", receipt: messageID, age: "1 minute"},
				{name: "dispatch different identity", state: "dispatching", receipt: "999", age: "0 seconds"},
				{name: "dispatch different thread", state: "dispatching", age: "0 seconds", thread: "777"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					_, err = pool.Exec(ctx, `UPDATE issue_sync_deliveries SET state=$2,message_id=$3,updated_at=now()-$4::interval WHERE id=$1`, rows[0].ID, tc.state, tc.receipt, tc.age)
					require.NoError(t, err)
					in := IssueSyncEvent{IssueSyncInput: cfg, DeliveryKey: "unrelated-reaction", MessageID: messageID, Version: version, UserID: user, Kind: "reaction_add", Reaction: "thumbsup"}
					in.ThreadID = tc.thread
					if provider == "slack" && (tc.name == "unknown without identity" || tc.name == "dispatch different thread") {
						in.MessageID = fmt.Sprintf("%d.000001", time.Now().Unix())
					}
					if provider == "slack" && tc.thread != "" {
						in.ThreadID += ".000001"
					}
					_, err = svc.IngestIssueSync(ctx, &actor, actor.Username, repo, in)
					var ignored IssueSyncIgnored
					require.ErrorAs(t, err, &ignored)
				})
			}
			if provider == "slack" {
				_, err = pool.Exec(ctx, `UPDATE issue_sync_deliveries SET state='dispatching',message_id='',updated_at=now() WHERE id=$1`, rows[0].ID)
				require.NoError(t, err)
				in := IssueSyncEvent{IssueSyncInput: cfg, DeliveryKey: "old-message", MessageID: messageID, Version: version, UserID: user, Kind: "reaction_remove", Reaction: "thumbsup"}
				in.ThreadID = ""
				_, err = svc.IngestIssueSync(ctx, &actor, actor.Username, repo, in)
				var ignored IssueSyncIgnored
				require.ErrorAs(t, err, &ignored, "an old Slack post cannot be the in-flight create")
			}
		})
	}
}

// Telegram reaction updates carry no topic. A chunked comment mirrored into a
// forum topic must still receive a reaction on any of its chunks, even when the
// same chat also has a chat-root issue.
func TestIssueSyncTelegramTopicReactionResolvesByMessage(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	actor, repo := issueCovSeedUserRepo(t, pool)
	svc := NewIssueService(db.New(pool))
	cfg := IssueSyncInput{Provider: "telegram", ConnectionID: "bot", ScopeID: "123", ConversationID: "-100"}
	require.NoError(t, svc.ConfigureIssueSyncChannel(ctx, &actor, actor.Username, repo, cfg))
	version := 0
	ingest := func(key, thread, message, kind, reaction string) (int64, error) {
		version++
		in := IssueSyncEvent{IssueSyncInput: cfg, DeliveryKey: key, MessageID: message, Version: fmt.Sprintf("100.%d", version), UserID: "42", Kind: kind, Body: "hello", Reaction: reaction}
		in.ThreadID = thread
		return svc.IngestIssueSync(ctx, &actor, actor.Username, repo, in)
	}
	chatIssue, err := ingest("m1", "", "1", "message", "")
	require.NoError(t, err)
	topicIssue, err := ingest("m2", "5", "2", "message", "")
	require.NoError(t, err)
	require.NotEqual(t, chatIssue, topicIssue)
	var number int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT number FROM issues WHERE id=$1`, topicIssue).Scan(&number))
	comment, err := svc.CreateIssueComment(ctx, &actor, actor.Username, repo, number, CreateIssueCommentInput{Body: "outgoing"})
	require.NoError(t, err)
	rows, err := svc.IssueSyncDeliveries(ctx, &actor, actor.Username, repo)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	claim, err := svc.ClaimIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID)
	require.NoError(t, err)
	// A topic reaction that beats the outbound receipt stays unacknowledged.
	_, err = ingest("r0", "", "21", "reaction_add", "+1")
	var retry *api.APIError
	require.ErrorAs(t, err, &retry)
	require.Equal(t, 409, retry.Status)
	require.NoError(t, svc.CompleteIssueSync(ctx, &actor, actor.Username, repo, rows[0].ID, IssueSyncReceipt{State: "sent", Token: claim.Token, MessageID: "20,21"}))
	for range 2 {
		got, err := ingest("r1", "", "21", "reaction_add", "+1")
		require.NoError(t, err)
		require.Equal(t, topicIssue, got)
	}
	reactions, err := svc.IssueReactions(ctx, &actor, actor.Username, repo, number, comment.ID)
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{{Name: "+1", Actor: "telegram:123:42", Active: true}}, reactions)
	require.Empty(t, reactions[0].Username)
	wire, err := json.Marshal(reactions)
	require.NoError(t, err)
	require.NotContains(t, string(wire), "username", "external actors are not native-account ownership metadata")
	got, err := ingest("r2", "", "21", "reaction_remove", "+1")
	require.NoError(t, err)
	require.Equal(t, topicIssue, got)
	reactions, err = svc.IssueReactions(ctx, &actor, actor.Username, repo, number, comment.ID)
	require.NoError(t, err)
	require.Empty(t, reactions)
}

func TestIssueReactionNativeOwnershipReadbackAndSpoofedRemoval(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	owner, repo := issueCovSeedUserRepo(t, pool)
	other, _ := issueCovSeedUserRepo(t, pool)
	_, err := pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'write')`, issueTxRepoID(t, pool, repo), other.ID)
	require.NoError(t, err)
	svc := NewIssueService(db.New(pool))
	issue, err := svc.CreateIssue(ctx, &owner, owner.Username, repo, CreateIssueInput{Title: "reaction identity"})
	require.NoError(t, err)
	comment, err := svc.CreateIssueComment(ctx, &owner, owner.Username, repo, issue.Number, CreateIssueCommentInput{Body: "message"})
	require.NoError(t, err)
	owned := IssueReaction{Name: "thumbsup", Actor: fmt.Sprintf("user:%d", owner.ID), Username: owner.Username, Active: true}
	otherOwned := IssueReaction{Name: "thumbsup", Actor: fmt.Sprintf("user:%d", other.ID), Username: other.Username, Active: true}
	// The authenticated principal, never caller-supplied identity fields, owns the write.
	rows, err := svc.SetIssueReaction(ctx, &owner, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Actor: otherOwned.Actor, Username: other.Username, Active: true})
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned}, rows)
	rows, err = NewIssueService(db.New(pool)).IssueReactions(ctx, &other, owner.Username, repo, issue.Number, comment.ID)
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned}, rows)
	rows, err = svc.SetIssueReaction(ctx, &other, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Actor: owned.Actor, Username: owner.Username, Active: false})
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned}, rows, "a collaborator cannot remove the owner's reaction by spoofing metadata")
	rows, err = svc.SetIssueReaction(ctx, &other, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Active: true})
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned, otherOwned}, rows)
	rows, err = svc.SetIssueReaction(ctx, &owner, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Active: true})
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned, otherOwned}, rows)
	var events int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM issue_events WHERE issue_id=$1 AND event_type='comment.reaction'`, issue.ID).Scan(&events))
	require.Equal(t, 2, events, "desired-state replay and spoofed removal emit no extra durable changes")
	rows, err = svc.SetIssueReaction(ctx, &other, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Active: false})
	require.NoError(t, err)
	require.Equal(t, []IssueReaction{owned}, rows)
	rows, err = svc.SetIssueReaction(ctx, &owner, owner.Username, repo, issue.Number, comment.ID, IssueReaction{Name: "thumbsup", Active: false})
	require.NoError(t, err)
	require.Empty(t, rows)
	rows, err = NewIssueService(db.New(pool)).IssueReactions(ctx, &owner, owner.Username, repo, issue.Number, comment.ID)
	require.NoError(t, err)
	require.Empty(t, rows)
}
