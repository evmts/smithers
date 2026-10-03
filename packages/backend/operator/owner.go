package operator

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	backendconfig "github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
)

// runOwner is the local operator's setup access-check retry for upgraded
// installs. The setup URL links an unlinked owner; this verifies its access.
func runOwner(ctx context.Context, args []string, cfg Config) error {
	if len(args) != 1 || args[0] != "verify-access" {
		return errors.New("usage: smithers-backend owner verify-access")
	}
	if strings.TrimSpace(os.Getenv("SMITHERS_AUTH_MODE")) != "selfhost" {
		return errors.New("owner verify-access requires SMITHERS_AUTH_MODE=selfhost")
	}
	return withDatabase(ctx, cfg, func(pool *pgxpool.Pool) error {
		q := db.New(pool)
		owner, err := q.GetInstallOwner(ctx)
		if err != nil {
			return err
		}
		if !owner.GithubUserID.Valid {
			return errors.New("open the setup URL and sign in with GitHub to link the password owner first")
		}
		hostConfig, err := backendconfig.Load("")
		if err != nil {
			return err
		}
		codec, err := webhook.NewSecretCodec(hostConfig.Webhook.SecretEncryptionKey, hostConfig.Webhook.PreviousKeys()...)
		if err != nil {
			return err
		}
		store := services.NewGitHubAppCredentialStore(pool, codec)
		installations := services.NewGitHubUserReposService(q, nil, services.WithGitHubUserReposCredentialStore(store))
		service := services.NewMemberService(pool, services.NewSettingsInstallRepository(q, installations, hostConfig.Auth.GitHubAppRepository))
		if err := service.VerifyOwner(ctx); err != nil {
			return err
		}
		owner, err = q.GetInstallOwner(ctx)
		if err != nil {
			return err
		}
		if !owner.Verified {
			return errors.New("owner remains provisional: configure SMITHERS_GITHUB_APP_REPOSITORY=owner/name, install the App and grant the owner push access, then retry")
		}
		_, err = fmt.Fprintln(cfg.Stdout, "Owner access verified")
		return err
	})
}
