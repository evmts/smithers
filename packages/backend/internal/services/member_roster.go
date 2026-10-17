package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

var memberLoginPattern = regexp.MustCompile(`(?i)^[a-z0-9](?:[a-z0-9]|-(?:[a-z0-9])){0,38}$`)

// ValidMemberLogin reports a well-formed GitHub username.
func ValidMemberLogin(login string) bool {
	return len(login) <= 39 && memberLoginPattern.MatchString(login)
}

func memberError(status int, class, code, message string) error {
	return &AccessError{Status: status, Class: class, Code: code, Message: message}
}

type memberRepository struct {
	Owner string `json:"owner_login"`
	Name  string `json:"repository_name"`
	ID    int64  `json:"repository_id"`
}

// accessURL is the repository's collaborator settings on GitHub.
func (r memberRepository) accessURL() string {
	return "https://github.com/" + r.Owner + "/" + r.Name + "/settings/access"
}

func (m *Members) repository(ctx context.Context) (memberRepository, error) {
	var repo memberRepository
	setting, err := db.New(m.Pool).GetInstallSetting(ctx, "github.repository")
	if err == nil {
		err = json.Unmarshal(setting.Value, &repo)
	}
	if err != nil || repo.ID <= 0 || !gitHubAppComponent.MatchString(repo.Owner) || !gitHubAppComponent.MatchString(repo.Name) {
		return repo, memberError(http.StatusServiceUnavailable, "infra", "unavailable", "Repository unavailable")
	}
	return repo, nil
}

// api is a GitHub client whose requests count against the shared budget.
func (m *Members) api(timeout time.Duration) *landingGitHubAPI {
	return &landingGitHubAPI{client: m.Budget.WrapClient(&http.Client{Timeout: timeout}), baseURL: func() string {
		if base := os.Getenv(envGitHubAppAPIBaseURL); base != "" {
			return base
		}
		return defaultGitHubAPIBaseURL
	}}
}

// installationAccess is the roster's installation token from the one minter,
// for the installation the App JWT finds on the install's repository; a
// caller never names the installation.
func (m *Members) installationAccess(ctx context.Context, repo memberRepository) (string, error) {
	if m.Credentials == nil || m.Minter == nil {
		return "", ErrGitHubAppNotConfigured
	}
	jwt, err := m.Credentials.AppJWT(ctx)
	if err != nil {
		return "", err
	}
	api := m.api(15 * time.Second)
	var installation struct {
		ID int64 `json:"id"`
	}
	status, err := api.request(ctx, jwt, http.MethodGet, landingGitHubRepoPath(repo.Owner, repo.Name)+"/installation", nil, &installation)
	if err == nil && status != http.StatusOK {
		return "", memberGitHubFailure(status)
	}
	if err != nil {
		var upstream *pkgerrors.APIError
		if errors.As(err, &upstream) && upstream.Code == pkgerrors.CodeGitHubRateLimited {
			return "", err
		}
	}
	if err != nil || status != http.StatusOK || installation.ID <= 0 {
		return "", memberError(http.StatusServiceUnavailable, "infra", "github_unavailable", "GitHub unavailable")
	}
	token, err := m.memberToken(ctx, installation.ID)
	if err != nil {
		var upstream *pkgerrors.APIError
		if errors.As(err, &upstream) && upstream.Code == pkgerrors.CodeGitHubRateLimited {
			return "", err
		}
		if errors.As(err, &upstream) && (upstream.Status == 401 || upstream.Status == 403 || upstream.Status == 404) {
			return "", memberGitHubFailure(upstream.Status)
		}
		return "", memberError(http.StatusServiceUnavailable, "infra", "github_unavailable", "GitHub unavailable")
	}
	return token, nil
}

// githubMemberRole seeds a role from GitHub's answer. GitHub's legacy
// permission reports maintain as write, so role_name decides: admin or
// maintain is a Maintainer (collaborators admin), write a Member.
func githubMemberRole(permission, role string) string {
	if permission == "read" || permission == "none" {
		return ""
	}
	if permission == "admin" || role == "admin" || role == "maintain" {
		return "admin"
	}
	if permission == "write" || role == "write" {
		return "write"
	}
	return ""
}

type memberInstallationRefusal struct{ cause string }

