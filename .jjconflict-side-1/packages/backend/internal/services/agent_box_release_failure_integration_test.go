package services

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/productstore"
)

// A CREDENTIAL A RELEASE CANNOT CONFIRM REVOKED KEEPS ITS BOX DIRTY (Security
// s-50rmyl, guardian-review f-6kwj6g). The run may have copied its landing
// token, so a token that outlives the turn stays a working credential. A
// release whose head, landing or cache token revocation fails, or is not read
// back as gone, fails; its box stays unreaped; and the sweep retries until
// every token is gone.

// faultyReleaseStore is the hosted store with failures injected into named
// methods until cleared: an error, or a call that outlasts its deadline.
type faultyReleaseStore struct {
	hostedProductStore
	mu     sync.Mutex
	faults map[string]string
}

func (s *faultyReleaseStore) fail(ctx context.Context, method string) error {
	s.mu.Lock()
	fault := s.faults[method]
	s.mu.Unlock()
	switch fault {
	case "error":
		return fmt.Errorf("injected %s failure", method)
	case "timeout":
		<-ctx.Done()
		return ctx.Err()
	}
	return nil
}

func (s *faultyReleaseStore) clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.faults = map[string]string{}
}

func (s *faultyReleaseStore) RetireFlowHostCredentials(ctx context.Context, bindingID string, ownerGeneration, userID int64, names []string) (int64, error) {
	if err := s.fail(ctx, "RetireFlowHostCredentials"); err != nil {
		return 0, err
	}
	return s.hostedProductStore.RetireFlowHostCredentials(ctx, bindingID, ownerGeneration, userID, names)
}

func (s *faultyReleaseStore) ListFlowHostBindingHolders(ctx context.Context, workspaceID string) ([]db.FlowHostBindingHolder, error) {
	if err := s.fail(ctx, "ListFlowHostBindingHolders"); err != nil {
		return nil, err
	}
	return s.hostedProductStore.ListFlowHostBindingHolders(ctx, workspaceID)
}

func (s *faultyReleaseStore) SwapWorkspaceHeadPushTokenID(ctx context.Context, id string, userID int64, expected, next pgtype.Int8) (bool, error) {
	if err := s.fail(ctx, "SwapWorkspaceHeadPushTokenID"); err != nil {
		return false, err
	}
	return s.hostedProductStore.SwapWorkspaceHeadPushTokenID(ctx, id, userID, expected, next)
}

func (s *faultyReleaseStore) DeleteAccessToken(ctx context.Context, arg db.DeleteAccessTokenParams) error {
	if err := s.fail(ctx, "DeleteAccessToken"); err != nil {
		return err
	}
	return s.hostedProductStore.DeleteAccessToken(ctx, arg)
}

