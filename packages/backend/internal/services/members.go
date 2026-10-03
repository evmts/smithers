package services

import (
	"context"
	"encoding/json"
	stdErrors "errors"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/observability"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// GitHubSignIn carries the GitHub-verified identity and bound setup session.
type GitHubSignIn struct {
	GitHubUserID int64
	Login        string
	Name         string
	// Email is GitHub-verified, or empty.
	Email string
	// SetupSessionKey is the install_settings key of the setup session the
	// sign-in started from and returned to, or empty.
	SetupSessionKey string
	// CompleteClaim persists the OAuth account and person credential in the claim transaction.
	CompleteClaim func(context.Context, *db.Queries, db.User) error
}

// InstallRepository carries the selected repository and its installation token.
type InstallRepository struct {
	Owner, Name, Token string
}

// InstallRepositoryReader resolves the repository for live permission checks.
type InstallRepositoryReader interface {
	InstallRepository(ctx context.Context) (repository InstallRepository, found bool, err error)
}

// SignInGate decides whether a GitHub sign-in may enter the install.
type SignInGate interface {
	AdmitSignIn(ctx context.Context, signIn GitHubSignIn) (db.User, error)
}

// MemberService admits the singleton owner; T-ACC-02 extends it to the roster.
type MemberService struct {
	pool       *pgxpool.Pool
	repository InstallRepositoryReader
	github     *landingGitHubAPI
}

func NewMemberService(pool *pgxpool.Pool, repository InstallRepositoryReader) *MemberService {
	return &MemberService{pool: pool, repository: repository,
		github: &landingGitHubAPI{client: observability.NewHTTPClient(10 * time.Second), baseURL: githubAPIBaseURL}}
}

// AdmitSignIn checks the GitHub identity and returns its admitted user.
func (s *MemberService) AdmitSignIn(ctx context.Context, signIn GitHubSignIn) (db.User, error) {
	if signIn.GitHubUserID <= 0 || strings.TrimSpace(signIn.Login) == "" {
		return db.User{}, pkgerrors.BadRequest("GitHub returned no account")
	}
	queries := db.New(s.pool)
	claimed, err := queries.InstallClaimed(ctx)
	if err != nil {
		return db.User{}, pkgerrors.Internal("failed to read the install owner").WithCause(err)
	}
	if !claimed {
		owner, member, err := s.claimOwner(ctx, signIn)
		if err != nil {
			return db.User{}, err
		}
		if err := s.verifyOwner(ctx, queries, member); err != nil {
			// Claim already includes the credential; a verification outage leaves it provisional.
			slog.Warn("owner access verification failed after claim", "member_id", member.ID, "error", err)
			return owner, nil
		}
		return owner, nil
	}
	if signIn.SetupSessionKey != "" {
		// A sign-in started from a setup session that lost the claim.
		return db.User{}, errSetupClosed()
	}
	member, err := queries.GetInstallOwner(ctx)
	if err != nil {
		if stdErrors.Is(err, pgx.ErrNoRows) {
			return db.User{}, pkgerrors.New(pkgerrors.CodeNotAMember, "not a member of this install")
		}
		return db.User{}, pkgerrors.Internal("failed to read the roster").WithCause(err)
	}
	if !member.GithubUserID.Valid || member.GithubUserID.Int64 != signIn.GitHubUserID {
		return db.User{}, pkgerrors.New(pkgerrors.CodeNotAMember, "not a member of this install")
	}
	// §5.1.2: provisional sign-in skips the permission gate. The setup retry
	// calls VerifyOwner explicitly after choosing/installing the repository.
	if member.Verified {
		if err := s.requirePush(ctx, signIn.Login, signIn.GitHubUserID); err != nil {
			return db.User{}, err
		}
	}
	user, err := queries.GetUserByID(ctx, member.UserID)
	if err != nil {
		return db.User{}, pkgerrors.Internal("failed to load the member").WithCause(err)
	}
	return user, nil
}

// claimOwner atomically records the owner, credential and setup invalidation.
func (s *MemberService) claimOwner(ctx context.Context, signIn GitHubSignIn) (db.User, db.GetInstallOwnerRow, error) {
	if signIn.SetupSessionKey == "" {
		return db.User{}, db.GetInstallOwnerRow{}, errSetupTokenInvalid()
	}
	if signIn.CompleteClaim == nil {
		return db.User{}, db.GetInstallOwnerRow{}, pkgerrors.Internal("claim credential persistence is not configured")
	}
	var owner db.User
	var member db.GetInstallOwnerRow
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		if err := q.LockInstallSetupOwner(ctx); err != nil {
			return err
		}
		if _, err := q.LockInstallSetting(ctx, setupTokenKey); err != nil {
			if stdErrors.Is(err, pgx.ErrNoRows) {
				return errSetupClosed()
			}
			return pkgerrors.Internal("failed to lock the setup token").WithCause(err)
		}
		live, err := q.LockSetupSession(ctx, signIn.SetupSessionKey)
		if err != nil {
			return pkgerrors.Internal("failed to lock the setup session").WithCause(err)
		}
		if live == 0 {
			return errSetupTokenInvalid()
		}
		owner, member, err = recordOwner(ctx, q, signIn)
		if err != nil {
			return err
		}
		if err := signIn.CompleteClaim(ctx, q, owner); err != nil {
			return err
		}
		if _, err := q.DeleteInstallSetting(ctx, setupTokenKey); err != nil {
			return pkgerrors.Internal("failed to delete the setup token").WithCause(err)
		}
		if _, err := q.DeleteSetupSessions(ctx); err != nil {
			return pkgerrors.Internal("failed to delete the setup sessions").WithCause(err)
		}
		return nil
	})
	if err != nil {
		var apiErr *pkgerrors.APIError
		if stdErrors.As(err, &apiErr) {
			return db.User{}, db.GetInstallOwnerRow{}, apiErr
		}
		return db.User{}, db.GetInstallOwnerRow{}, pkgerrors.Internal("failed to claim the install").WithCause(err)
	}
	return owner, member, nil
}

