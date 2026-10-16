package services

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
)

// Make TODO as roster members through the production FileTodo, the
// install's App and the GitHub fake, with real PostgreSQL (C-J2-01,
// C-SEC-03). The issue is read through the App as the stack's actor, so a
// member's own GitHub credential is never asked: a Member makes a TODO from
// a member's issue; an outsider's issue is a maintainer's to make (§10.2.1),
// and the maintainer's TODO from it is marked outsider.
func TestMembersMakeTodosFromIssuesThroughTheApp(t *testing.T) {
	f := newPublicationFixture(t, false)
	ctx := context.Background()
	const repo = "rehearsal-owner/app"
	q := db.New(f.pool)
	f.fake.SetCollaborator(8, "ben", "maintain")
	f.fake.SetCollaborator(9, "alice", "write")
	f.fake.SetCollaborator(10, "carol", "read")
	team := f.fake.OpenIssue(repo, "ben", "Say goodbye", "JOURNEY.md should end with a farewell.")
	outsider := f.fake.OpenIssue(repo, "carol", "Crash on start", "It crashes.")
	binding := fmt.Sprintf(`{"owner_login":"smithers-canary","repository_name":"smithers","repository_id":%d}`, f.repoID)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: []byte(binding)}))
	person := func(login, permission string) context.Context {
		t.Helper()
		var id int64
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO users(username,lower_username,display_name) VALUES($1,$1,$1) RETURNING id`, login).Scan(&id))
		_, err := f.pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,$3)`, f.repoID, id, permission)
		require.NoError(t, err)
		githubID := int64(8)
		if login == "alice" {
			githubID = 9
		}
		_, err = f.pool.Exec(ctx, `UPDATE collaborators SET github_id=$3,github_login=$4 WHERE repository_id=$1 AND user_id=$2`, f.repoID, id, githubID, login)
		require.NoError(t, err)
		_, err = q.CreateAuthSession(ctx, db.CreateAuthSessionParams{SessionKey: login + "-session", UserID: id, Username: login, ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		return registerTestInstallCredential(t, f.pool, middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &db.User{ID: id}, SessionHash: login + "-session"}), f.repoID)
	}
	alice, ben := person("alice", "write"), person("ben", "admin")
	commit := func(as context.Context, number int64, title, body, key string) (MythicalItemView, error) {
		snapshot, err := f.service.InstallIssue(as, f.repoID, number)
		require.NoError(t, err)
		return f.service.FileTodo(as, f.repoID, middleware.AuthInfoFromContext(as).User.ID, MythicalTodoInput{Title: title, Prompt: body,
			Issue: &number, IssueDigest: snapshot.IssueDigest, Request: key})
	}

	aliceRead, err := f.service.InstallIssue(alice, f.repoID, team)
	require.NoError(t, err)
	_, err = f.service.FileTodo(ben, f.repoID, middleware.AuthInfoFromContext(ben).User.ID, MythicalTodoInput{Title: "Someone else's snapshot", Prompt: "Do not admit", Issue: &team, IssueDigest: aliceRead.IssueDigest, Request: "foreign-digest"})
	var unknown *TodoControlError
	require.ErrorAs(t, err, &unknown)
	require.Equal(t, "issue_snapshot_unknown", unknown.Code)
	made, err := commit(alice, team, "Say goodbye", "JOURNEY.md should end with a farewell.", "alice-team")
	require.NoError(t, err)
	item, err := q.GetMythicalItemByNumber(ctx, f.repoID, made.Number)
	require.NoError(t, err)
	require.Equal(t, "issue", item.Source)
	require.EqualValues(t, team, item.IssueNumber.Int64)
	require.Equal(t, middleware.AuthInfoFromContext(alice).User.ID, item.CreatedBy.Int64)
	require.False(t, item.Outsider)

	_, err = commit(alice, outsider, "Crash on start", "It crashes.", "alice-outsider")
	var refused *AccessError
	require.ErrorAs(t, err, &refused)
	require.Equal(t, AccessError{Status: http.StatusForbidden, Class: "permission", Code: "permission", Message: "Only a maintainer can make a TODO from this issue"}, *refused)
	_, err = q.GetActiveMythicalItemByIssue(ctx, f.repoID, outsider)
	require.Error(t, err, "a refused Make TODO files nothing")

	made, err = commit(ben, outsider, "Crash on start", "It crashes.", "ben-outsider")
	require.NoError(t, err)
	item, err = q.GetMythicalItemByNumber(ctx, f.repoID, made.Number)
	require.NoError(t, err)
	require.EqualValues(t, outsider, item.IssueNumber.Int64)
	require.True(t, item.Outsider, "a maintainer's TODO from an outsider's text is marked outsider")

	// A role change while FileTodo waits for the stack must fence the admission.
	raced := f.fake.OpenIssue(repo, "carol", "Race", "Outsider text")
	snapshot, err := f.service.InstallIssue(ben, f.repoID, raced)
	require.NoError(t, err)
	tx, err := f.pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `SELECT 1 FROM mythical_stacks WHERE repository_id=$1 FOR UPDATE`, f.repoID)
	require.NoError(t, err)
	errs := make(chan error, 1)
	go func() {
		_, err := f.service.FileTodo(ben, f.repoID, middleware.UserFromContext(ben).ID, MythicalTodoInput{Title: "Race", Prompt: "Outsider text", Issue: &raced, IssueDigest: snapshot.IssueDigest, Request: "demotion-race"})
		errs <- err
	}()
	require.Eventually(t, func() bool {
		var waiting bool
		err := f.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT 1 FROM mythical_stacks WHERE repository_id=$1 FOR UPDATE')`).Scan(&waiting)
		return err == nil && waiting
	}, 5*time.Second, 10*time.Millisecond)
	_, err = tx.Exec(ctx, `UPDATE collaborators SET permission='write' WHERE repository_id=$1 AND user_id=$2`, f.repoID, middleware.UserFromContext(ben).ID)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))
	require.ErrorAs(t, <-errs, &refused)
	require.Equal(t, http.StatusForbidden, refused.Status)
	_, err = q.GetActiveMythicalItemByIssue(ctx, f.repoID, raced)
	require.Error(t, err)
}

