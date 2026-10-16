package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// The hosted, multitenant GitHub issue acts. They ride the SAME durable
// pipeline as the install's (one jobs.Store, one worker handler, one send
// fence, one receipt door); only the authority differs. An install writes as
// its one bound repository's owner, read off install_settings; a hosted actor
// writes one repository they hold repository WRITE on, proven against GitHub
// with their own credential before the App's installation token is minted.
//
// Each act is its own operation, and an operation is NEVER read off a
// payload: the worker takes the command from the operation it claimed, so a
// request authorized to comment can never arrive as a close, and a hosted
// payload can never be claimed by the install branch or the other way round.
const (
	HostedIssueCreateOperation      = "github.issue.create"
	HostedIssueCommentOperation     = "github.issue.comment"
	HostedIssueCloseOperation       = "github.issue.close"
	HostedIssueReopenOperation      = "github.issue.reopen"
	HostedIssueCommentEditOperation = "github.issue.comment.edit"
)

// hostedIssueOperationCommands maps each hosted operation to the ONE catalog
// command that authorizes it — the same command names the install doors use,
// so no new catalog operation, wire field or done code exists.
var hostedIssueOperationCommands = map[string]string{
	HostedIssueCreateOperation:      "issue.new",
	HostedIssueCommentOperation:     "issue.comment",
	HostedIssueCloseOperation:       "issues.close",
	HostedIssueReopenOperation:      "issues.reopen",
	HostedIssueCommentEditOperation: "issue.comment",
}

// IssueWriteOperations is every operation the one shared issue-write worker
// claims: the install's and the hosted composition's. A composition that
// admits only one family still registers both, so the worker is literally
// the same worker in both and no second engine or daemon exists.
func IssueWriteOperations() []string {
	return []string{
		InstallIssueCommentOperation, InstallIssueCreateOperation, InstallIssueCloseOperation,
		InstallIssueReopenOperation, InstallIssueCommentEditOperation,
		HostedIssueCreateOperation, HostedIssueCommentOperation, HostedIssueCloseOperation,
		HostedIssueReopenOperation, HostedIssueCommentEditOperation,
	}
}

// issueWriteActs names what each operation does to GitHub. The install's and
// the hosted composition's operations map onto the SAME five acts, so one
// send path serves both and neither can do an act the other cannot.
var issueWriteActs = map[string]string{
	InstallIssueCreateOperation:      "create",
	HostedIssueCreateOperation:       "create",
	InstallIssueCommentOperation:     "comment",
	HostedIssueCommentOperation:      "comment",
	InstallIssueCloseOperation:       "close",
	HostedIssueCloseOperation:        "close",
	InstallIssueReopenOperation:      "reopen",
	HostedIssueReopenOperation:       "reopen",
	InstallIssueCommentEditOperation: "comment.edit",
	HostedIssueCommentEditOperation:  "comment.edit",
}

// hostedIssueScope is the job scope of one hosted act: the repository is the
// tenant and the actor's live credential the principal, exactly as the
// install's acts are scoped. A receipt is therefore readable only by the
// credential that admitted it, for the repository it named.
func hostedIssueScope(repository int64, identity []byte) jobs.Scope {
	digest := sha256.Sum256(identity)
	return jobs.Scope{
		TenantID:    fmt.Sprintf("repository:%d", repository),
		PrincipalID: "credential:" + hex.EncodeToString(digest[:]),
	}
}

// hostedRepositoryOfTenant reads the repository a claimed job is scoped to.
// The worker trusts THIS, never the payload: a poisoned payload naming
// another repository is refused before anything external starts.
func hostedRepositoryOfTenant(tenant string) (int64, bool) {
	rest, ok := strings.CutPrefix(tenant, "repository:")
	if !ok {
		return 0, false
	}
	repository, err := strconv.ParseInt(rest, 10, 64)
	if err != nil || repository <= 0 {
		return 0, false
	}
	return repository, true
}

func hostedIssueUnavailable() error {
	return &TodoControlError{Status: 503, Code: "github_unavailable", Class: "infra", Message: "GitHub issue writes are unavailable"}
}

// hostedIssuePermission is the one refusal a hosted act makes when the actor
// is not a writer of this repository right now. It names no route, no
// credential and no provider prose.
func hostedIssuePermission() error {
	return &AccessError{Status: 403, Class: "permission", Code: "permission", Message: "Write access to this repository is required"}
}