// recordOwner links a migrated owner or inserts the first GitHub owner.
func recordOwner(ctx context.Context, q *db.Queries, signIn GitHubSignIn) (db.User, db.GetInstallOwnerRow, error) {
	githubUserID := pgtype.Int8{Int64: signIn.GitHubUserID, Valid: true}
	existing, err := q.GetInstallOwner(ctx)
	switch {
	case err == nil:
		linked, err := q.LinkInstallOwner(ctx, githubUserID)
		if err != nil {
			if isUniqueViolation(err) {
				return db.User{}, db.GetInstallOwnerRow{}, errSetupClosed()
			}
			return db.User{}, db.GetInstallOwnerRow{}, pkgerrors.Internal("failed to link the owner").WithCause(err)
		}
		if linked < 1 {
			return db.User{}, db.GetInstallOwnerRow{}, errSetupClosed()
		}
		user, err := q.GetUserByID(ctx, existing.UserID)
		if err != nil {
			return db.User{}, db.GetInstallOwnerRow{}, pkgerrors.Internal("failed to load the owner").WithCause(err)
		}
		existing.GithubUserID, existing.Login = githubUserID, signIn.Login
		return user, existing, nil
	case !stdErrors.Is(err, pgx.ErrNoRows):
		return db.User{}, db.GetInstallOwnerRow{}, pkgerrors.Internal("failed to read the install owner").WithCause(err)
	}
	user, err := ownerUser(ctx, q, signIn)
	if err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	if err := q.SetUserAdmin(ctx, db.SetUserAdminParams{UserID: user.ID, IsAdmin: true}); err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	user.IsAdmin = true
	if err := q.ClaimSelfHostOwner(ctx, user.ID); err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	collaborator, err := q.AddCollaborator(ctx, db.AddCollaboratorParams{UserID: pgtype.Int8{Int64: user.ID, Valid: true}, Permission: "admin"})
	if err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	if err := q.SetOwnerGitHubIdentity(ctx, db.SetOwnerGitHubIdentityParams{ID: collaborator.ID, GithubUserID: githubUserID}); err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	member, err := q.GetInstallOwner(ctx)
	if err != nil {
		return db.User{}, db.GetInstallOwnerRow{}, err
	}
	member.Login = signIn.Login
	return user, member, nil
}

// ownerAccessKey records a refused GitHub permission check.
const ownerAccessKey = "setup.owner_access"

// verifyOwner checks the provisional owner against GitHub (§5.1.2).
func (s *MemberService) verifyOwner(ctx context.Context, queries *db.Queries, member db.GetInstallOwnerRow) error {
	if s.repository == nil {
		return pkgerrors.Internal("the install repository is not configured")
	}
	repository, found, err := s.repository.InstallRepository(ctx)
	if err == nil && !found {
		return nil
	}
	if err == nil {
		err = s.pushCheck(ctx, repository, member.Login, member.GithubUserID.Int64)
	}
	if err != nil {
		var refusal *pkgerrors.APIError
		if !stdErrors.As(err, &refusal) || refusal.Code == pkgerrors.CodeInternal {
			return err
		}
		fix := ""
		if details, ok := refusal.Details.(map[string]string); ok {
			fix = details["fix"]
		}
		value, marshalErr := json.Marshal(map[string]any{"code": refusal.Code, "message": refusal.Message, "fix": fix})
		if marshalErr != nil {
			return pkgerrors.Internal("failed to encode the owner access check").WithCause(marshalErr)
		}
		if putErr := queries.PutInstallSetting(ctx, db.PutInstallSettingParams{Key: ownerAccessKey, Value: value}); putErr != nil {
			return pkgerrors.Internal("failed to record the owner access check").WithCause(putErr)
		}
		if stdErrors.Is(refusal.Cause(), errGitHubIdentityMismatch) {
			return err
		}
		return nil
	}
	if err := queries.MarkMemberAccessChecked(ctx, member.ID); err != nil {
		return pkgerrors.Internal("failed to record the owner access check").WithCause(err)
	}
	if _, err := queries.DeleteInstallSetting(ctx, ownerAccessKey); err != nil {
		return pkgerrors.Internal("failed to record the owner access check").WithCause(err)
	}
	return nil
}

