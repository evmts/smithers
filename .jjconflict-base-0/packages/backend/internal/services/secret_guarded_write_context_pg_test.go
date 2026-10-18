package services

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
)

// boundedOwnershipGuard is the ownership fence's shape with the one thing this
// regression is about made visible: the context it hands the guarded write is
// NOT the caller's. The real fence derives a bounded hold context and passes
// that; this one derives a context it can end on command, so a test can tell
// whether the write ran on the context the fence gave it or on the one its
// enclosing method happened to hold.
type boundedOwnershipGuard struct {
	ran   bool
	inner error
	// endBeforeWrite cancels the guarded context before calling write, which
	// is the state a real exhausted hold reaches: the fence is still holding
	// its connection and the repository's ownership lock, and its budget is
	// spent.
	endBeforeWrite bool
}

func (g *boundedOwnershipGuard) WithRepoOwnershipShared(ctx context.Context, _ db.Repository, write func(context.Context) error) error {
	held, endHold := context.WithCancel(ctx)
	defer endHold()
	if g.endBeforeWrite {
		endHold()
	}
	g.ran = true
	g.inner = held.Err()
	return write(held)
}

func guardedSecretRepository(t *testing.T, slug string) (owner *db.User, admin *db.User, repo string, repositoryID int64) {
	t.Helper()
	pool := getAgentTestPool(t)
	owner = createSecretIntegrationUser(t, slug+"owner")
	admin = createSecretIntegrationUser(t, slug+"admin")
	repo = fmt.Sprintf("%srepo%d", slug, time.Now().UnixNano())
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO repositories
		 (user_id, name, lower_name, description, is_public, default_bookmark, next_issue_number, next_landing_number)
		 VALUES ($1, $2, $2, '', TRUE, 'main', 1, 1)
		 RETURNING id`, owner.ID, repo).Scan(&repositoryID))
	_, err := pool.Exec(context.Background(),
		`INSERT INTO collaborators (repository_id, user_id, permission) VALUES ($1, $2, 'admin')`,
		repositoryID, admin.ID)
	require.NoError(t, err)
	return owner, admin, repo, repositoryID
}

// THE SECRET MUTATION RUNS ON THE CONTEXT THE OWNERSHIP FENCE GAVE IT.
//
// guardedSecretWrite receives a bounded context from guardedRepoWrite, but its
// callback used to be func(SecretQuerier) error: every one of its three
// callers closed over the enclosing public method's own ctx and issued the
// real mutation on THAT. So the write that the ownership guard was holding a
// core-pool connection and the repository's ownership lock across ran on an
// unbounded context, and bounding the wrapper bounded nothing — the same
// capture the provisioning claim had.
//
// Held against the real store and real rows: with the guarded context already
// ended and the CALLER's context alive, each of the three writes must refuse
// and NOTHING may land. Then the same calls under a fence that does not end
// its context must succeed, so the refusals above are the inner bound and not
// the arrangement.
func TestGuardedSecretWriteRunsOnTheFencesOwnContext(t *testing.T) {
	pool := getAgentTestPool(t)
	ctx := context.Background()
	owner, admin, repo, repositoryID := guardedSecretRepository(t, "guardedsecret")
	codec, err := webhook.NewSecretCodec("guarded-secret-context-key")
	require.NoError(t, err)

	const name = "CONNECTOR_TOKEN"
	const plaintext = "connector-token-for-unattended-run"
	stored := func() (value string, found bool) {
		rows, err := pool.Query(ctx,
			`SELECT main_only FROM repository_secrets WHERE repository_id = $1 AND name = $2`,
			repositoryID, name)
		require.NoError(t, err)
		defer rows.Close()
		for rows.Next() {
			var mainOnly bool
			require.NoError(t, rows.Scan(&mainOnly))
			return fmt.Sprintf("main_only=%t", mainOnly), true
		}
		require.NoError(t, rows.Err())
		return "", false
	}

	// Seed through a fence that behaves: this is the row the refused writes
	// below must not be able to touch.
	open := &boundedOwnershipGuard{}
	seeding := NewSecretService(db.New(pool), codec, WithSecretOwnershipGuard(open))
	_, err = seeding.SetSecret(ctx, admin, owner.Username, repo, name, plaintext, nil, nil, nil)
	require.NoError(t, err)
	require.True(t, open.ran, "the seeding write never went through the ownership fence")
	before, found := stored()
	require.True(t, found, "the seeded secret is not in the store")

	// Every write, with the fence's own context already ended and the
	// caller's context alive.
	for _, attempt := range []struct {
		name string
		call func(*SecretService) error
	}{
		{"set", func(s *SecretService) error {
			_, err := s.SetSecret(ctx, admin, owner.Username, repo, name, "replaced-by-an-unbounded-write", nil, nil, nil)
			return err
		}},
		{"update settings", func(s *SecretService) error {
			mainOnly := true
			_, err := s.UpdateSecret(ctx, admin, owner.Username, repo, name, &mainOnly, nil)
			return err
		}},
		{"delete", func(s *SecretService) error {
			return s.DeleteSecret(ctx, admin, owner.Username, repo, name)
		}},
	} {
		t.Run(attempt.name, func(t *testing.T) {
			fence := &boundedOwnershipGuard{endBeforeWrite: true}
			service := NewSecretService(db.New(pool), codec, WithSecretOwnershipGuard(fence))
			err := attempt.call(service)
			require.Error(t, err, "a secret mutation on an ended fence context wrote anyway")
			// APIError deliberately has no Unwrap — the cause is kept for the
			// server log and off the wire — so the cause is read through its
			// own accessor. It is the cancellation the fence handed the write,
			// which is the whole claim: the mutation ran on the fence's
			// context, not on the caller's.
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.ErrorIs(t, api.Cause(), context.Canceled,
				"the secret mutation ran on the caller's context instead of the one the ownership fence gave it")
			require.True(t, fence.ran, "the write never reached the ownership fence")
			require.ErrorIs(t, fence.inner, context.Canceled, "the fence did not hand the write an ended context")
			require.NoError(t, ctx.Err(), "the caller's own context was ended, so this proves nothing")

			after, found := stored()
			require.True(t, found, "a refused write deleted the row")
			require.Equal(t, before, after, "a refused write landed in the store")
		})
	}

	// The refusals are the inner bound, not the arrangement: the same calls
	// under a fence that keeps its context open still work, and the row still
	// moves exactly as the request asked.
	working := &boundedOwnershipGuard{}
	service := NewSecretService(db.New(pool), codec, WithSecretOwnershipGuard(working))
	mainOnly := true
	_, err = service.UpdateSecret(ctx, admin, owner.Username, repo, name, &mainOnly, nil)
	require.NoError(t, err)
	after, found := stored()
	require.True(t, found)
	require.Equal(t, "main_only=true", after, "the guarded write did not land")
	require.NoError(t, service.DeleteSecret(ctx, admin, owner.Username, repo, name))
	_, found = stored()
	require.False(t, found, "the guarded delete did not land")
}
