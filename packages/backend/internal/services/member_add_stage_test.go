package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

// A composed install's first roster add waited past its caller's 30 s deadline
// with the host idle and nothing in the record naming the stage that held it.
// Every stage of the add must be able to name itself — while it is still in
// flight as well as when it returns, because a stage that never returns would
// otherwise never be recorded at all — and only when it alone ran long.
func TestMemberAddSlowStageNamesItself(t *testing.T) {
	stages := []string{
		memberAddStageAuthorize, memberAddStageRepository, memberAddStageInstall,
		memberAddStageGitHubUser, memberAddStagePermission, memberAddStageMutation,
		memberAddStageRosterWrite, memberAddStageCommit,
	}
	for _, stage := range stages {
		t.Run(stage+" returning long", func(t *testing.T) {
			records, restore := captureMemberAddRecords(t)
			defer restore()
			clock := &memberAddClock{ctx: t.Context(), budget: memberAddSlowStage}
			clock.since(stage, time.Now().Add(-memberAddSlowStage-time.Second)).passed(errors.New("github unavailable"))
			require.Contains(t, records.String(), "members.add_stage_slow")
			require.Contains(t, records.String(), "stage="+stage)
			require.Contains(t, records.String(), "phase="+memberAddPhaseReturned)
			require.Contains(t, records.String(), "seconds=6")
			require.Contains(t, records.String(), "refused=true")
			require.Contains(t, records.String(), "caller="+memberAddCallerLive)
			// The upstream's own text never joins the record.
			require.NotContains(t, records.String(), "github unavailable")
		})
	}
	t.Run("a stage still in flight past the budget says so once, then again when it returns", func(t *testing.T) {
		records, restore := captureMemberAddRecords(t)
		defer restore()
		clock := &memberAddClock{ctx: t.Context(), budget: 20 * time.Millisecond}
		watch := clock.at(memberAddStageInstall)
		require.Eventually(t, func() bool {
			return strings.Contains(records.String(), "phase="+memberAddPhaseInFlight)
		}, 2*time.Second, 5*time.Millisecond, "a stuck stage is recorded before it returns")
		require.Contains(t, records.String(), "stage="+memberAddStageInstall)
		require.Equal(t, 1, strings.Count(records.String(), "phase="+memberAddPhaseInFlight), "exactly once")
		watch.passed(nil)
		require.Contains(t, records.String(), "phase="+memberAddPhaseReturned)
		require.Equal(t, 1, strings.Count(records.String(), "phase="+memberAddPhaseInFlight), "still exactly once")
	})
	t.Run("a stage that returns inside the budget reports nothing at all", func(t *testing.T) {
		records, restore := captureMemberAddRecords(t)
		defer restore()
		clock := &memberAddClock{ctx: t.Context(), budget: time.Hour}
		clock.at(memberAddStageInstall).passed(nil)
		time.Sleep(30 * time.Millisecond)
		require.Empty(t, records.String())
	})
	t.Run("a stage the caller had already given up on says so", func(t *testing.T) {
		for state, cancel := range map[string]func(context.Context) (context.Context, context.CancelFunc){
			memberAddCallerCanceled: func(parent context.Context) (context.Context, context.CancelFunc) {
				ctx, stop := context.WithCancel(parent)
				stop()
				return ctx, func() {}
			},
			memberAddCallerExpired: func(parent context.Context) (context.Context, context.CancelFunc) {
				return context.WithDeadline(parent, time.Now().Add(-time.Second))
			},
		} {
			records, restore := captureMemberAddRecords(t)
			ctx, stop := cancel(t.Context())
			clock := &memberAddClock{ctx: ctx, budget: memberAddSlowStage}
			clock.since(memberAddStageGitHubUser, time.Now().Add(-memberAddSlowStage-time.Second)).passed(errors.New("context canceled"))
			require.Contains(t, records.String(), "caller="+state)
			require.NotContains(t, records.String(), "context canceled")
			stop()
			restore()
		}
	})
	t.Run("every stage of the add is one of the closed set", func(t *testing.T) {
		require.Len(t, stages, 8)
		seen := map[string]bool{}
		for _, stage := range stages {
			require.False(t, seen[stage], "stage names are distinct")
			seen[stage] = true
		}
	})
}