func hostedIssueSignIn() error {
	return &AccessError{Status: 401, Class: "permission", Code: "unauthenticated", Message: "Sign in again"}
}

// RequestGitHubIssueCreate admits the hosted create of one GitHub issue in
// repository. The acknowledgment is immediate and says nothing about GitHub;
// the one send happens on the shared worker behind the credential reload,
// the actor's re-authorization and the send fence.
func (s *MythicalService) RequestGitHubIssueCreate(ctx context.Context, repository int64, input InstallIssueCreateInput, key string) (jobs.RequestReceipt, error) {
	if err := validInstallIssueCreate(input, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Title: input.Title, Body: input.Body}, key, HostedIssueCreateOperation)
}

// RequestGitHubIssueComment admits a comment on one of repository's GitHub issues.
func (s *MythicalService) RequestGitHubIssueComment(ctx context.Context, repository, number int64, body, key string) (jobs.RequestReceipt, error) {
	if err := validIssueComment(number, body, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Number: number, Body: body}, key, HostedIssueCommentOperation)
}

// RequestGitHubIssueClose and RequestGitHubIssueReopen admit the ordinary
// close and reopen. Each door admits exactly one act, so a close can never
// become a reopen between authorization and the write.
func (s *MythicalService) RequestGitHubIssueClose(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	if err := validIssueNumber(number, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Number: number}, key, HostedIssueCloseOperation)
}

func (s *MythicalService) RequestGitHubIssueReopen(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	if err := validIssueNumber(number, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Number: number}, key, HostedIssueReopenOperation)
}

// RequestGitHubIssueCommentEdit admits a new body for one comment the App
// wrote. GitHub lets only a comment's own author edit it, so a person's own
// comment answers GitHub's refusal rather than being rewritten for them.
func (s *MythicalService) RequestGitHubIssueCommentEdit(ctx context.Context, repository, comment int64, body, key string) (jobs.RequestReceipt, error) {
	if err := validIssueComment(comment, body, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Comment: comment, Body: body}, key, HostedIssueCommentEditOperation)
}

// admitHostedIssueWrite records one durable act in its own transaction, after
// re-reading the actor's live repository authority under the same row locks
// the worker takes. Nothing external happens here.
func (s *MythicalService) admitHostedIssueWrite(ctx context.Context, repository int64, job installIssueWriteJob, key, operation string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, hostedIssueUnavailable()
	}
	if repository <= 0 {
		return jobs.RequestReceipt{}, hostedIssuePermission()
	}
	info := middleware.AuthInfoFromContext(ctx)
	var receipt jobs.RequestReceipt
	err := pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		bound, actor, err := lockHostedRepositoryWriter(ctx, tx, info, repository)
		if err != nil {
			return err
		}
		identity, _ := json.Marshal(middleware.CredentialOf(info))
		job.Repository, job.Requester, job.Login = repository, actor.ID, actor.Username
		payload, _ := json.Marshal(job)
		receipt, err = s.issueJobs.AdmitInTx(bound, tx, jobs.Admission{
			Scope:     hostedIssueScope(repository, identity),
			Operation: operation, RequestID: key, Payload: payload,
			AuthorizationContext: identity, EffectPolicy: jobs.EffectUnsafe,
		})
		if errors.Is(err, jobs.ErrPayloadConflict) {
			return todoRequestMismatch()
		}
		return err
	})
	return receipt, err
}