func (e *memberInstallationRefusal) Unwrap() error {
	return memberError(http.StatusServiceUnavailable, "infra", "github_unavailable", "GitHub unavailable")
}
func (e *memberInstallationRefusal) Error() string { return "GitHub installation " + e.cause }
func memberGitHubFailure(status int) error {
	if status == 401 || status == 403 {
		return &memberInstallationRefusal{cause: "permission"}
	}
	if status == 404 {
		return &memberInstallationRefusal{cause: "not_installed"}
	}
	return memberError(http.StatusServiceUnavailable, "infra", "github_unavailable", "GitHub unavailable")
}

// Confirm installation access by immutable repository ID. Public metadata alone
// never authorizes a member change. All pages use the same installation token.
func (m *Members) confirmInstallationRepository(ctx context.Context, token string, repo memberRepository) error {
	api := m.api(15 * time.Second)
	var metadata struct {
		ID       int64  `json:"id"`
		FullName string `json:"full_name"`
	}
	status, err := api.request(ctx, token, http.MethodGet, landingGitHubRepoPath(repo.Owner, repo.Name), nil, &metadata)
	if err != nil {
		return err
	}
	if status != 200 {
		return memberGitHubFailure(status)
	}
	if metadata.ID <= 0 || !strings.EqualFold(metadata.FullName, repo.Owner+"/"+repo.Name) {
		return memberGitHubFailure(0)
	}
	for page := 1; ; page++ {
		var listing struct {
			Total        int `json:"total_count"`
			Repositories []struct {
				ID int64 `json:"id"`
			} `json:"repositories"`
		}
		status, err = api.request(ctx, token, http.MethodGet, "/installation/repositories?per_page=100&page="+strconv.Itoa(page), nil, &listing)
		if err != nil {
			return err
		}
		if status != 200 {
			return memberGitHubFailure(status)
		}
		if listing.Repositories == nil || listing.Total < 0 {
			return memberGitHubFailure(0)
		}
		for _, r := range listing.Repositories {
			if r.ID == metadata.ID {
				return nil
			}
		}
		if len(listing.Repositories) < 100 || page*100 >= listing.Total {
			return &memberInstallationRefusal{cause: "not_installed"}
		}
	}
}

// Resolve the immutable account before ever using its mutable login.
func (m *Members) memberAccount(ctx context.Context, token string, repo memberRepository, id int64) (string, error) {
	if id <= 0 {
		return "", errors.New("member data defect: missing github_id")
	}
	var user struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	status, err := m.api(15*time.Second).request(ctx, token, http.MethodGet, "/user/"+strconv.FormatInt(id, 10), nil, &user)
	if err != nil {
		return "", err
	}
	if status == 404 {
		return "", nil
	}
	if status != 200 {
		if status == 401 || status == 403 {
			if err := m.confirmInstallationRepository(ctx, token, repo); err != nil {
				return "", err
			}
		}
		return "", memberGitHubFailure(0)
	}
	if user.ID != id || !ValidMemberLogin(user.Login) {
		return "", memberGitHubFailure(0)
	}
	return user.Login, nil
}

