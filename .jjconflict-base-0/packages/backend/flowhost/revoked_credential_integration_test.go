package flowhost

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A RELEASE REVOKES A BINDING'S CONTROL CREDENTIAL (smithers G4, guardian
// s-v4whcl). A coding host's control credential and the model credential
// derived from it have no TTL, so a run that copied them could spend them
// until the next start. The release revokes them with the landing and cache
// tokens (db RetireFlowHostCredentials); both verifiers refuse them at once,
// and the next start on the same binding row mints a replacement that works.
func TestPostgresARevokedHostCredentialIsRefusedAndTheNextStartReplacesIt(t *testing.T) {
	pool := hostTestPool(t)
	ctx := context.Background()
	authority, catalog := hostFixture(t, pool)
	store, err := NewStore(pool, testCodec{})
	require.NoError(t, err)

	first, err := store.Acquire(ctx, authority, catalog)
	require.NoError(t, err)
	binding, err := first.PrepareStart(ctx, false)
	require.NoError(t, err)
	control := first.Credential()
	require.NoError(t, first.Close())
	_, err = VerifyHostCredential(ctx, pool, binding.ID, control)
	require.NoError(t, err, "the started host's control credential verifies")
	_, err = VerifyModelCredential(ctx, pool, testCodec{}, ModelCredential(binding.ID, control))
	require.NoError(t, err, "and its model credential")

	_, err = db.New(pool).RetireFlowHostCredentials(ctx, binding.ID, binding.OwnerGeneration, binding.UserID, nil)
	require.NoError(t, err)

	_, err = VerifyHostCredential(ctx, pool, binding.ID, control)
	require.ErrorIs(t, err, ErrHostCredentialInvalid, "the revoked control credential is refused")
	_, err = VerifyModelCredential(ctx, pool, testCodec{}, ModelCredential(binding.ID, control))
	require.ErrorIs(t, err, ErrModelCredentialInvalid, "and the model credential derived from it")

	next, err := store.Acquire(ctx, authority, catalog)
	require.NoError(t, err, "a revoked credential does not block its binding")
	replaced, err := next.PrepareStart(ctx, true)
	require.NoError(t, err)
	fresh := next.Credential()
	require.NoError(t, next.Close())
	require.Equal(t, binding.ID, replaced.ID, "the next start reuses the binding row")
	require.Greater(t, replaced.OwnerGeneration, binding.OwnerGeneration)
	require.NotEqual(t, control, fresh)
	_, err = VerifyHostCredential(ctx, pool, binding.ID, fresh)
	require.NoError(t, err, "the replacement generation's control credential verifies")
	_, err = VerifyModelCredential(ctx, pool, testCodec{}, ModelCredential(binding.ID, fresh))
	require.NoError(t, err, "and its model credential")
	_, err = VerifyHostCredential(ctx, pool, binding.ID, control)
	require.ErrorIs(t, err, ErrHostCredentialInvalid, "the revoked one stays refused")
}