// GitHubIssueRequestStatus answers the state of one admitted hosted act —
// the create's new number once GitHub has given one. It is the door a client
// whose acknowledgment never arrived reads INSTEAD of repeating the write.
func (s *MythicalService) GitHubIssueRequestStatus(ctx context.Context, repository int64, id string) (map[string]any, error) {
	if s == nil || s.store == nil || s.issueJobs == nil {
		return nil, hostedIssueUnavailable()
	}
	info := middleware.AuthInfoFromContext(ctx)
	if info == nil || info.User == nil {
		return nil, hostedIssueSignIn()
	}
	identity, _ := json.Marshal(middleware.CredentialOf(info))
	var result map[string]any
	err := pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		operation, err := s.issueJobs.GetInTx(ctx, tx, hostedIssueScope(repository, identity), id)
		// Only this credential's own hosted acts are readable here. An
		// install act, another credential's act or an unrelated operation is
		// absent, never another actor's outcome.
		if errors.Is(err, jobs.ErrNotFound) || err == nil && hostedIssueOperationCommands[operation.Operation] == "" {
			return &TodoControlError{Status: 404, Class: "user", Code: "issue_request_not_found", Message: "Issue request unavailable"}
		}
		if err != nil {
			return err
		}
		result = map[string]any{"state": operation.State}
		var receipt struct {
			Number int64  `json:"number"`
			Code   string `json:"code"`
		}
		if json.Unmarshal(operation.TerminalReceipt, &receipt) == nil {
			if operation.State == jobs.StateCompleted && receipt.Number > 0 {
				result["number"] = receipt.Number
			}
			// A settled failure names its closed reason code and nothing
			// else: no provider sentence, URL, header or credential.
			if operation.State == jobs.StateFailed && receipt.Code != "" {
				result["code"] = receipt.Code
			}
		}
		return nil
	})
	return result, err
}

// lockHostedRepositoryWriter serializes this act with the repository's
// collaborator changes, the account's suspension and the credential's
// revocation, then reloads the credential and re-resolves the actor's live
// repository permission. It is the hosted counterpart of
// lockInstallWriteCredential and performs the SAME four checks: the
// credential still authenticates, it is still the same person, that person
// still holds repository WRITE, and the credential still carries repository
// write authority.
func lockHostedRepositoryWriter(ctx context.Context, tx pgx.Tx, info *middleware.AuthInfo, repository int64) (context.Context, db.User, error) {
	if info == nil || info.User == nil {
		return ctx, db.User{}, hostedIssueSignIn()
	}
	q := db.New(tx)
	for _, query := range []struct {
		sql  string
		args []any
	}{
		{`SELECT 1 FROM repositories WHERE id=$1 FOR SHARE`, []any{repository}},
		{`SELECT 1 FROM users WHERE id=$1 FOR SHARE`, []any{info.User.ID}},
		{`SELECT 1 FROM auth_sessions WHERE session_key=$1 FOR SHARE`, []any{info.SessionHash}},
		{`SELECT 1 FROM access_tokens WHERE id=$1 FOR SHARE`, []any{info.TokenID}},
		{`SELECT 1 FROM collaborators WHERE repository_id=$1 AND user_id=$2 FOR SHARE`, []any{repository, info.User.ID}},
	} {
		if _, err := tx.Exec(ctx, query.sql, query.args...); err != nil {
			return ctx, db.User{}, err
		}
	}
	fresh, err := middleware.ReloadCredential(ctx, q, middleware.CredentialOf(info), time.Now())
	if errors.Is(err, middleware.ErrCredentialGone) {
		return ctx, db.User{}, hostedIssueSignIn()
	}
	if err != nil {
		return ctx, db.User{}, err
	}
	if fresh.User.ID != info.User.ID {
		return ctx, db.User{}, hostedIssuePermission()
	}
	fresh.ViaHint = info.ViaHint
	bound := middleware.ContextWithAuthInfo(ctx, fresh)
	if err := hostedRepositoryWriteAuthority(bound, q, fresh, repository); err != nil {
		return ctx, db.User{}, err
	}
	return bound, *fresh.User, nil
}

// hostedRepositoryWriteAuthority is the live answer to "may this credential
// write this repository right now": the repository's own permission resolver
// (owner, org owner, team grant or collaborator grant — a read-only
// collaborator and a public-repository stranger both resolve to read), plus
// the credential's own repository write scope and binding. It is deliberately
// the resolver the HTTP middleware uses, never a role heuristic of its own.
func hostedRepositoryWriteAuthority(ctx context.Context, q *db.Queries, info *middleware.AuthInfo, repository int64) error {
	if info.IsTokenAuth && !info.Scopes.Has(middleware.ScopeWriteRepository) {
		return hostedIssuePermission()
	}
	if restricted := info.RepositoryRestriction(); restricted != 0 && restricted != repository {
		return hostedIssuePermission()
	}
	repo, err := q.GetRepoByID(ctx, repository)
	if err != nil {
		return err
	}
	permission, refusal := middleware.ResolveRepoPermission(ctx, q, repo, info.User)
	if refusal != nil {
		return &AccessError{Status: refusal.Status, Class: "permission", Code: string(refusal.Code), Message: refusal.Message}
	}
	if !permission.Satisfies(middleware.PermissionWrite) {
		return hostedIssuePermission()
	}
	return nil
}

