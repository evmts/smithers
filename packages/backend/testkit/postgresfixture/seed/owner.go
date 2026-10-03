package seed

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// InstallOwner records username as the install's verified owner, as the
// claim from a setup session followed by GitHub confirming push access does,
// and mints an API token for it. Tests that drive a real backend use it in
// place of the GitHub round trip; the claim, the provisional phase and the
// verification are covered by the owner sign-in integration test.
func InstallOwner(ctx context.Context, pool *pgxpool.Pool, username string, githubUserID int64) (string, error) {
	username = strings.TrimSpace(username)
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := "smithers_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		user, err := q.CreateUser(ctx, db.CreateUserParams{
			Username: username, LowerUsername: strings.ToLower(username), DisplayName: username,
		})
		if err != nil {
			return err
		}
		if err := q.SetUserAdmin(ctx, db.SetUserAdminParams{UserID: user.ID, IsAdmin: true}); err != nil {
			return err
		}
		if err := q.ClaimSelfHostOwner(ctx, user.ID); err != nil {
			return err
		}
		member, err := q.AddCollaborator(ctx, db.AddCollaboratorParams{UserID: pgtype.Int8{Int64: user.ID, Valid: true}, Permission: "admin"})
		if err != nil {
			return err
		}
		if err := q.SetOwnerGitHubIdentity(ctx, db.SetOwnerGitHubIdentityParams{ID: member.ID, GithubUserID: pgtype.Int8{Int64: githubUserID, Valid: true}}); err != nil {
			return err
		}
		if err := q.MarkMemberAccessChecked(ctx, member.ID); err != nil {
			return err
		}
		if _, err := q.DeleteInstallSetting(ctx, "setup_token"); err != nil {
			return err
		}
		_, err = q.CreateAccessToken(ctx, db.CreateAccessTokenParams{
			UserID: user.ID, Name: "test-owner", TokenHash: hash, TokenLastEight: hash[len(hash)-8:],
			Scopes: "write:repository,write:user,write:workspace,write:approval,write:agent",
		})
		return err
	})
	if err != nil {
		return "", err
	}
	return token, nil
}
