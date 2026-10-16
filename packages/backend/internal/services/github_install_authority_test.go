package services

import (
	"bytes"
	"context"
	"log/slog"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

type sealedInstallationCredentials struct{ installation int64 }

func (c sealedInstallationCredentials) Load(ctx context.Context) (GitHubAppCredentials, error) {
	return GitHubAppCredentials{ID: 42, InstallationID: c.installation}, nil
}
func (sealedInstallationCredentials) InstallURL(context.Context) (string, error) { return "", nil }
func (sealedInstallationCredentials) AppJWT(context.Context) (string, error)     { return "", nil }

// A declined install authority bind refuses every fetched-state read for the
// life of the process, and the read's own no_install_authority fence cannot say
// which provider the bind lacked. A real composed install answered
// GET /api/issues with 503 for exactly this reason and nothing in its log named
// the bind, so the bind names the provider it does not have.
func TestInstallAuthorityBindNamesItsMissingProvider(t *testing.T) {
	const sealed = 91001
	row := db.GithubSyncedRepo{
		ID:                 1,
		InstallationID:     pgtype.Int8{Int64: sealed, Valid: true},
		GithubRepositoryID: pgtype.Int8{Int64: 100, Valid: true},
		SyncMetadata:       true,
		SyncState:          "active",
	}
	for _, test := range []struct {
		name        string
		provider    string
		credentials GitHubAppCredentialReader
		ready       bool
		sync        bool
	}{
		{name: "no install sync", provider: authorityUnboundNoSync, credentials: sealedInstallationCredentials{sealed}, ready: true},
		{name: "no app credentials", provider: authorityUnboundNoCredentials, ready: true, sync: true},
		{name: "a runtime that is not ready", provider: authorityUnboundRuntime, credentials: sealedInstallationCredentials{sealed}, sync: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			var records bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&records, nil)))
			t.Cleanup(func() { slog.SetDefault(previous) })
			service := &GitHubSyncedRepoService{}
			if test.sync {
				service.install = &gitHubInstallSync{}
			}
			service.BindInstallAuthority(test.credentials, test.ready)
			require.Contains(t, records.String(), "github.install_authority_unbound")
			require.Contains(t, records.String(), "provider="+test.provider)
			if test.sync {
				require.Nil(t, service.install.authorize, "a declined bind installs no authorizer")
				require.Equal(t, "no_install_authority", gitHubFetchedFence(service, row))
				require.Error(t, service.authorizeFetched(t.Context(), row), "an unbound authority refuses the read")
			}
		})
	}
	t.Run("every provider present admits the sealed installation and refuses another", func(t *testing.T) {
		var records bytes.Buffer
		previous := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&records, nil)))
		t.Cleanup(func() { slog.SetDefault(previous) })
		service := &GitHubSyncedRepoService{install: &gitHubInstallSync{}}
		service.BindInstallAuthority(sealedInstallationCredentials{sealed}, true)
		require.NotContains(t, records.String(), "github.install_authority_unbound")
		require.NotNil(t, service.install.authorize)
		require.Empty(t, gitHubFetchedFence(service, row))
		require.NoError(t, service.authorizeFetched(t.Context(), row))
		foreign := row
		foreign.InstallationID = pgtype.Int8{Int64: sealed + 1, Valid: true}
		require.Error(t, service.authorizeFetched(t.Context(), foreign), "another installation is still refused")
	})
}