// handleHostedIssueWrite is the hosted branch of the one shared worker
// handler. The order is the install branch's order, with the repository read
// off the claim's own tenant rather than off install_settings:
//
//  1. the claim's operation names the command — never the payload;
//  2. the payload's repository must BE the tenant's repository;
//  3. the credential is reloaded and the actor's live repository write
//     authority re-resolved;
//  4. GitHub's own answer, with the actor's own credential, must say the
//     actor can write this repository, before the App's narrow
//     installation token is minted;
//  5. the fence re-reads 3 and 4's row state, records the attempt, and only
//     then does the ONE external request run.
func (s *MythicalService) handleHostedIssueWrite(ctx context.Context, lease *jobs.Lease, job installIssueWriteJob, credential middleware.Credential) error {
	claim := lease.Claim()
	repository, ok := hostedRepositoryOfTenant(claim.Scope.TenantID)
	if !ok || repository != job.Repository {
		// A payload naming another repository never reaches GitHub.
		return lease.Fail(ctx, json.RawMessage(`{"code":"permission","class":"permission"}`))
	}
	info, err := middleware.ReloadCredential(ctx, s.queries(), credential, time.Now())
	if err != nil && !errors.Is(err, middleware.ErrCredentialGone) {
		return err
	}
	if err != nil {
		return lease.Fail(ctx, json.RawMessage(`{"code":"unauthenticated","class":"permission"}`))
	}
	bound := middleware.ContextWithAuthInfo(ctx, info)
	if err = hostedRepositoryWriteAuthority(bound, s.queries(), info, repository); err != nil {
		return lease.Fail(ctx, json.RawMessage(`{"code":"permission","class":"permission"}`))
	}
	if info.User.ID != job.Requester {
		return lease.Fail(ctx, json.RawMessage(`{"code":"permission","class":"permission"}`))
	}
	repo, owner, err := s.repository(bound, repository)
	if err != nil {
		return err
	}
	// GitHub's own access rules decide here, with the actor's credential: a
	// read-only collaborator is refused and an owner, admin or writer is
	// not. An App that is not installed answers the connection flow. Only a
	// CLOSED refusal settles the request; anything else is transient, so the
	// lease retries rather than burning the act.
	gh, err := s.github.ResolveIssueWrite(bound, repo, owner, info.User.ID)
	if err != nil {
		var refusal *GitHubIssueWriteUnavailable
		if !errors.As(err, &refusal) {
			return err
		}
		return lease.Fail(ctx, hostedIssueRefusalReceipt(refusal))
	}
	bound = context.WithValue(bound, gitHubIssueSendKey{}, gitHubIssueSendFence(func(send func(context.Context) error) error {
		tx, err := s.store.Begin(bound)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(context.WithoutCancel(bound)) }()
		current, actor, err := lockHostedRepositoryWriter(bound, tx, info, repository)
		if err != nil {
			return err
		}
		if actor.ID != job.Requester {
			return hostedIssuePermission()
		}
		if err = lease.StartExternal(current, json.RawMessage(`{"state":"sending"}`)); err != nil {
			return err
		}
		if err = send(current); err != nil {
			return err
		}
		return tx.Commit(current)
	}))
	// The act comes from the operation the lease CLAIMED, exactly as it does
	// on the install branch: the payload cannot name it.
	return s.sendIssueWriteAct(ctx, bound, lease, gh, job, claim.Operation)
}

// hostedIssueRefusalReceipt is the closed terminal vocabulary of a refused
// hosted act: what the person must do, as a code, with no provider sentence,
// URL, header, credential or customer payload in it. The reason comes from
// the provider's own closed set, never from matching its prose.
var hostedIssueRefusalCodes = map[string]string{
	"app_not_connected": "github_app_not_connected",
	"sign_in_required":  "github_sign_in_required",
	"write_required":    "github_write_required",
}

func hostedIssueRefusalReceipt(refusal *GitHubIssueWriteUnavailable) json.RawMessage {
	code, known := hostedIssueRefusalCodes[refusal.Reason]
	if !known {
		code = "github_unavailable"
	}
	receipt, _ := json.Marshal(map[string]string{"code": code, "class": "permission"})
	return receipt
}