// githubOAuthProvider is the oauth_accounts provider label of GitHub sign-in
const githubOAuthProvider = "workos"

// ownerUser reuses the GitHub-linked user or creates the claimant.
func ownerUser(ctx context.Context, q *db.Queries, signIn GitHubSignIn) (db.User, error) {
	account, err := q.GetOAuthAccountByProviderUserID(ctx, db.GetOAuthAccountByProviderUserIDParams{
		Provider: githubOAuthProvider, ProviderUserID: strconv.FormatInt(signIn.GitHubUserID, 10),
	})
	if err == nil {
		user, err := q.GetUserByID(ctx, account.UserID)
		if err != nil {
			return db.User{}, pkgerrors.Internal("failed to load the owner").WithCause(err)
		}
		return user, nil
	}
	if !stdErrors.Is(err, pgx.ErrNoRows) {
		return db.User{}, pkgerrors.Internal("failed to read the GitHub account").WithCause(err)
	}
	email := pgtype.Text{String: signIn.Email, Valid: signIn.Email != ""}
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		Username:      signIn.Login,
		LowerUsername: strings.ToLower(signIn.Login),
		Email:         email,
		LowerEmail:    pgtype.Text{String: strings.ToLower(signIn.Email), Valid: signIn.Email != ""},
		DisplayName:   firstNonEmpty(signIn.Name, signIn.Login),
	})
	if err != nil {
		if isUniqueViolation(err) {
			return db.User{}, pkgerrors.Conflict("username or email is already in use")
		}
		return db.User{}, pkgerrors.Internal("failed to create the owner").WithCause(err)
	}
	return user, nil
}

// requirePush requires GitHub push access on the install repository.
func (s *MemberService) requirePush(ctx context.Context, login string, githubUserID int64) error {
	if s.repository == nil {
		return pkgerrors.Internal("the install repository is not configured")
	}
	repository, found, err := s.repository.InstallRepository(ctx)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	return s.pushCheck(ctx, repository, login, githubUserID)
}

// pushCheck refuses login without push access or higher on repository.
func (s *MemberService) pushCheck(ctx context.Context, repository InstallRepository, login string, expectedUserID ...int64) error {
	permission, err := readGitHubRepoPermission(ctx, s.github, repository.Token, repository.Owner, repository.Name, login, expectedUserID...)
	if stdErrors.Is(err, errGitHubIdentityMismatch) {
		return pkgerrors.New(pkgerrors.CodeNeedsGitHubAccess, "GitHub account identity does not match the linked owner").WithCause(err)
	}
	if err != nil {
		return pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "GitHub did not answer whether you can push to "+repository.Owner+"/"+repository.Name).WithCause(err)
	}
	if !permission.CanPush() {
		refusal := pkgerrors.New(pkgerrors.CodeNeedsGitHubAccess, "needs access on GitHub: push to "+repository.Owner+"/"+repository.Name)
		// The repository's access page is where an admin grants it.
		refusal.Details = map[string]string{"fix": "https://github.com/" + url.PathEscape(repository.Owner) + "/" + url.PathEscape(repository.Name) + "/settings/access"}
		return refusal
	}
	return nil
}

// SettingsInstallRepository reads GH-01's binding and verifies its installation.
type SettingsInstallRepository struct {
	queries              *db.Queries
	installations        *GitHubUserReposService
	configuredRepository string
}

func NewSettingsInstallRepository(queries *db.Queries, installations *GitHubUserReposService, configuredRepository string) *SettingsInstallRepository {
	return &SettingsInstallRepository{queries: queries, installations: installations, configuredRepository: strings.TrimSpace(configuredRepository)}
}

