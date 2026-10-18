package operator

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestChatInspectValidatesSyntaxBeforeOpeningDatabase(t *testing.T) {
	for _, args := range [][]string{{"chat"}, {"chat", "inspect"}, {"chat", "inspect", "bad-id-secret-sentinel"}, {"chat", "erase", "7e5fc00f-8f6b-47ca-9149-c9554031a2b4"}, {"chat", "inspect", "7e5fc00f-8f6b-47ca-9149-c9554031a2b4", "extra-secret-sentinel"}} {
		handled, err := Dispatch(t.Context(), args, Config{OpenDatabase: func(context.Context) (*pgxpool.Pool, error) {
			t.Fatal("invalid operator syntax opened the database")
			return nil, nil
		}})
		require.True(t, handled)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "secret-sentinel")
	}
	opened := errors.New("test opener stopped before PostgreSQL")
	handled, err := Dispatch(t.Context(), strings.Fields("chat inspect 7e5fc00f-8f6b-47ca-9149-c9554031a2b4"), Config{OpenDatabase: func(ctx context.Context) (*pgxpool.Pool, error) {
		_, bounded := ctx.Deadline()
		require.True(t, bounded)
		return nil, opened
	}})
	require.True(t, handled)
	require.ErrorIs(t, err, opened)
}
