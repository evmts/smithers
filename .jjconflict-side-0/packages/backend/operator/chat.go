package operator

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/chat"
)

// runChat is an operator's bounded read of durable execution metadata. No
// callback capability or customer content is returned, and no server starts.
func runChat(ctx context.Context, args []string, cfg Config) error {
	if len(args) != 2 || args[0] != "inspect" {
		return errors.New("usage: chat inspect TURN_UUID")
	}
	if _, err := uuid.Parse(args[1]); err != nil {
		return errors.New("chat inspect requires a turn UUID")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return withDatabase(ctx, cfg, func(pool *pgxpool.Pool) error {
		store, err := chat.NewStore(pool)
		if err != nil {
			return err
		}
		inspection, err := store.InspectTurn(ctx, args[1])
		if err != nil {
			return err
		}
		return json.NewEncoder(cfg.Stdout).Encode(inspection)
	})
}