func (r *SettingsInstallRepository) repositoryChoice(ctx context.Context) (string, string, bool, error) {
	setting, err := r.queries.GetInstallSetting(ctx, "github.repository")
	if err == nil {
		var repo struct {
			Owner string `json:"owner_login"`
			Name  string `json:"repository_name"`
		}
		if json.Unmarshal(setting.Value, &repo) != nil || !gitHubAppComponent.MatchString(repo.Owner) || !gitHubAppComponent.MatchString(repo.Name) {
			return "", "", false, pkgerrors.Internal("invalid GitHub repository binding")
		}
		return repo.Owner, repo.Name, true, nil
	}
	if !stdErrors.Is(err, pgx.ErrNoRows) {
		return "", "", false, err
	}
	if r.configuredRepository == "" {
		return "", "", false, nil
	}
	owner, name, ok := strings.Cut(r.configuredRepository, "/")
	if !ok || !gitHubAppComponent.MatchString(owner) || !gitHubAppComponent.MatchString(name) {
		return "", "", false, pkgerrors.Internal("SMITHERS_GITHUB_APP_REPOSITORY must be owner/name")
	}
	return owner, name, true, nil
}

func (r *SettingsInstallRepository) InstallRepository(ctx context.Context) (InstallRepository, bool, error) {
	owner, name, found, err := r.repositoryChoice(ctx)
	if err != nil || !found {
		return InstallRepository{}, false, err
	}
	installation, found, err := r.installations.lookupRepoInstallation(ctx, owner, name)
	if err != nil {
		return InstallRepository{}, false, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "GitHub did not answer for "+owner+"/"+name).WithCause(err)
	}
	if !found {
		return InstallRepository{}, false, pkgerrors.New(pkgerrors.CodeInstallRepositoryUnset, "the GitHub App is not installed on "+owner+"/"+name)
	}
	binding := map[string]any{}
	setting, err := r.queries.GetInstallSetting(ctx, "github.repository")
	if err != nil && !stdErrors.Is(err, pgx.ErrNoRows) {
		return InstallRepository{}, false, err
	}
	if err == nil {
		if err := json.Unmarshal(setting.Value, &binding); err != nil {
			return InstallRepository{}, false, err
		}
	}
	binding["owner_login"], binding["repository_name"], binding["installation_id"] = owner, name, installation.ID
	value, err := json.Marshal(binding)
	if err != nil {
		return InstallRepository{}, false, err
	}
	if err := r.queries.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: value}); err != nil {
		return InstallRepository{}, false, pkgerrors.Internal("failed to record install repository").WithCause(err)
	}
	if _, err := r.queries.SetGithubAppInstallation(ctx, installation.ID); err != nil {
		return InstallRepository{}, false, err
	}
	token, err := NewRepoConnectionService(nil, r.installations.githubAppCredentials).mintGitHubInstallationToken(ctx, installation.ID, &gitHubInstallationTokenScope{
		Repositories: []string{name},
		Permissions:  map[string]string{"metadata": "read"},
	})
	if err != nil {
		return InstallRepository{}, false, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "GitHub did not issue a token for "+owner+"/"+name).WithCause(err)
	}
	return InstallRepository{Owner: owner, Name: name, Token: token.Token}, true, nil
}

// StartSignIn requires a live setup session until the owner is claimed.
func (s *MemberService) StartSignIn(ctx context.Context, setupSession string) (bool, error) {
	queries := db.New(s.pool)
	claimed, err := queries.InstallClaimed(ctx)
	if err != nil {
		return false, pkgerrors.Internal("failed to read the install owner").WithCause(err)
	}
	if claimed {
		if setupSession != "" {
			return false, errSetupClosed()
		}
		return false, nil
	}
	if err := ResolveSetupSession(ctx, queries, setupSession); err != nil {
		return false, err
	}
	return true, nil
}

// ExchangeSetupToken trades the printed setup token for a setup session.
func (s *MemberService) ExchangeSetupToken(ctx context.Context, token string) (string, error) {
	var session string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		if err := q.LockInstallSetupOwner(ctx); err != nil {
			return err
		}
		// Exchange and claim serialize on the same row (spec §5.1.0).
		if _, err := q.LockInstallSetting(ctx, setupTokenKey); err != nil {
			if stdErrors.Is(err, pgx.ErrNoRows) {
				claimed, readErr := q.InstallClaimed(ctx)
				if readErr != nil {
					return readErr
				}
				if claimed {
					return errSetupClosed()
				}
				return errSetupTokenInvalid()
			}
			return err
		}
		var err error
		session, err = ExchangeSetupToken(ctx, q, token)
		return err
	})
	return session, err
}

// VerifyOwner runs the setup access check.
func (s *MemberService) VerifyOwner(ctx context.Context) error {
	q := db.New(s.pool)
	member, err := q.GetInstallOwner(ctx)
	if err != nil {
		return pkgerrors.Internal("failed to read the owner").WithCause(err)
	}
	return s.verifyOwner(ctx, q, member)
}