func (m *Members) permission(ctx context.Context, token string, repo memberRepository, login string, id int64) (string, error) {
	var out struct {
		Permission string `json:"permission"`
		Role       string `json:"role_name"`
		User       struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	status, err := m.api(15*time.Second).request(ctx, token, http.MethodGet, landingGitHubRepoPath(repo.Owner, repo.Name)+"/collaborators/"+login+"/permission", nil, &out)
	if err != nil {
		return "", err
	}
	if status == 404 {
		// A stale or reassigned login cannot provide another account's permission.
		current, err := m.memberAccount(ctx, token, repo, id)
		if err != nil {
			return "", err
		}
		if err = m.confirmInstallationRepository(ctx, token, repo); err != nil {
			return "", err
		}
		if current == "" {
			return "", nil
		}
		if !strings.EqualFold(current, login) {
			return m.permission(ctx, token, repo, current, id)
		}
		var user struct {
			ID    int64  `json:"id"`
			Login string `json:"login"`
		}
		status, err = m.api(15*time.Second).request(ctx, token, http.MethodGet, "/users/"+current, nil, &user)
		if err != nil {
			return "", err
		}
		if status == 404 {
			return "", nil
		}
		if status != 200 {
			if status == 401 || status == 403 {
				if err := m.confirmInstallationRepository(ctx, token, repo); err != nil {
					return "", err
				}
			}
			return "", memberGitHubFailure(0)
		}
		if user.ID != id || !strings.EqualFold(user.Login, current) {
			return "", memberGitHubFailure(0)
		}
		return "", nil
	}
	if status != 200 {
		if status == 401 || status == 403 {
			if err := m.confirmInstallationRepository(ctx, token, repo); err != nil {
				return "", err
			}
		}
		return "", memberGitHubFailure(0)
	}
	if id <= 0 || out.User.ID != id {
		return "", fmt.Errorf("member identity unresolved: permission user.id %d does not match github_id %d: %w", out.User.ID, id, memberGitHubFailure(0))
	}
	switch out.Permission {
	case "admin", "write", "read", "none":
		return githubMemberRole(out.Permission, out.Role), nil
	}
	return "", memberGitHubFailure(0)
}

// AdmitGitHub runs before a sign-in writes any identity: the GitHub account
// must hold an active roster row, found by its immutable GitHub id, and
// write access on GitHub now. The owner's own account and the claim before
// any owner exists are the exceptions.
func (m *Members) AdmitGitHub(ctx context.Context, id int64, login string) error {
	owner, err := db.New(m.Pool).GetSelfHostOwner(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var ownerGitHubID string
	err = m.Pool.QueryRow(ctx, `SELECT provider_user_id FROM oauth_accounts WHERE user_id=$1 AND provider='workos'`, owner.ID).Scan(&ownerGitHubID)
	if err == nil && ownerGitHubID == strconv.FormatInt(id, 10) {
		return nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	repo, err := m.repository(ctx)
	if err != nil {
		return err
	}
	var listed bool
	err = m.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM collaborators WHERE repository_id=$1 AND github_id=$2 AND suspended_at IS NULL)`, repo.ID, id).Scan(&listed)
	if err != nil {
		return err
	}
	if !listed {
		return memberError(http.StatusForbidden, "permission", "not_a_member", "Not a member")
	}
	token, err := m.installationAccess(ctx, repo)
	if err != nil {
		return err
	}
	role, err := m.permission(ctx, token, repo, login, id)
	if err != nil {
		return err
	}
	if role == "" {
		return memberError(http.StatusForbidden, "permission", "needs_github_access", "Needs access on GitHub ↗")
	}
	return nil
}

// LinkGitHub binds the roster row a maintainer added by username to the
// account that signed in with that GitHub id.
func (m *Members) LinkGitHub(ctx context.Context, id, userID int64, login string) error {
	repo, err := m.repository(ctx)
	if err != nil {
		// No repository is bound yet (the owner signs in during setup), so
		// no roster row can name this account.
		return nil
	}
	_, err = m.Pool.Exec(ctx, `UPDATE collaborators SET user_id=$3,github_login=$4 WHERE repository_id=$1 AND github_id=$2 AND suspended_at IS NULL AND (user_id IS NULL OR user_id=$3)`, repo.ID, id, userID, login)
	return err
}

// The closed set of stages a roster add passes through, in order.
const (
	memberAddStageAuthorize   = "authorize"
	memberAddStageRepository  = "repository"
	memberAddStageInstall     = "installation_access"
	memberAddStageGitHubUser  = "github_user"
	memberAddStagePermission  = "github_permission"
	memberAddStageMutation    = "roster_mutation"
	memberAddStageRosterWrite = "roster_write"
	memberAddStageCommit      = "commit"
)

// The closed set of phases a stage reports itself in. A stage that has not
// returned reports in_flight exactly once, because a stage that never returns
// would otherwise never be recorded at all — which is how a 30 s roster add
// came back with nothing but the caller's own deadline.
const (
	memberAddPhaseInFlight = "in_flight"
	memberAddPhaseReturned = "returned"
)

// The closed set of caller states a stage can be reported in. "live" separates
// a stage the upstream itself held from one the caller had already given up on,
// which is the difference between a product stall and a caller deadline.
const (
	memberAddCallerLive     = "live"
	memberAddCallerCanceled = "canceled"
	memberAddCallerExpired  = "deadline_exceeded"
)

// memberAddSlowStage is the point past which one stage of a roster add is
// long enough to be why the request missed its caller's deadline. Each GitHub
// call the add makes carries a 15 s client timeout of its own, so a single
// stage at or over 5 s already owns a sixth of the composed install's 30 s
// caller budget and is worth a line.
const memberAddSlowStage = 5 * time.Second

// memberAddClock reports the stage of a roster add that alone ran long.
//
// A composed install's first POST /api/members has waited past its caller's
// 30 s deadline with the host idle, no PostgreSQL backend waiting on anything,
// and nothing anywhere in the product's own record to say which stage held it;
// a goroutine dump armed on a fixed sleep caught none of it. Every stage now
// reports itself both while it is still in flight and when it returns, so a
// stage that is genuinely stuck is recorded rather than silent. The record
// carries the stage and phase names from the closed sets above, the stage's
// own whole elapsed seconds, whether it returned a refusal, the request's own
// state and the pool's own counters — never a login, token, id, URL, upstream
// status or error text. Nothing here changes a deadline, a budget or a fence.
type memberAddClock struct {
	ctx  context.Context
	pool *pgxpool.Pool
	// budget is memberAddSlowStage in production; a test shortens it so the
	// in-flight report can be observed without waiting on the real budget.
	budget time.Duration
}

func (m *Members) addClock(ctx context.Context) *memberAddClock {
	budget := memberAddSlowStage
	if m.addStageBudget > 0 {
		budget = m.addStageBudget
	}
	return &memberAddClock{ctx: ctx, pool: m.Pool, budget: budget}
}

// memberAddStageWatch is one stage's own clock.
type memberAddStageWatch struct {
	clock *memberAddClock
	stage string
	start time.Time
	timer *time.Timer
	done  atomic.Bool
}

// at names the stage now beginning and arms its single in-flight report.
func (c *memberAddClock) at(stage string) *memberAddStageWatch {
	return c.since(stage, time.Now())
}

// since is at with an explicit start, so a test can age a stage without
// writing to a watch another goroutine is already holding.
func (c *memberAddClock) since(stage string, start time.Time) *memberAddStageWatch {
	watch := &memberAddStageWatch{clock: c, stage: stage, start: start}
	watch.timer = time.AfterFunc(c.budget, func() {
		if watch.done.Load() {
			return
		}
		c.record(stage, memberAddPhaseInFlight, time.Since(watch.start), false)
	})
	return watch
}

// passed closes the stage, whatever it returned, and stops its in-flight
// report. Every exit from a stage goes through it, including early refusals.
func (w *memberAddStageWatch) passed(err error) {
	w.done.Store(true)
	w.timer.Stop()
	if elapsed := time.Since(w.start); elapsed >= w.clock.budget {
		w.clock.record(w.stage, memberAddPhaseReturned, elapsed, err != nil)
	}
}

// caller names the request's own state, never an error's text.
func memberAddCaller(ctx context.Context) string {
	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return memberAddCallerExpired
	case ctx.Err() != nil:
		return memberAddCallerCanceled
	}
	return memberAddCallerLive
}

func (c *memberAddClock) record(stage, phase string, elapsed time.Duration, refused bool) {
	record := []any{"stage", stage, "phase", phase, "seconds", int64(elapsed / time.Second),
		"refused", refused, "caller", memberAddCaller(c.ctx)}
	if c.pool != nil {
		stat := c.pool.Stat()
		record = append(record,
			"pool_acquired", stat.AcquiredConns(), "pool_idle", stat.IdleConns(), "pool_max", stat.MaxConns(),
			"pool_empty_acquires", stat.EmptyAcquireCount(), "pool_canceled_acquires", stat.CanceledAcquireCount())
	}
	slog.WarnContext(c.ctx, "members.add_stage_slow", record...)
}

// Add puts a GitHub user on the roster. Their role seeds from their GitHub
// permission; a person without write access there is refused with no row.
func (m *Members) Add(ctx context.Context, login string) error {
	clock := m.addClock(ctx)
	stage := clock.at(memberAddStageAuthorize)
	decision, err := Authorize(ctx, db.New(m.Pool), "members.add")
	stage.passed(err)
	if err != nil {
		return err
	}
	if !ValidMemberLogin(login) {
		return memberError(http.StatusBadRequest, "user", "invalid_login", "Enter a GitHub username")
	}
	stage = clock.at(memberAddStageRepository)
	repo, err := m.repository(ctx)
	stage.passed(err)
	if err != nil {
		return err
	}
	stage = clock.at(memberAddStageInstall)
	token, err := m.installationAccess(ctx, repo)
	stage.passed(err)
	if err != nil {
		return err
	}
	var user struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	stage = clock.at(memberAddStageGitHubUser)
	status, err := m.api(15*time.Second).request(ctx, token, http.MethodGet, "/users/"+login, nil, &user)
	stage.passed(err)
	if err != nil || (status != http.StatusOK && status != http.StatusNotFound) {
		return memberError(http.StatusServiceUnavailable, "infra", "github_unavailable", "GitHub unavailable")
	}
	if status == http.StatusNotFound || user.ID <= 0 || !ValidMemberLogin(user.Login) {
		return memberError(http.StatusNotFound, "user", "unknown_github_user", "Unknown GitHub user")
	}
	stage = clock.at(memberAddStagePermission)
	role, err := m.permission(ctx, token, repo, user.Login, user.ID)
	stage.passed(err)
	if err != nil {
		return err
	}
	if role == "" {
		// The maintainer fixes this on GitHub: the card links the refusal to
		// the repository's access settings (T-APP-06, class user).
		return &AccessError{Status: http.StatusForbidden, Class: "user", Code: "needs_github_access", Message: "Needs access on GitHub", Fix: repo.accessURL()}
	}
	stage = clock.at(memberAddStageMutation)
	tx, _, err := m.memberMutation(ctx, decision.UserID, repo.ID)
	stage.passed(err)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// The roster write is its own stage: the mutation stage above closes when
	// the transaction is open and its repository lock is held, so without this
	// one every statement of the actual write — and every refusal that returns
	// before the commit — would run outside any stage at all.
	stage = clock.at(memberAddStageRosterWrite)
	err = m.writeRosterRow(ctx, tx, repo, user.ID, user.Login, role)
	stage.passed(err)
	if err != nil {
		return err
	}
	stage = clock.at(memberAddStageCommit)
	err = tx.Commit(ctx)
	stage.passed(err)
	return err
}

// writeRosterRow is the roster add's own write, inside the caller's open
// transaction. A person already on the roster, by GitHub id or by account,
// keeps their row and role: adding again changes nothing.
func (m *Members) writeRosterRow(ctx context.Context, tx pgx.Tx, repo memberRepository, id int64, login, role string) error {
	githubID := strconv.FormatInt(id, 10)
	tag, err := tx.Exec(ctx, `INSERT INTO collaborators(repository_id,github_id,github_login,user_id,permission)
 VALUES($1,$2,$3,(SELECT user_id FROM oauth_accounts WHERE provider='workos' AND provider_user_id=$4),$5)
 ON CONFLICT DO NOTHING`, repo.ID, id, login, githubID, role)
	if err != nil {
		return err
	}
	if err = allocateRosterLogins(ctx, tx); err != nil {
		return err
	}
	// Removal barred the account from signing in; being added again lifts it.
	if tag.RowsAffected() == 1 {
		if _, err = tx.Exec(ctx, `UPDATE users SET prohibit_login=false WHERE id=(SELECT user_id FROM oauth_accounts WHERE provider='workos' AND provider_user_id=$1) AND id<>(SELECT user_id FROM self_host_owners WHERE singleton)`, githubID); err != nil {
			return err
		}
	}
	return nil
}

// MemberProjection is one Members card row (packages/rpc MembersCard).
type MemberProjection struct {
	Login       string           `json:"login"`
	Name        string           `json:"name"`
	AvatarURL   string           `json:"avatar_url"`
	ColorIndex  int              `json:"color_index"`
	Role        string           `json:"role"`
	NeedsAccess bool             `json:"needs_access"`
	Suspended   bool             `json:"suspended"`
	Actions     []map[string]any `json:"actions"`
}

// MembersProjection is the Members card.
type MembersProjection struct {
	Members   []MemberProjection `json:"members"`
	AccessURL string             `json:"access_url"`
}

// List is the roster: the owner first, then everyone added, in order.
func (m *Members) List(ctx context.Context) (MembersProjection, error) {
	out := MembersProjection{Members: []MemberProjection{}}
	decision, err := Authorize(ctx, db.New(m.Pool), "members.list")
	if err != nil {
		return out, err
	}
	return m.roster(ctx, decision.Role.rank() >= InstallMaintainer.rank())
}

// SharedRoster serves authorized live subscribers without role controls.
func (m *Members) SharedRoster(ctx context.Context) (MembersProjection, error) {
	return m.roster(ctx, false)
}

func (m *Members) roster(ctx context.Context, canWrite bool) (MembersProjection, error) {
	out := MembersProjection{Members: []MemberProjection{}}
	repo, err := m.repository(ctx)
	if err != nil {
		return out, err
	}
	out.AccessURL = repo.accessURL()
	rows, err := m.Pool.Query(ctx, `SELECT coalesce(c.github_login,u.username),coalesce(nullif(u.display_name,''),c.github_login,u.username),c.permission,c.suspended_at IS NOT NULL,coalesce(c.user_id=o.user_id,false)
 FROM collaborators c LEFT JOIN users u ON u.id=c.user_id CROSS JOIN self_host_owners o
 WHERE c.repository_id=$1 AND (c.user_id IS NOT NULL OR c.github_id IS NOT NULL)
 ORDER BY coalesce(c.user_id=o.user_id,false) DESC,c.id`, repo.ID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var row MemberProjection
		var permission string
		var owner bool
		if err = rows.Scan(&row.Login, &row.Name, &permission, &row.Suspended, &owner); err != nil {
			return out, err
		}
		row.Role = string(InstallMember)
		if permission == "admin" {
			row.Role = string(InstallMaintainer)
		}
		if owner {
			row.Role = string(InstallOwner)
		}
		row.AvatarURL = "https://github.com/" + row.Login + ".png"
		row.ColorIndex = len(out.Members) % 6
		row.Actions = []map[string]any{}
		if canWrite && !owner {
			row.Actions = []map[string]any{{"tag": "members.role", "label": "Role", "args": map[string]string{"login": row.Login}}, {"tag": "members.remove", "label": "Remove", "args": map[string]string{"login": row.Login}}}
		}
		out.Members = append(out.Members, row)
	}
	return out, rows.Err()
}

// ChangeRole sets a member's role. The owner's role never changes.
func (m *Members) ChangeRole(ctx context.Context, login, role string) error {
	decision, err := Authorize(ctx, db.New(m.Pool), "members.role")
	if err != nil {
		return err
	}
	if !ValidMemberLogin(login) {
		return memberError(http.StatusBadRequest, "user", "invalid_login", "Enter a GitHub username")
	}
	if role != string(InstallMember) && role != string(InstallMaintainer) && role != string(InstallOwner) {
		return memberError(http.StatusBadRequest, "user", "invalid_role", "Invalid role")
	}
	repo, err := m.repository(ctx)
	if err != nil {
		return err
	}
	tx, owner, err := m.memberMutation(ctx, decision.UserID, repo.ID)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	id, userID, err := lockMemberRow(ctx, tx, repo.ID, login)
	if err != nil {
		return err
	}
	if role == string(InstallOwner) || (userID != nil && *userID == owner) {
		return memberError(http.StatusForbidden, "permission", "owner_immutable", "Owner cannot be changed")
	}
	permission := "write"
	if role == string(InstallMaintainer) {
		permission = "admin"
	}
	if _, err = tx.Exec(ctx, `UPDATE collaborators SET permission=$2 WHERE id=$1`, id, permission); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// lockMemberRow locks login's roster row, matched case-insensitively.
func lockMemberRow(ctx context.Context, tx pgx.Tx, repositoryID int64, login string) (int64, *int64, error) {
	var id int64
	var userID *int64
	err := tx.QueryRow(ctx, `SELECT c.id,c.user_id FROM collaborators c LEFT JOIN users u ON u.id=c.user_id
 WHERE c.repository_id=$1 AND lower(coalesce(c.github_login,u.username))=lower($2) FOR UPDATE OF c`, repositoryID, login).Scan(&id, &userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil, memberError(http.StatusNotFound, "user", "not_found", "Member not found")
	}
	return id, userID, err
}