// lockedRecords is the records buffer. The in-flight report is written by the
// stage's own timer goroutine while the test reads, so a plain bytes.Buffer
// would be a race in the test itself rather than in the product.
type lockedRecords struct {
	mu      sync.Mutex
	records bytes.Buffer
}

func (l *lockedRecords) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.records.Write(p)
}

func (l *lockedRecords) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.records.String()
}

func captureMemberAddRecords(t *testing.T) (*lockedRecords, func()) {
	t.Helper()
	records := &lockedRecords{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(records, nil)))
	return records, func() { slog.SetDefault(previous) }
}

// The coverage above drives memberAddClock directly, so it proves the record's
// shape and privacy but NOT that Members.Add actually arms a stage around the
// GitHub call, the roster write and the commit. This is that proof, at the
// nearest real service boundary the package already has — the real product
// database from postgresfixture and a real httptest GitHub upstream — with the
// upstream GATED rather than slow: the handler blocks on a channel the test
// releases, so a genuinely blocked request is observed without one speculative
// long sleep and without changing any client timeout or caller deadline.
//
// members.add is a person-only command needing maintainer, and its mutation
// serializes the caller's own live session, so the request carries the
// install owner's real browser session through the package's established
// credential fixture. No product fence is weakened or bypassed to reach the
// gate: an add that refuses before the gate fails this test immediately with
// its own error and the stages it did record, because a gate that is never
// reached would otherwise be waited on forever.
func TestMemberAddNamesTheBlockedStageOfARealRequestPostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("the roster add's real boundary needs PostgreSQL")
	}
	for _, tc := range []struct {
		name            string
		gatedPath       string
		permissionCode  int
		wantStage       string
		wantRefusedOnce bool
		wantErr         bool
	}{
		{
			name:      "a blocked GitHub user read names github_user in flight, then again on return",
			gatedPath: "/users/newmember",
			wantStage: memberAddStageGitHubUser,
		},
		{
			name:            "a stage whose own call refuses says refused on return",
			gatedPath:       "/repos/acme/app/collaborators/newmember/permission",
			permissionCode:  401,
			wantStage:       memberAddStagePermission,
			wantRefusedOnce: true,
			wantErr:         true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			ctx := t.Context()
			q := db.New(pool)
			owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "owner", LowerUsername: "owner"})
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES($1)`, owner.ID)
			require.NoError(t, err)
			repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "app", LowerName: "app", DefaultBookmark: "main"})
			require.NoError(t, err)
			binding, _ := json.Marshal(map[string]any{"owner_login": "acme", "repository_name": "app", "repository_id": repo.ID})
			require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: binding}))

			// The gate: the upstream holds exactly one request open until the
			// test releases it, with its own bound so a failing test can never
			// hang the suite.
			release, reached := make(chan struct{}), make(chan struct{})
			var gatedOnce, releaseOnce sync.Once
			openGate := func() { releaseOnce.Do(func() { close(release) }) }
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == tc.gatedPath {
					gatedOnce.Do(func() {
						close(reached)
						select {
						case <-release:
						case <-time.After(10 * time.Second):
						}
					})
				}
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/repos/acme/app/installation":
					fmt.Fprint(w, `{"id":91}`)
				case "/users/newmember":
					fmt.Fprint(w, `{"id":102,"login":"newmember"}`)
				case "/repos/acme/app":
					fmt.Fprint(w, `{"id":500,"full_name":"acme/app"}`)
				case "/installation/repositories":
					fmt.Fprint(w, `{"total_count":1,"repositories":[{"id":500}]}`)
				case "/repos/acme/app/collaborators/newmember/permission":
					if tc.permissionCode != 0 {
						w.WriteHeader(tc.permissionCode)
						fmt.Fprint(w, `{"message":"Bad credentials"}`)
						return
					}
					fmt.Fprint(w, `{"user":{"id":102},"permission":"write","role_name":"write"}`)
				default:
					fmt.Fprint(w, `{}`)
				}
			}))
			// Registered before the request's own release/cancel/join below, so
			// that cleanup runs first and Close never waits on a held gate.
			t.Cleanup(server.Close)
			t.Setenv(envGitHubAppAPIBaseURL, server.URL)

			records, restore := captureMemberAddRecords(t)
			t.Cleanup(restore)
			members := &Members{
				Pool: pool, Credentials: memberCredentials{}, Minter: &recordingMinter{},
				// Short enough to watch, long enough that an unblocked stage
				// still reports nothing: the production budget is untouched.
				addStageBudget: 100 * time.Millisecond,
			}
			request := registerTestInstallCredential(t, pool,
				middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &owner, SessionHash: "member-add-browser-session"}), repo.ID)
			request, cancelRequest := context.WithCancel(request)

			done, finished := make(chan error, 1), make(chan struct{})
			go func() { done <- members.Add(request, "newmember"); close(finished) }()
			// However this case ends — assertion failure included — the gate
			// opens, the request is cancelled and the one goroutine this test
			// owns is joined, before the server is closed.
			t.Cleanup(func() {
				openGate()
				cancelRequest()
				select {
				case <-finished:
				case <-time.After(10 * time.Second):
					t.Error("the roster add never returned after its gate opened and its request was cancelled")
				}
			})

			// The real request should now be blocked inside the stage under
			// test. If it refused earlier instead, its own error and the stages
			// it did record are the finding; waiting on the gate would hang.
			select {
			case <-reached:
			case err = <-done:
				t.Fatalf("the roster add returned before it reached %s: error %v; stages recorded: %q",
					tc.wantStage, err, records.String())
			case <-time.After(20 * time.Second):
				t.Fatalf("the roster add neither reached %s nor returned; stages recorded: %q",
					tc.wantStage, records.String())
			}
			require.Eventually(t, func() bool {
				text := records.String()
				return strings.Contains(text, "stage="+tc.wantStage) &&
					strings.Contains(text, "phase="+memberAddPhaseInFlight)
			}, 10*time.Second, 10*time.Millisecond,
				"a real roster add blocked in %s must name that stage before it returns", tc.wantStage)
			inFlight := records.String()
			require.Contains(t, inFlight, "caller="+memberAddCallerLive,
				"the caller had not given up, so the wait is the upstream's")
			// The pool's own counters are what separate a stalled upstream call
			// from connection starvation inside the pool.
			for _, counter := range []string{"pool_acquired=", "pool_idle=", "pool_max=", "pool_empty_acquires=", "pool_canceled_acquires="} {
				require.Contains(t, inFlight, counter)
			}

			openGate()
			select {
			case err = <-done:
			case <-time.After(20 * time.Second):
				t.Fatalf("the roster add did not return after its gate opened; stages recorded: %q", records.String())
			}
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				var rows int
				require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM collaborators WHERE repository_id=$1 AND github_login='newmember'`, repo.ID).Scan(&rows))
				require.Equal(t, 1, rows, "the add still writes its row")
			}
			text := records.String()
			require.Contains(t, text, "stage="+tc.wantStage)
			require.Contains(t, text, "phase="+memberAddPhaseReturned,
				"the stage names itself again when it finally returns")
			if tc.wantRefusedOnce {
				require.Contains(t, text, "refused=true")
			}
			// Nothing about the person, the credential or the upstream reaches
			// the record: not the login, not the minted token, not the
			// upstream's own URL, host or error text, and no upstream status is
			// carried on any key. A bare status number is not asserted against,
			// because the handler's own timestamp digits would decide it.
			for _, forbidden := range []string{"newmember", "minted-token", "Bearer", "app-jwt", server.URL, "Bad credentials", "acme", "status="} {
				require.NotContains(t, text, forbidden, "a stage record must carry no %q", forbidden)
			}
		})
	}
}
