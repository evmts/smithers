// Package reposites owns immutable repository publications and verified Host bindings.
// Deployment adapters supply storage, DNS and certificate I/O; the edge owns none
// of this product state. The same ports can be composed in an install or a cell.
package reposites

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
)

// Store provides atomic changes to explicitly named product records. Missing
// records are nil. A callback may only change the keys it locked and may do no I/O.
// Keys use the existing generic install_settings store under the sites/ namespace.
type Store interface {
	Read(context.Context, string) (json.RawMessage, error)
	Change(context.Context, []string, func(map[string]json.RawMessage) error) error
}

// PostgresStore reuses the installed product settings table and generated queries.
// Sorted per-key advisory locks cover both absent and existing records, so name
// allocation and version activation are atomic across processes, not just goroutines.
type PostgresStore struct{ Pool *pgxpool.Pool }

func (s PostgresStore) Read(ctx context.Context, key string) (json.RawMessage, error) {
	row, err := db.New(s.Pool).GetInstallSetting(ctx, "sites/"+key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return row.Value, err
}
func (s PostgresStore) Change(ctx context.Context, keys []string, f func(map[string]json.RawMessage) error) error {
	keys = append([]string(nil), keys...)
	sort.Strings(keys)
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	// Recheck the owner after blob/provider I/O and fence repository transfer or
	// deletion while committing these short metadata writes. The permission
	// resolver is the existing product resolver, never a second site role model.
	if rc := middleware.RepoContextFromContext(ctx); rc != nil && rc.Repository != nil {
		actor := middleware.UserFromContext(ctx)
		if actor == nil {
			return refuse("site_owner_required", 403)
		}
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock_shared(hashtextextended('repository_ownership:' || ($1::bigint)::text, 0))", rc.Repository.ID); err != nil {
			return err
		}
		current, e := q.GetRepoByOwnerAndLowerName(ctx, db.GetRepoByOwnerAndLowerNameParams{Owner: rc.Owner, LowerName: strings.ToLower(rc.Repository.Name)})
		if e != nil || current.ID != rc.Repository.ID {
			return refuse("site_repository_stale", 409)
		}
		user, e := q.GetUserByID(ctx, actor.ID)
		if e != nil || !user.IsActive {
			return refuse("site_owner_required", 403)
		}
		permission, denied := middleware.ResolveRepoPermission(ctx, q, current, &user)
		if denied != nil || permission != middleware.PermissionOwner {
			return refuse("site_owner_required", 403)
		}
	}
	values := map[string]json.RawMessage{}
	before := map[string]json.RawMessage{}
	for _, key := range keys {
		if strings.HasPrefix(key, "/") || key == "" {
			return errors.New("invalid site record")
		}
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "sites/"+key); err != nil {
			return err
		}
		row, e := q.GetInstallSetting(ctx, "sites/"+key)
		if e != nil && !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		values[key] = append(json.RawMessage(nil), row.Value...)
		before[key] = append(json.RawMessage(nil), row.Value...)
	}
	if err = f(values); err != nil {
		return err
	}
	for key, value := range values {
		if _, ok := before[key]; !ok {
			return errors.New("site mutation escaped locked records")
		}
		if bytes.Equal(before[key], value) {
			continue
		}
		if !json.Valid(value) {
			return errors.New("invalid site record JSON")
		}
		if err = q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "sites/" + key, Value: value}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
