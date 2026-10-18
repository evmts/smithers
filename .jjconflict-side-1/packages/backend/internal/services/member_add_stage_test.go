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
	"strconv"
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

// #4075's recorded symptom is a roster add whose POST waits a minute for
// headers while the host is idle, no PostgreSQL backend is waiting, the
// caller's deadline expires and the product's own record says nothing. An
// unbounded pool acquire produces exactly that: the goroutine parks in Go with
// no query running, so nothing in the database can be seen waiting. This is
// the discrimination the stage record's pool counters exist for, at the real
// boundary and with a real starved product pool rather than a narrative.
//
// Nothing here changes the pool, the budget or any deadline in production. The
// fixture's own capacity argument makes the pool one connection wide, the test
// holds that connection, and the add's FIRST stage is the one that cannot get
// a second.
func TestMemberAddNamesAStarvedPoolAsItsOwnStagePostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("the roster add's real boundary needs PostgreSQL")
	}
	pool, _ := postgresfixture.NewProductDatabase(t, 1)
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
	request := registerTestInstallCredential(t, pool,
		middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &owner, SessionHash: "member-add-starved-session"}), repo.ID)

	// Every setup query is done, so the pool's one connection can be held.
	held, err := pool.Acquire(ctx)
	require.NoError(t, err)
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(held.Release) }
	t.Cleanup(release)

	records, restore := captureMemberAddRecords(t)
	t.Cleanup(restore)
	members := &Members{
		Pool: pool, Credentials: memberCredentials{}, Minter: &recordingMinter{},
		addStageBudget: 100 * time.Millisecond,
	}
	blocked, giveUp := context.WithCancel(request)
	done, finished := make(chan error, 1), make(chan struct{})
	go func() { done <- members.Add(blocked, "newmember"); close(finished) }()
	t.Cleanup(func() {
		giveUp()
		release()
		select {
		case <-finished:
		case <-time.After(10 * time.Second):
			t.Error("the roster add never returned after its caller gave up and the pool was released")
		}
	})

	// The add's first stage cannot get a connection, and says so.
	require.Eventually(t, func() bool {
		text := records.String()
		return strings.Contains(text, "stage="+memberAddStageAuthorize) &&
			strings.Contains(text, "phase="+memberAddPhaseInFlight)
	}, 10*time.Second, 10*time.Millisecond,
		"a roster add that cannot acquire a connection must name the stage that is waiting")
	starved := records.String()
	// These three are what separate a starved pool from a stalled upstream: no
	// connection is free, every one the pool has is held, and the caller is
	// still waiting.
	for _, counter := range []string{"pool_idle=0", "pool_max=1", "pool_acquired=1"} {
		require.Contains(t, starved, counter,
			"the stage record must carry %q so a starved pool is not read as a slow upstream", counter)
	}
	require.Contains(t, starved, "caller="+memberAddCallerLive)

	// The caller gives up, as the recorded symptom's caller did. The stage
	// names itself and names the caller, rather than returning silently.
	giveUp()
	select {
	case err = <-done:
	case <-time.After(20 * time.Second):
		t.Fatalf("the roster add did not return after its caller gave up; stages recorded: %q", records.String())
	}
	require.Error(t, err)
	text := records.String()
	require.Contains(t, text, "stage="+memberAddStageAuthorize)
	require.Contains(t, text, "phase="+memberAddPhaseReturned)
	require.Contains(t, text, "caller="+memberAddCallerCanceled,
		"the record must say the caller had given up, which is what the reported stall looked like")
	require.NotContains(t, text, "newmember", "a stage record carries no login")
}