func TestIssueTextRequiresActiveRosterAndCurrentPush(t *testing.T) {
	f := newPublicationFixture(t, false)
	ctx := context.Background()
	const repo = "rehearsal-owner/app"
	f.fake.SetCollaborator(8, "ben", "write")
	f.fake.SetCollaborator(9, "eve", "write")
	_, err := f.pool.Exec(ctx, `INSERT INTO collaborators(repository_id,github_login,github_id,permission) VALUES($1,'ben',8,'write')`, f.repoID)
	require.NoError(t, err)
	bindIssueEventMembers(t, f.pool, f.repoID)
	repository, owner, err := f.service.repository(ctx, f.repoID)
	require.NoError(t, err)
	gh, err := f.service.github.Resolve(ctx, repository, owner, f.userID)
	require.NoError(t, err)
	// GitHub push alone does not make the author a member.
	unlisted := f.fake.OpenIssue(repo, "eve", "Push without roster", "Body")
	raw, err := f.service.github.Issue(ctx, gh, unlisted)
	require.NoError(t, err)
	trusted, err := f.service.todoIssueTeamText(ctx, f.repoID, gh, raw)
	require.NoError(t, err)
	require.False(t, trusted)
	// The install App's own Bot author uses GitHub's GraphQL login shape.
	own, err := f.service.github.CreateIssue(ctx, gh, "App issue", "Body")
	require.NoError(t, err)
	raw, err = f.service.github.Issue(ctx, gh, own.Number)
	require.NoError(t, err)
	trusted, err = f.service.todoIssueTeamText(ctx, f.repoID, gh, raw)
	require.NoError(t, err)
	require.True(t, trusted)
	number := f.fake.OpenIssue(repo, "ben", "Title", "Body")
	check := func(want bool) {
		t.Helper()
		issue, err := f.service.github.Issue(ctx, gh, number)
		require.NoError(t, err)
		team, err := f.service.todoIssueTeamText(ctx, f.repoID, gh, issue)
		require.NoError(t, err)
		require.Equal(t, want, team)
	}
	check(true)
	_, err = f.pool.Exec(ctx, `UPDATE collaborators SET suspended_at=now() WHERE repository_id=$1 AND github_id=8`, f.repoID)
	require.NoError(t, err)
	check(false)
	_, err = f.pool.Exec(ctx, `UPDATE collaborators SET suspended_at=NULL WHERE repository_id=$1 AND github_id=8`, f.repoID)
	require.NoError(t, err)
	f.fake.SetCollaborator(8, "ben", "read")
	check(false)
	f.fake.SetCollaborator(8, "ben", "write")
	f.fake.EditIssue(repo, number, "eve", "Title", "Changed by push holder outside roster")
	check(false)
}
