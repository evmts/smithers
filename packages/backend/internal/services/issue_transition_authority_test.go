package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * Which policy row authorizes a declared issue transition (#4027, M-47).
 *
 * A transition is its own operation. The app declares it, the generator
 * projects it, and `retained-http.json` records it, as `issues.transition`:
 * agent "confirm", minimumRole "member", actors ["person", "app_agent"] —
 * exactly like `issues.close`, `issues.reopen` and `issue.comment`, which
 * ride the same hosted writer.
 *
 * It was bound to `labels.create` instead, which is the row for a different
 * door: POST /api/repos/{o}/{r}/labels, the repository's LABEL SET, owner
 * only. The two outcomes below are read out of the real install authorizer
 * against real composed roles in a real PostgreSQL database, so the harm is
 * shown rather than argued: that row refuses an install MAINTAINER and an
 * install MEMBER a move whose own descriptor is member-level, and the
 * minimumRole it carries was read by authorizeIssueTransition and never
 * enforced there.
 *
 * `labels.create` keeps its own rule and its own doors; nothing is weakened
 * globally and no second policy table exists.
 */
func TestIssueTransitionDoorCarriesItsOwnDeclaredOperation(t *testing.T) {
	assert.Equal(t, "issues.transition", issueTransitionCommand)
	// The real route-to-command classification an install enforces
	// (compose/member_commands.go runs services.Authorize on exactly this).
	assert.Equal(t, "issues.transition",
		middleware.InstallMemberCommand(http.MethodPost, "/api/repos/maya/demo/github/issues/6/transitions/accept"))
	// The INSTALL door the install client already addresses (#4067). The
	// install client sends every GitHub issue act to /api/issues{path}
	// (IssuesSeam.ts githubIssueActUrl), so the declared transition arrives
	// here — and it must carry the SAME row, never a second policy.
	assert.Equal(t, "issues.transition",
		middleware.InstallMemberCommand(http.MethodPost, "/api/issues/6/transitions/accept"))
	// Its siblings on the same family and the same writer, unchanged.
	for path, command := range map[string]string{
		"/api/repos/maya/demo/github/issues/6/close":    "issues.close",
		"/api/repos/maya/demo/github/issues/6/reopen":   "issues.reopen",
		"/api/repos/maya/demo/github/issues/6/comments": "issue.comment",
		"/api/issues/6/close":                           "issues.close",
		"/api/issues/6/reopen":                          "issues.reopen",
		"/api/issues/6/comments":                        "issue.comment",
	} {
		assert.Equal(t, command, middleware.InstallMemberCommand(http.MethodPost, path), path)
	}
	// And the repository label SET door keeps its own owner-only row.
	assert.Equal(t, "labels.create",
		middleware.InstallMemberCommand(http.MethodPost, "/api/repos/maya/demo/labels"))

	declared, known := OperationPolicy(issueTransitionCommand)
	require.True(t, known)
	assert.Equal(t, "member", declared.MinimumRole)
	assert.Equal(t, "confirm", declared.Agent)
	assert.Equal(t, []string{"person", "app_agent"}, declared.Actors)
	assert.Equal(t, "write:repository", declared.CredentialScope)

	labels, known := OperationPolicy("labels.create")
	require.True(t, known, "the label set door's own row is untouched")
	assert.Equal(t, "owner", labels.MinimumRole)
	assert.Equal(t, "never", labels.Agent)
	assert.Equal(t, []string{"person"}, labels.Actors)
}

// The install's own authorizer, over real roster rows: every role's actual
// outcome on both rows, so "owner-scoped vs repo-scoped" is read off the
// product rather than inferred from a type name.
func TestIssueTransitionInstallRolesComposedPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	user := func(login string) db.User {
		t.Helper()
		row, err := q.CreateUser(ctx, db.CreateUserParams{Username: login, LowerUsername: login})
		require.NoError(t, err)
		return row
	}
	owner, maintainer, member, readOnly := user("maya"), user("ben"), user("alice"), user("ana")
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true},
		Name: "demo", LowerName: "demo", DefaultBookmark: "main"})
	require.NoError(t, err)
	exec(`INSERT INTO self_host_owners(user_id) VALUES($1)`, owner.ID)
	exec(`INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'admin')`, repo.ID, maintainer.ID)
	exec(`INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'write')`, repo.ID, member.ID)
	exec(`INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'read')`, repo.ID, readOnly.ID)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository",
		Value: []byte(fmt.Sprintf(`{"owner_login":"maya","repository_name":"demo","repository_id":%d}`, repo.ID))}))

	// One real browser session per person, reloaded through the credential
	// path the HTTP chain uses.
	actor := func(person db.User) context.Context {
		t.Helper()
		sum := sha256.Sum256([]byte("transition-" + person.Username))
		hash := hex.EncodeToString(sum[:])
		_, err := q.CreateAuthSession(ctx, db.CreateAuthSessionParams{UserID: person.ID, Username: person.Username,
			SessionKey: hash, ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		info, err := middleware.ReloadCredential(ctx, q, middleware.Credential{SessionHash: hash}, time.Now())
		require.NoError(t, err)
		return middleware.ContextWithAuthInfo(ctx, info)
	}

	for _, person := range []struct {
		row   db.User
		admit bool
	}{{owner, true}, {maintainer, true}, {member, true}, {readOnly, false}} {
		bound := actor(person.row)
		_, declaredErr := Authorize(bound, q, issueTransitionCommand)
		if person.admit {
			assert.NoError(t, declaredErr, "%s holds the member place this move declares", person.row.Username)
		} else {
			assert.Error(t, declaredErr, "%s holds no write place at all", person.row.Username)
		}
		// Why `labels.create` was the wrong row: it refuses a maintainer and
		// a member outright.
		_, labelErr := Authorize(bound, q, "labels.create")
		switch person.row.Username {
		case "maya":
			assert.NoError(t, labelErr, "the install owner is the label set's own authority")
		default:
			assert.Error(t, labelErr, "%s is refused the label SET door, correctly", person.row.Username)
		}
	}
}