// The starved-pool case above holds the pool's only connection from the test
// itself. This one holds none: every connection beyond the first is held by a
// real roster add on the real path, and the single transaction the test does
// open is the product's own ordering lock — the one `lockRoster` takes for
// every roster change and every session a sign-in mints, held here as a
// concurrent sign-in holds it.
//
// What that arrangement separates is the whole point of the pool counters. All
// four adds report the same stage waiting past its budget, so the stage name
// alone cannot say why. On a pool as wide as the product's default the adds are
// waiting on the ordering lock, with connections still to spare. On a pool four
// connections wide — pgxpool's own default on a four-CPU host, the width at
// which a composed install's listeners and transactions already starved each
// other (postgresfixture.DefaultMaxConns) — one of those adds never reaches the
// database at all: it parks in Go with every connection the pool has acquired,
// which is the shape #4075 was reported in, and the record says so.
//
// What the record still does not say, and what nothing here asserts: WHICH of
// the four waiters is the one parked in Go. Every add in flight reads the same
// pool, so an exhausted pool is recorded by the three waiting on the lock as
// well as by the one that never reached the database. The counters name the
// pool's state, not the waiter's.
//
// This is discrimination, not a cause: it establishes what the published
// record can tell apart under contention, not what #4075's install was doing.
// Nothing in production changes.
func TestMemberAddUnderRosterContentionNamesAnExhaustedPoolPostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("the roster add's real boundary needs PostgreSQL")
	}
	const concurrent = 4
	for _, tc := range []struct {
		name          string
		width         int32
		wantMax       string
		wantExhausted bool
	}{
		{
			name:          "four concurrent adds on a four-connection pool exhaust it, and the record says so",
			width:         concurrent,
			wantMax:       "pool_max=4",
			wantExhausted: true,
		},
		{
			name:    "the same four adds on the product's own pool width wait on the lock with connections to spare",
			width:   0,
			wantMax: "pool_max=" + strconv.Itoa(int(postgresfixture.DefaultMaxConns)),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t, tc.width)
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

			// The upstream answers every path each add reaches, promptly: the
			// wait under test is the install's own, not GitHub's.
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch {
				case r.URL.Path == "/repos/acme/app/installation":
					fmt.Fprint(w, `{"id":91}`)
				case r.URL.Path == "/repos/acme/app":
					fmt.Fprint(w, `{"id":500,"full_name":"acme/app"}`)
				case r.URL.Path == "/installation/repositories":
					fmt.Fprint(w, `{"total_count":1,"repositories":[{"id":500}]}`)
				case strings.HasPrefix(r.URL.Path, "/users/"):
					login := strings.TrimPrefix(r.URL.Path, "/users/")
					fmt.Fprintf(w, `{"id":%d,"login":%q}`, contentionMemberID(login), login)
				case strings.HasSuffix(r.URL.Path, "/permission"):
					login := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/repos/acme/app/collaborators/"), "/permission")
					fmt.Fprintf(w, `{"user":{"id":%d},"permission":"write","role_name":"write"}`, contentionMemberID(login))
				default:
					fmt.Fprint(w, `{}`)
				}
			}))
			t.Cleanup(server.Close)
			t.Setenv(envGitHubAppAPIBaseURL, server.URL)

			records, restore := captureMemberAddRecords(t)
			t.Cleanup(restore)
			members := &Members{
				Pool: pool, Credentials: memberCredentials{},
				// Four adds mint at once, before the ordering lock is even
				// contended, so the fixture minter must hold no mutable state.
				// This one is a value with a single immutable field and a value
				// receiver. The upstream above answers the installation lookup
				// with 91 and memberToken refuses a token that does not match
				// that id or is empty, so a drift here fails the add loudly
				// rather than passing silently.
				Minter:         memberResultMinter{GitHubInstallationToken{InstallationID: 91, Token: "contended-token"}},
				addStageBudget: 100 * time.Millisecond,
			}
			request := registerTestInstallCredential(t, pool,
				middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &owner, SessionHash: "member-add-contended-session"}), repo.ID)
			request, cancelRequests := context.WithCancel(request)

			// One ordinary roster-ordering transaction, exactly the lock the
			// product's own lockRoster takes, held while the adds run.
			ordering, err := pool.Begin(ctx)
			require.NoError(t, err)
			_, err = ordering.Exec(ctx, `SELECT user_id FROM self_host_owners FOR UPDATE`)
			require.NoError(t, err)
			var releaseOrdering sync.Once
			release := func() { releaseOrdering.Do(func() { _ = ordering.Rollback(ctx) }) }
			t.Cleanup(release)

			var running sync.WaitGroup
			failures := make(chan error, concurrent)
			for i := range concurrent {
				running.Add(1)
				go func() {
					defer running.Done()
					failures <- members.Add(request, fmt.Sprintf("member%d", i+1))
				}()
			}
			// However this case ends, the lock is released, the requests are
			// cancelled and every goroutine this test owns is joined before the
			// upstream is closed.
			t.Cleanup(func() {
				release()
				cancelRequests()
				joined := make(chan struct{})
				go func() { running.Wait(); close(joined) }()
				select {
				case <-joined:
				case <-time.After(20 * time.Second):
					t.Error("a contended roster add never returned after the lock was released and its request was cancelled")
				}
			})

			require.Eventually(t, func() bool {
				return memberAddRecord(records.String(),
					"stage="+memberAddStageMutation, "phase="+memberAddPhaseInFlight, tc.wantMax) != ""
			}, 20*time.Second, 20*time.Millisecond,
				"every contended add must name the stage it is waiting in")
			waiting := memberAddRecord(records.String(),
				"stage="+memberAddStageMutation, "phase="+memberAddPhaseInFlight, tc.wantMax)
			require.Contains(t, waiting, "caller="+memberAddCallerLive)
			exhausted := memberAddRecord(records.String(),
				"stage="+memberAddStageMutation, "phase="+memberAddPhaseInFlight,
				tc.wantMax, "pool_acquired="+strings.TrimPrefix(tc.wantMax, "pool_max="))
			if tc.wantExhausted {
				require.NotEmpty(t, exhausted,
					"a request that could not get a connection at all must record the pool with every connection acquired")
			} else {
				require.Empty(t, exhausted,
					"waiting on the lock with connections to spare must not look like an exhausted pool")
			}
			require.NotContains(t, records.String(), "member1", "a stage record carries no login")

			// Released, every add completes on the real path and writes its row.
			release()
			for range concurrent {
				select {
				case err = <-failures:
					require.NoError(t, err)
				case <-time.After(30 * time.Second):
					t.Fatalf("a contended roster add did not return after the lock was released; stages recorded: %q", records.String())
				}
			}
			var rows int
			require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM collaborators WHERE repository_id=$1`, repo.ID).Scan(&rows))
			require.Equal(t, concurrent, rows, "every contended add still writes its own row")
		})
	}
}

// contentionMemberID gives each concurrent add its own GitHub id.
func contentionMemberID(login string) int64 {
	suffix, err := strconv.Atoi(strings.TrimPrefix(login, "member"))
	if err != nil {
		return 0
	}
	return int64(200 + suffix)
}

// memberAddRecord returns the first record carrying every part, or "". The
// records share one buffer, so a part found anywhere in the text proves
// nothing about any single record.
func memberAddRecord(text string, parts ...string) string {
	for _, line := range strings.Split(text, "\n") {
		found := true
		for _, part := range parts {
			if !strings.Contains(line, part) {
				found = false
				break
			}
		}
		if found && line != "" {
			return line
		}
	}
	return ""
}
