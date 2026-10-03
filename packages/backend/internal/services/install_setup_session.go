package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	stdErrors "errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// setupTokenKey holds the backend-minted setup token digest.
const setupTokenKey = "setup_token"

type setupTokenSetting struct {
	Digest    string `json:"digest"`
	Exchanged bool   `json:"exchanged,omitempty"`
}

// SetupTokenQuerier stores the setup token's digest.
type SetupTokenQuerier interface {
	InstallClaimed(ctx context.Context) (bool, error)
	PutInstallSetting(ctx context.Context, arg db.PutInstallSettingParams) error
	DeleteInstallSetting(ctx context.Context, key string) (int64, error)
}

// MintSetupToken rotates the digest on an unclaimed installation.
func MintSetupToken(ctx context.Context, queries SetupTokenQuerier) (string, error) {
	claimed, err := queries.InstallClaimed(ctx)
	if err != nil {
		return "", fmt.Errorf("read install owner: %w", err)
	}
	if claimed {
		if _, err := queries.DeleteInstallSetting(ctx, setupTokenKey); err != nil {
			return "", fmt.Errorf("delete setup token: %w", err)
		}
		return "", nil
	}
	token, err := randomSetupSecret()
	if err != nil {
		return "", fmt.Errorf("generate setup token: %w", err)
	}
	value, err := json.Marshal(setupTokenSetting{Digest: SetupTokenDigest(token)})
	if err != nil {
		return "", err
	}
	if err := queries.PutInstallSetting(ctx, db.PutInstallSettingParams{Key: setupTokenKey, Value: value}); err != nil {
		return "", fmt.Errorf("store setup token digest: %w", err)
	}
	return token, nil
}

// randomSetupSecret is 32 random bytes, base64url without padding.
func randomSetupSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// SetupTokenDigest returns the lowercase SHA-256 digest.
func SetupTokenDigest(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

// setupTokenMatches compares digests in constant time.
func setupTokenMatches(stored []byte, digest string) bool {
	var setting setupTokenSetting
	if json.Unmarshal(stored, &setting) != nil || setting.Digest == "" || digest == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(setting.Digest), []byte(digest)) == 1
}

// errSetupTokenInvalid refuses a claim without the current setup token.
func errSetupTokenInvalid() *pkgerrors.APIError {
	return pkgerrors.New(pkgerrors.CodeSetupTokenInvalid, "open the setup URL printed when the install started to claim it")
}

func errSetupClosed() *pkgerrors.APIError {
	return pkgerrors.New(pkgerrors.CodeSetupClosed, "this install's owner is already claimed; sign in with GitHub")
}

// setupSessionKeyPrefix names the durable setup session namespace.
const setupSessionKeyPrefix = "setup.session."

// SetupSessionCookieName is the HttpOnly cookie holding a setup session id.
const SetupSessionCookieName = "smithers_setup"

// SetupSessionIdle is how long a setup session lives without a request.
const SetupSessionIdle = 24 * time.Hour

// SetupSessionKey stores only the session digest.
func SetupSessionKey(sessionID string) string {
	return setupSessionKeyPrefix + SetupTokenDigest(sessionID)
}

// SetupSessionQuerier stores setup sessions in install_settings.
type SetupSessionQuerier interface {
	InstallClaimed(ctx context.Context) (bool, error)
	GetInstallSettingValue(ctx context.Context, key string) (json.RawMessage, error)
	CreateSetupSession(ctx context.Context, key string) error
	TouchSetupSession(ctx context.Context, key string) (int64, error)
	DeleteExpiredSetupSessions(ctx context.Context) (int64, error)
	PutInstallSetting(ctx context.Context, arg db.PutInstallSettingParams) error
}

