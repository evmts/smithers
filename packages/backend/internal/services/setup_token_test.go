package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// setupTokenStore is install_settings as the setup token and sessions see
// it. Idle expiry lives in SQL and is covered against PostgreSQL by the
// owner sign-in integration tests.
type setupTokenStore struct {
	claimed  bool
	settings map[string]json.RawMessage
}

func (s *setupTokenStore) InstallClaimed(context.Context) (bool, error) { return s.claimed, nil }

func (s *setupTokenStore) GetInstallSettingValue(_ context.Context, key string) (json.RawMessage, error) {
	value, ok := s.settings[key]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return value, nil
}

func (s *setupTokenStore) CreateSetupSession(_ context.Context, key string) error {
	s.settings[key] = json.RawMessage(`{}`)
	return nil
}

func (s *setupTokenStore) TouchSetupSession(_ context.Context, key string) (int64, error) {
	if _, ok := s.settings[key]; ok && strings.HasPrefix(key, setupSessionKeyPrefix) {
		return 1, nil
	}
	return 0, nil
}

func (s *setupTokenStore) DeleteExpiredSetupSessions(context.Context) (int64, error) { return 0, nil }

func (s *setupTokenStore) PutInstallSetting(_ context.Context, arg db.PutInstallSettingParams) error {
	s.settings[arg.Key] = arg.Value
	return nil
}

func (s *setupTokenStore) DeleteInstallSetting(_ context.Context, key string) (int64, error) {
	_, ok := s.settings[key]
	delete(s.settings, key)
	if ok {
		return 1, nil
	}
	return 0, nil
}

func TestMintSetupTokenStoresOnlyTheDigest(t *testing.T) {
	store := &setupTokenStore{settings: map[string]json.RawMessage{}}
	token, err := MintSetupToken(context.Background(), store)
	require.NoError(t, err)
	require.Len(t, token, 43, "32 random bytes, base64url without padding")

	stored := string(store.settings[setupTokenKey])
	sum := sha256.Sum256([]byte(token))
	require.JSONEq(t, `{"digest":"`+hex.EncodeToString(sum[:])+`"}`, stored)
	require.NotContains(t, stored, token)
	require.True(t, setupTokenMatches(store.settings[setupTokenKey], SetupTokenDigest(token)))
	require.False(t, setupTokenMatches(store.settings[setupTokenKey], SetupTokenDigest(token+"x")))
	require.False(t, setupTokenMatches(store.settings[setupTokenKey], ""), "an empty digest never matches")
	require.False(t, setupTokenMatches(json.RawMessage(`{}`), ""), "an empty stored digest never matches")
}

func TestMintSetupTokenReplacesTheTokenOnEachStart(t *testing.T) {
	store := &setupTokenStore{settings: map[string]json.RawMessage{}}
	first, err := MintSetupToken(context.Background(), store)
	require.NoError(t, err)
	second, err := MintSetupToken(context.Background(), store)
	require.NoError(t, err)
	require.NotEqual(t, first, second)
	require.False(t, setupTokenMatches(store.settings[setupTokenKey], SetupTokenDigest(first)), "a restart retires the printed token")
	require.True(t, setupTokenMatches(store.settings[setupTokenKey], SetupTokenDigest(second)))
}

func TestMintSetupTokenIssuesNothingOnceAnOwnerExists(t *testing.T) {
	store := &setupTokenStore{claimed: true, settings: map[string]json.RawMessage{
		setupTokenKey: json.RawMessage(`{"digest":"left-over"}`),
	}}
	token, err := MintSetupToken(context.Background(), store)
	require.NoError(t, err)
	require.Empty(t, token)
	require.NotContains(t, store.settings, setupTokenKey, "no token exists once an owner does")
}

func TestSetupTokenDigestIgnoresSurroundingSpace(t *testing.T) {
	require.Equal(t, SetupTokenDigest("abc"), SetupTokenDigest(" abc\n"))
	require.Len(t, SetupTokenDigest("abc"), 64)
	require.Equal(t, strings.ToLower(SetupTokenDigest("abc")), SetupTokenDigest("abc"))
}

func requireCode(t *testing.T, err error, code pkgerrors.Code) {
	t.Helper()
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, code, apiErr.Code)
}

// A setup session is stored as the digest of its id; neither the id nor the
// setup token is written anywhere.
func TestExchangeSetupTokenStoresOnlyTheSessionDigest(t *testing.T) {
	ctx := context.Background()
	store := &setupTokenStore{settings: map[string]json.RawMessage{}}
	token, err := MintSetupToken(ctx, store)
	require.NoError(t, err)

	first, err := ExchangeSetupToken(ctx, store, token)
	require.NoError(t, err)
	second, err := ExchangeSetupToken(ctx, store, token)
	requireCode(t, err, pkgerrors.CodeSetupTokenInvalid)
	require.Empty(t, second)
	token, err = MintSetupToken(ctx, store)
	require.NoError(t, err)
	second, err = ExchangeSetupToken(ctx, store, token)
	require.NoError(t, err)
	require.NotEqual(t, first, second)
	require.Len(t, first, 43)

	sum := sha256.Sum256([]byte(first))
	require.Contains(t, store.settings, "setup.session."+hex.EncodeToString(sum[:]))
	for key, value := range store.settings {
		for _, secret := range []string{token, first, second} {
			require.NotContains(t, key, secret)
			require.NotContains(t, string(value), secret)
		}
	}
	require.NoError(t, ResolveSetupSession(ctx, store, first))
	requireCode(t, ResolveSetupSession(ctx, store, first+"x"), pkgerrors.CodeUnauthenticated)
	requireCode(t, ResolveSetupSession(ctx, store, ""), pkgerrors.CodeUnauthenticated)
}

func TestExchangeSetupTokenRefusesAWrongToken(t *testing.T) {
	ctx := context.Background()
	store := &setupTokenStore{settings: map[string]json.RawMessage{}}
	token, err := MintSetupToken(ctx, store)
	require.NoError(t, err)
	for _, wrong := range []string{"", " ", token + "x", strings.ToUpper(token)} {
		_, err := ExchangeSetupToken(ctx, store, wrong)
		requireCode(t, err, pkgerrors.CodeSetupTokenInvalid)
	}
	require.Len(t, store.settings, 1, "a refused exchange stores nothing")
}

// After the claim every setup session and the token are refused with
// setup_closed.
func TestSetupClosesAtTheClaim(t *testing.T) {
	ctx := context.Background()
	store := &setupTokenStore{settings: map[string]json.RawMessage{}}
	token, err := MintSetupToken(ctx, store)
	require.NoError(t, err)
	session, err := ExchangeSetupToken(ctx, store, token)
	require.NoError(t, err)

	store.claimed = true
	_, err = ExchangeSetupToken(ctx, store, token)
	requireCode(t, err, pkgerrors.CodeSetupClosed)
	requireCode(t, ResolveSetupSession(ctx, store, session), pkgerrors.CodeSetupClosed)
}
