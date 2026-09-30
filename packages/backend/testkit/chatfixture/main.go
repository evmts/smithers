// The app's durable-turn integration fixture composes the canonical authority.
// It contains no journal implementation or replacement authentication boundary.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/db/product"
	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/postgres"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() (result error) {
	state := os.Getenv("SMITHERS_CHAT_FIXTURE_STATE")
	token := os.Getenv("SMITHERS_CHAT_FIXTURE_OWNER_TOKEN")
	if !filepath.IsAbs(state) || len(token) < 32 {
		return errors.New("chat fixture requires owned state and a private fixture credential")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	pg, err := postgres.Start(ctx, postgres.Config{BinDir: os.Getenv("SMITHERS_POSTGRES_TEST_BIN"), StateDir: filepath.Join(state, "postgres"), Major: 18})
	if err != nil {
		return err
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if failure := pg.Stop(closeCtx); failure != nil {
			result = errors.Join(result, failure)
		}
	}()
	if err := os.WriteFile(filepath.Join(state, "database-url"), []byte(pg.ConnectionString), 0600); err != nil {
		return err
	}
	pool, err := postgresfixture.Open(ctx, pg.ConnectionString, 8)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err = product.Apply(ctx, pool); err != nil {
		return err
	}
	var owner int64
	err = pool.QueryRow(ctx, `INSERT INTO users (username,lower_username) VALUES ('durablefixture','durablefixture') ON CONFLICT (lower_username) DO UPDATE SET username=EXCLUDED.username RETURNING id`).Scan(&owner)
	if err != nil {
		return err
	}
	digest := sha256.Sum256([]byte(token))
	_, err = pool.Exec(ctx, `INSERT INTO access_tokens (user_id,name,token_hash,token_last_eight,scopes) VALUES ($1,'native-durable-fixture',$2,$3,'all') ON CONFLICT (token_hash) DO NOTHING`, owner, hex.EncodeToString(digest[:]), token[len(token)-8:])
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", os.Getenv("SMITHERS_CHAT_FIXTURE_ADDRESS"))
	if err != nil {
		return err
	}
	defer listener.Close()
	origin := "http://" + listener.Addr().String()
	host, err := chat.NewHTTPChatHost(os.Getenv("SMITHERS_CHAT_FIXTURE_MODEL_ORIGIN"), nil, os.Getenv("SMITHERS_CHAT_HOST_TOKEN"))
	if err != nil {
		return err
	}
	runtime, err := chat.NewRuntime(pool, host, origin, chat.RuntimeOptions{Lease: time.Second, Concurrency: 1})
	if err != nil {
		return err
	}
	router := chi.NewRouter()
	router.Get("/readyz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	router.Group(func(r chi.Router) {
		r.Use(middleware.JSONAllowContentType("application/json"), middleware.MaxBodySize(middleware.MaxRequestBodySize))
		r.Use(middleware.AuthLoader(db.New(pool), config.AuthConfig{}))
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequireScope(middleware.ScopeWriteUser))
		runtime.MountAuthenticated(r)
	})
	router.Group(func(r chi.Router) {
		r.Use(middleware.JSONAllowContentType("application/json"), middleware.MaxBodySize(middleware.MaxRequestBodySize))
		runtime.MountErasure(r)
	})
	runtime.MountProducerCallbacks(router)
	server := &http.Server{Handler: router, ReadHeaderTimeout: 5 * time.Second}
	runDone := make(chan error, 1)
	go func() { runDone <- runtime.Run(ctx) }()
	serveDone := make(chan error, 1)
	go func() { serveDone <- server.Serve(listener) }()
	if err = json.NewEncoder(os.Stdout).Encode(map[string]string{"origin": origin, "protocol": "smithers.chat-fixture/v1"}); err != nil {
		return err
	}
	runtimeFinished, serverFinished := false, false
	select {
	case <-ctx.Done():
	case err = <-serveDone:
		serverFinished = true
		stop()
	case err = <-runDone:
		runtimeFinished = true
		stop()
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	_ = server.Close()
	if !runtimeFinished {
		if failure := <-runDone; failure != nil && !errors.Is(failure, context.Canceled) {
			err = errors.Join(err, failure)
		}
	}
	if !serverFinished {
		if failure := <-serveDone; failure != nil && !errors.Is(failure, http.ErrServerClosed) {
			err = errors.Join(err, failure)
		}
	}
	if err != nil {
		return err
	}
	return nil
}
