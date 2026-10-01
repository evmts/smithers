package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// AuthReference identifies an admitted authority without retaining its credential.
// Fingerprints are lookup/revalidation keys, never accepted as request credentials.
type AuthReference struct {
	UserID      int64       `json:"userId"`
	TokenID     int64       `json:"tokenId,omitempty"`
	TokenHash   string      `json:"tokenHash,omitempty"`
	SessionHash string      `json:"sessionHash,omitempty"`
	OAuth2AppID int64       `json:"oauth2AppId,omitempty"`
	Source      TokenSource `json:"source,omitempty"`
	ScopesHash  string      `json:"scopesHash"`
	Actor       string      `json:"actor"`
}

func authScopeHash(info *AuthInfo) string {
	sum := sha256.Sum256([]byte(info.RawScopes))
	return hex.EncodeToString(sum[:])
}

// Reference derives actor and source only from the verified authentication context.
func (info *AuthInfo) Reference() (AuthReference, error) {
	if info == nil || info.User == nil || info.User.ID <= 0 {
		return AuthReference{}, errors.New("verified identity required")
	}
	actor := "user"
	if info.IsAgent() {
		actor = "agent"
	} else if info.IsTokenAuth {
		actor = "api"
	}
	if (info.IsTokenAuth && (len(info.TokenHash) != 64 || info.TokenID <= 0)) || (!info.IsTokenAuth && len(info.SessionHash) != 64) {
		return AuthReference{}, errors.New("verified credential reference required")
	}
	return AuthReference{UserID: info.User.ID, TokenID: info.TokenID, TokenHash: info.TokenHash, SessionHash: info.SessionHash, OAuth2AppID: info.OAuth2AppID, Source: info.TokenSource, ScopesHash: authScopeHash(info), Actor: actor}, nil
}

// RevalidateAuthReference uses the same token loaders as HTTP authentication.
// It never refreshes a session or interprets a stored digest as a bearer cookie.
func RevalidateAuthReference(ctx context.Context, q *db.Queries, reference AuthReference) (*AuthInfo, error) {
	var info *AuthInfo
	var err error
	if reference.TokenHash != "" {
		info, err = loadTokenAuthByHash(ctx, q, reference.TokenHash)
	} else {
		session, lookup := q.GetAuthSessionBySessionKey(ctx, reference.SessionHash)
		live := lookup == nil && session.UserID == reference.UserID && session.ExpiresAt.After(time.Now())
		if errors.Is(lookup, pgx.ErrNoRows) {
			live, err = q.LegacyAuthSessionLiveForUser(ctx, db.LegacyAuthSessionLiveForUserParams{SessionDigest: reference.SessionHash, UserID: reference.UserID})
		} else if lookup != nil {
			err = lookup
		}
		if err != nil {
			return nil, err
		}
		if !live {
			return nil, pgx.ErrNoRows
		}
		user, lookup := q.GetUserByID(ctx, reference.UserID)
		if lookup != nil {
			return nil, lookup
		}
		info = &AuthInfo{User: &user, SessionHash: reference.SessionHash, Scopes: ScopeSet{}}
	}
	if err != nil {
		return nil, err
	}
	if info == nil || info.User == nil || !info.User.IsActive || info.User.ProhibitLogin || info.User.DeletedAt.Valid {
		return nil, pgx.ErrNoRows
	}
	current, err := info.Reference()
	if err != nil {
		return nil, err
	}
	if current != reference {
		return nil, pgx.ErrNoRows
	}
	return info, nil
}