// ExchangeSetupToken exchanges one minted token for a digest-backed session.
func ExchangeSetupToken(ctx context.Context, queries SetupSessionQuerier, token string) (string, error) {
	claimed, err := queries.InstallClaimed(ctx)
	if err != nil {
		return "", pkgerrors.Internal("failed to read the install owner").WithCause(err)
	}
	if claimed {
		return "", errSetupClosed()
	}
	stored, err := queries.GetInstallSettingValue(ctx, setupTokenKey)
	if err != nil && !stdErrors.Is(err, pgx.ErrNoRows) {
		return "", pkgerrors.Internal("failed to read the setup token").WithCause(err)
	}
	if err != nil || strings.TrimSpace(token) == "" || !setupTokenMatches(stored, SetupTokenDigest(token)) {
		return "", errSetupTokenInvalid()
	}
	var setting setupTokenSetting
	if json.Unmarshal(stored, &setting) != nil || setting.Exchanged {
		return "", errSetupTokenInvalid()
	}
	if _, err := queries.DeleteExpiredSetupSessions(ctx); err != nil {
		return "", pkgerrors.Internal("failed to expire setup sessions").WithCause(err)
	}
	sessionID, err := randomSetupSecret()
	if err != nil {
		return "", pkgerrors.Internal("failed to generate a setup session").WithCause(err)
	}
	if err := queries.CreateSetupSession(ctx, SetupSessionKey(sessionID)); err != nil {
		return "", pkgerrors.Internal("failed to store the setup session").WithCause(err)
	}
	setting.Exchanged = true
	value, err := json.Marshal(setting)
	if err != nil {
		return "", pkgerrors.Internal("failed to consume setup token").WithCause(err)
	}
	if err := queries.PutInstallSetting(ctx, db.PutInstallSettingParams{Key: setupTokenKey, Value: value}); err != nil {
		return "", pkgerrors.Internal("failed to consume setup token").WithCause(err)
	}
	return sessionID, nil
}

// ResolveSetupSession touches a live session and refuses claim-invalidated sessions.
func ResolveSetupSession(ctx context.Context, queries SetupSessionQuerier, sessionID string) error {
	claimed, err := queries.InstallClaimed(ctx)
	if err != nil {
		return pkgerrors.Internal("failed to read the install owner").WithCause(err)
	}
	if claimed {
		return errSetupClosed()
	}
	if strings.TrimSpace(sessionID) == "" {
		return pkgerrors.New(pkgerrors.CodeUnauthenticated, "open the setup URL printed when the install started")
	}
	touched, err := queries.TouchSetupSession(ctx, SetupSessionKey(sessionID))
	if err != nil {
		return pkgerrors.Internal("failed to read the setup session").WithCause(err)
	}
	if touched == 0 {
		return pkgerrors.New(pkgerrors.CodeUnauthenticated, "the setup session is invalid or expired")
	}
	return nil
}

// InstallSetupSessions is the shared setup exchange and validation authority.
type InstallSetupSessions struct{ Pool *pgxpool.Pool }

func (s *InstallSetupSessions) Exchange(ctx context.Context, token string) (string, error) {
	if s == nil || s.Pool == nil {
		return "", pkgerrors.Internal("setup session authority unavailable")
	}
	return NewMemberService(s.Pool, nil).ExchangeSetupToken(ctx, token)
}
func (s *InstallSetupSessions) Validate(ctx context.Context, session string) error {
	if s == nil || s.Pool == nil {
		return pkgerrors.Internal("setup session authority unavailable")
	}
	return ResolveSetupSession(ctx, db.New(s.Pool), session)
}

// Mint serializes startup token rotation with exchange and owner claim.
func (s *InstallSetupSessions) Mint(ctx context.Context) (string, error) {
	if s == nil || s.Pool == nil {
		return "", pkgerrors.Internal("setup session authority unavailable")
	}
	var token string
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		if err := q.LockInstallSetupOwner(ctx); err != nil {
			return err
		}
		var err error
		token, err = MintSetupToken(ctx, q)
		return err
	})
	return token, err
}