// useStore rebuilds the box's service over store, keeping its runtime.
func (f *agentBoxRelease) useStore(store WorkspaceQuerier) {
	boxes := newWorkspaceServiceForTests(store, WithWorkspaceRuntime(f.boxes.runtime), WithWorkspaceTransactions(f.pool),
		WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
	boxes.gitBaseURL, boxes.branchMachineProviders = f.boxes.gitBaseURL, f.boxes.branchMachineProviders
	boxes.branchHeads, boxes.agentBoxIdleCap = f.boxes.branchHeads, f.boxes.agentBoxIdleCap
	f.boxes = boxes
	f.agent.SetWorkspaceBackend(boxes)
}

func TestARunWhoseCredentialRevocationFailsLeavesItsBoxDirtyUntilTheSweepRevokesIt(t *testing.T) {
	for _, tc := range []struct {
		name     string
		faults   map[string]string
		leftLive string
	}{
		{name: "a host credential revoke error", faults: map[string]string{"RetireFlowHostCredentials": "error"}, leftLive: "landing"},
		{name: "a host credential revoke timeout", faults: map[string]string{"RetireFlowHostCredentials": "timeout"}, leftLive: "landing"},
		{name: "a host list read error", faults: map[string]string{"ListFlowHostBindingHolders": "error"}, leftLive: "landing"},
		{name: "a head token revoke not confirmed", faults: map[string]string{"SwapWorkspaceHeadPushTokenID": "error", "DeleteAccessToken": "error"}, leftLive: "head"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			step := agentBoxStepTimeout
			agentBoxStepTimeout = 300 * time.Millisecond
			t.Cleanup(func() { agentBoxStepTimeout = step })
			f := newAgentBoxRelease(t, "running")
			store := &faultyReleaseStore{hostedProductStore: hostedProductStore{Product: productstore.New(f.pool)}, faults: tc.faults}
			f.useStore(store)
			f.publishHead(t)

			f.finish(t)

			require.Contains(t, f.releaseLog(t), "outcome=release_failed", "the release fails")
			require.Zero(t, f.reaper.reaped, "the box is not quiesced")
			box := f.box(t)
			require.Equal(t, "running", box.Status)
			require.Equal(t, db.AgentBoxUnreapedStage, box.ProvisioningStage, "the box stays dirty")
			require.True(t, f.tokenLive(t, tc.leftLive), "the %s token the failure left is still live", tc.leftLive)

			// The sweep retries; while the failure lasts the box stays dirty.
			require.Error(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
			require.Equal(t, db.AgentBoxUnreapedStage, f.box(t).ProvisioningStage)
			require.Zero(t, f.runtime.deletes.Load())

			store.clear()
			require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
			f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
			retired := f.box(t)
			require.Equal(t, "suspended", retired.Status, "the retry retires the box")
			require.Equal(t, db.AgentBoxRetiredStage, retired.ProvisioningStage)
			require.Equal(t, int32(1), f.runtime.deletes.Load())
		})
	}
}

// A runtime that does not declare workspaceapi.WorkspaceGuestFence could stop,
// reap or delete a guest built since the release was decided, so a release
// on it touches no guest: it fails and leaves the box dirty (Security
// s-r9rwwx).
func TestAReleaseOnARuntimeThatCannotFenceAGuestTouchesNoGuest(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.hosted.unfenced = true

	f.finish(t)

	require.Contains(t, f.releaseLog(t), "outcome=release_failed")
	require.Contains(t, f.releaseLog(t), "workspace.WorkspaceGuestFence")
	require.Empty(t, f.hosted.stopped, "no host was stopped")
	require.Zero(t, f.reaper.reaped, "nothing was reaped")
	require.Zero(t, f.runtime.deletes.Load(), "nothing was deleted")
	require.Equal(t, db.AgentBoxUnreapedStage, f.box(t).ProvisioningStage, "the box stays dirty")
}

// A hosted coding host's landing and cache credentials live two hours; an
// install's live seven days (Security s-50rmyl).
func TestAHostedCodingHostsCredentialsLiveTwoHours(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	box := f.box(t)
	install := newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(f.pool)}, WithWorkspaceRuntime(f.boxes.runtime))
	install.EnableMachineAdmission(nil)
	for _, tc := range []struct {
		name string
		svc  *WorkspaceService
		ttl  time.Duration
	}{
		{name: "hosted", svc: f.boxes, ttl: 2 * time.Hour},
		{name: "install", svc: install, ttl: 7 * 24 * time.Hour},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q, ok := tc.svc.q.(boxHostQuerier)
			require.True(t, ok)
			landing, cache, err := tc.svc.mintBoxHostCredentials(f.ctx, q, "host-"+tc.name, f.person, box.RepositoryID, box.ID, "read:repository")
			require.NoError(t, err)
			for _, id := range []int64{landing.ID, cache.ID} {
				var expires time.Time
				require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT expires_at FROM access_tokens WHERE id=$1`, id).Scan(&expires))
				require.WithinDuration(t, time.Now().Add(tc.ttl), expires, time.Minute)
			}
		})
	}
}

// QUIESCE REVOKES EVERYTHING THE RUN WAS GIVEN AND TOUCHES NOTHING ELSE (B2,
// Security s-j6ein4). A server-run test executes in the guest after quiesce
// and before the run completes, so the head token, the coding host and its
// landing and cache credentials, and the git credential cache (whose Unix
// socket a network namespace does not isolate) are all gone first.
func TestQuiesceAgentBoxRevokesEveryCredentialAndEndsTheGitCredentialCache(t *testing.T) {
	t.Run("a confirmed quiesce", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		require.True(t, f.hosted.credentialCache, "the run's guest holds a git credential cache")
		binding, control := f.sealHostCredential(t)
		model := flowhost.ModelCredential(binding, control)
		_, err := flowhost.VerifyHostCredential(f.ctx, f.pool, binding, control)
		require.NoError(t, err, "the coding host's control credential verifies during the run")
		_, err = flowhost.VerifyModelCredential(f.ctx, f.pool, sealedCodec{}, model)
		require.NoError(t, err, "and its model credential")

		got, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)

		require.NoError(t, err)
		require.Equal(t, agentWorkspaceQuiesced, got.Outcome)
		require.True(t, got.Quiesced)
		require.True(t, got.HeadTokenRevoked)
		_, err = flowhost.VerifyHostCredential(f.ctx, f.pool, binding, control)
		require.ErrorIs(t, err, flowhost.ErrHostCredentialInvalid, "a copied control credential is refused after quiesce")
		_, err = flowhost.VerifyModelCredential(f.ctx, f.pool, sealedCodec{}, model)
		require.ErrorIs(t, err, flowhost.ErrModelCredentialInvalid, "a copied model credential is refused after quiesce")
		for _, name := range []string{"head", "landing", "cache"} {
			require.False(t, f.tokenLive(t, name), "the %s token is revoked", name)
		}
		require.Contains(t, f.hosted.stopped, "smithers-coding-host", "the coding host is stopped")
		require.False(t, f.hosted.credentialCache, "the git credential cache socket is gone")
		require.Zero(t, f.reaper.reaped, "a quiesce does not reap")
		require.Zero(t, f.runtime.deletes.Load(), "nor retire")
		box := f.box(t)
		require.Equal(t, "running", box.Status)
		require.Empty(t, box.ProvisioningStage, "the box is clean")
		require.Equal(t, "vm-agent-box", box.VmID)

		again, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)
		require.NoError(t, err, "quiesce is idempotent")
		require.Equal(t, agentWorkspaceQuiesced, again.Outcome)
		require.Empty(t, f.box(t).ProvisioningStage)
	})

	t.Run("a git credential cache that will not end", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		f.hosted.credentialCacheStuck = true

		got, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)

		require.ErrorIs(t, err, errAgentBoxCredentialCacheLive)
		require.Equal(t, agentWorkspaceReleaseFailed, got.Outcome)
		require.False(t, got.Quiesced)
		require.Equal(t, db.AgentBoxUnreapedStage, f.box(t).ProvisioningStage, "the box stays dirty for the sweep")
	})

	t.Run("an unreaped box stays unreaped", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET provisioning_stage=$2 WHERE id=$1`, f.workspace, db.AgentBoxUnreapedStage)
		require.NoError(t, err)

		got, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, f.session, f.run)

		require.NoError(t, err)
		require.Equal(t, agentWorkspaceUnreaped, got.Outcome)
		require.False(t, f.tokenLive(t, "landing"), "its credentials are revoked all the same")
		require.Equal(t, db.AgentBoxUnreapedStage, f.box(t).ProvisioningStage, "only a retirement makes it clean")
	})
}

// sealedCodec is a test flowhost.SecretCodec.
type sealedCodec struct{}

func (sealedCodec) EncryptString(value string) (string, error) { return "sealed:" + value, nil }
func (sealedCodec) DecryptString(value string) (string, error) {
	plain, ok := strings.CutPrefix(value, "sealed:")
	if !ok {
		return "", errors.New("not sealed")
	}
	return plain, nil
}

// sealHostCredential gives the box's coding host binding a real control
// credential, sealed with sealedCodec, and answers the binding and the
// credential.
func (f *agentBoxRelease) sealHostCredential(t *testing.T) (binding, credential string) {
	t.Helper()
	credential = "control-" + uuid.NewString()
	digest := sha256.Sum256([]byte(credential))
	require.NoError(t, f.pool.QueryRow(f.ctx, `UPDATE flow_runtime_host_bindings SET credential_ciphertext=$2, credential_hash=$3
		WHERE workspace_id=$1 RETURNING id::text`, f.workspace, "sealed:"+credential, digest[:]).Scan(&binding))
	return binding, credential
}
