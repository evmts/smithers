package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/appoperation"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	apierrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// AccountOperationService binds the shared identity operation to verified Go
// identity and existing product-job admission/delivery. It owns no execution queue.
type AccountOperationService struct {
	store    *jobs.Store
	q        *db.Queries
	contract *appoperation.Contract
}

func NewAccountOperationService(store *jobs.Store, q *db.Queries) (*AccountOperationService, error) {
	contract, err := appoperation.Account()
	if err != nil {
		return nil, err
	}
	declaration := contract.Operations[0]
	if len(declaration.Runtime) != 1 || declaration.Runtime[0] != "identity" || len(declaration.Requires) > 0 || len(declaration.RuntimeAny) > 0 || len(declaration.Hosts) > 0 {
		return nil, errors.New("Account identity host does not satisfy the declared requirements")
	}
	if store == nil || q == nil {
		return nil, errors.New("account operation ports unavailable")
	}
	return &AccountOperationService{store: store, q: q, contract: contract}, nil
}

func (s *AccountOperationService) OperationName() string { return s.contract.Operations[0].Name }

func accountOperationScope(userID int64) jobs.Scope {
	identity := fmt.Sprintf("user:%d", userID)
	return jobs.Scope{TenantID: identity, PrincipalID: identity}
}

func (s *AccountOperationService) authority(ctx context.Context) (middleware.AuthReference, error) {
	info := middleware.AuthInfoFromContext(ctx)
	reference, err := info.Reference()
	if err != nil {
		return reference, apierrors.Unauthorized("verified identity required")
	}
	if info.RepositoryRestriction() != 0 || info.WorkspaceRestriction() != "" || (info.IsTokenAuth && !info.Scopes.Has(middleware.ScopeReadUser)) {
		return reference, apierrors.Forbidden("account identity access denied")
	}
	if _, err = s.revalidate(ctx, reference); err != nil {
		return reference, err
	}
	return reference, nil
}

func (s *AccountOperationService) revalidate(ctx context.Context, reference middleware.AuthReference) (*middleware.AuthInfo, error) {
	info, err := middleware.RevalidateAuthReference(ctx, s.q, reference)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apierrors.Forbidden("account authority changed or expired")
	}
	if err != nil {
		return nil, err
	}
	if info.RepositoryRestriction() != 0 || info.WorkspaceRestriction() != "" || (info.IsTokenAuth && !info.Scopes.Has(middleware.ScopeReadUser)) {
		return nil, apierrors.Forbidden("account identity access denied")
	}
	return info, nil
}

func (s *AccountOperationService) validate(schema string, payload json.RawMessage) error {
	if err := s.contract.Validate(schema, payload); err != nil {
		return apierrors.BadRequest("Invalid account operation input.")
	}
	return nil
}

// Discover projects metadata; authority still comes from the authenticated request.
func (s *AccountOperationService) Discover(ctx context.Context, payload json.RawMessage) (any, error) {
	if err := s.validate("noInput", payload); err != nil {
		return nil, err
	}
	if _, err := s.authority(ctx); err != nil {
		return nil, err
	}
	return s.contract, nil
}

func (s *AccountOperationService) Dispatch(ctx context.Context, payload json.RawMessage) (jobs.RequestReceipt, error) {
	if err := s.validate("invocation", payload); err != nil {
		return jobs.RequestReceipt{}, err
	}
	reference, err := s.authority(ctx)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	declaration := s.contract.Operations[0]
	if declaration.UserOnly && reference.Actor != "user" {
		return jobs.RequestReceipt{}, apierrors.Forbidden("account operation requires a person")
	}
	// This identity read declares no confirmation. Refuse future consequential
	// declarations until their existing confirmation port is bound.
	if string(declaration.Confirm) != "null" {
		return jobs.RequestReceipt{}, apierrors.Forbidden("account confirmation required")
	}
	var invocation struct {
		Name      string          `json:"name"`
		RequestID string          `json:"requestId"`
		Input     json.RawMessage `json:"input"`
	}
	if err = json.Unmarshal(payload, &invocation); err != nil {
		return jobs.RequestReceipt{}, err
	}
	authorization, _ := json.Marshal(reference)
	// Include only server-stamped actor/source in the canonical dedup payload.
	// A request ID reused under another authority cannot silently join its request.
	persisted, _ := json.Marshal(struct {
		Input     json.RawMessage          `json:"input"`
		Authority middleware.AuthReference `json:"authority"`
	}{invocation.Input, reference})
	return s.store.Admit(ctx, jobs.Admission{Scope: accountOperationScope(reference.UserID), Operation: declaration.Name, RequestID: invocation.RequestID, Payload: persisted, AuthorizationContext: authorization, EffectPolicy: jobs.EffectIdempotent})
}

type AccountOperationOutcome struct {
	OperationID string          `json:"operationId"`
	RequestID   string          `json:"requestId"`
	State       jobs.State      `json:"state"`
	Actor       string          `json:"actor"`
	Result      json.RawMessage `json:"result,omitempty"`
	Error       string          `json:"error,omitempty"`
}

func (s *AccountOperationService) projection(ctx context.Context, operation jobs.Operation, reference middleware.AuthReference) (AccountOperationOutcome, error) {
	var admitted middleware.AuthReference
	if err := json.Unmarshal(operation.AuthorizationContext, &admitted); err != nil || admitted != reference {
		return AccountOperationOutcome{}, apierrors.Forbidden("account request belongs to another authority")
	}
	if _, err := s.revalidate(ctx, admitted); err != nil {
		return AccountOperationOutcome{}, err
	}
	outcome := AccountOperationOutcome{OperationID: operation.ID, RequestID: operation.RequestID, State: operation.State, Actor: admitted.Actor}
	if operation.State == jobs.StateCompleted {
		if err := s.contract.Validate("identity", operation.TerminalReceipt); err != nil {
			return outcome, errors.New("invalid account completion receipt")
		}
		outcome.Result = operation.TerminalReceipt
	} else if operation.State == jobs.StateFailed || operation.State == jobs.StateUncertain {
		outcome.Error = "Account read failed."
	}
	return outcome, nil
}

func (s *AccountOperationService) request(ctx context.Context, payload json.RawMessage) (jobs.Operation, middleware.AuthReference, error) {
	if err := s.validate("reference", payload); err != nil {
		return jobs.Operation{}, middleware.AuthReference{}, err
	}
	reference, err := s.authority(ctx)
	if err != nil {
		return jobs.Operation{}, reference, err
	}
	var selection struct {
		Name      string `json:"name"`
		RequestID string `json:"requestId"`
	}
	_ = json.Unmarshal(payload, &selection)
	operation, err := s.store.GetByRequest(ctx, accountOperationScope(reference.UserID), selection.Name, selection.RequestID)
	return operation, reference, err
}

func (s *AccountOperationService) Read(ctx context.Context, payload json.RawMessage) (AccountOperationOutcome, error) {
	operation, reference, err := s.request(ctx, payload)
	if err != nil {
		return AccountOperationOutcome{}, err
	}
	return s.projection(ctx, operation, reference)
}

func (s *AccountOperationService) Cancel(ctx context.Context, payload json.RawMessage) (AccountOperationOutcome, error) {
	operation, reference, err := s.request(ctx, payload)
	if err != nil {
		return AccountOperationOutcome{}, err
	}
	if _, err = s.projection(ctx, operation, reference); err != nil {
		return AccountOperationOutcome{}, err
	}
	operation, err = s.store.RequestCancellation(ctx, operation.Scope, operation.ID)
	if err != nil {
		return AccountOperationOutcome{}, err
	}
	return s.projection(ctx, operation, reference)
}

type AccountOperationHistory struct {
	Cursor    int64                     `json:"cursor"`
	Truncated bool                      `json:"truncated"`
	Items     []AccountOperationOutcome `json:"items"`
}

func (s *AccountOperationService) History(ctx context.Context, payload json.RawMessage) (AccountOperationHistory, error) {
	if err := s.validate("noInput", payload); err != nil {
		return AccountOperationHistory{}, err
	}
	reference, err := s.authority(ctx)
	if err != nil {
		return AccountOperationHistory{}, err
	}
	snapshot, err := s.store.Snapshot(ctx, accountOperationScope(reference.UserID), 1000)
	if err != nil {
		return AccountOperationHistory{}, err
	}
	history := AccountOperationHistory{Cursor: snapshot.Cursor, Truncated: snapshot.Truncated, Items: []AccountOperationOutcome{}}
	for _, operation := range snapshot.Operations {
		if operation.Operation != s.OperationName() {
			continue
		}
		var admitted middleware.AuthReference
		if json.Unmarshal(operation.AuthorizationContext, &admitted) != nil {
			return history, errors.New("invalid account authority receipt")
		}
		if admitted != reference {
			continue
		}
		outcome, err := s.projection(ctx, operation, reference)
		if err != nil {
			return history, err
		}
		history.Items = append(history.Items, outcome)
	}
	return history, nil
}

// Handle is an existing jobs.Worker handler. Only a fenced terminal receipt
// settles the request; database failures remain owned worker retries.
func (s *AccountOperationService) Handle(ctx context.Context, lease *jobs.Lease) error {
	claim := lease.Claim()
	if claim.Operation != s.OperationName() {
		return errors.New("unsupported account operation")
	}
	if ctx.Err() != nil || claim.CancellationRequested {
		return lease.Cancelled(ctx, json.RawMessage(`{"cancelled":true}`))
	}
	var reference middleware.AuthReference
	if err := json.Unmarshal(claim.AuthorizationContext, &reference); err != nil {
		return lease.Fail(ctx, json.RawMessage(`{"error":"invalid authority"}`))
	}
	info, err := s.revalidate(ctx, reference)
	if err != nil {
		if ctx.Err() != nil {
			return lease.Cancelled(ctx, json.RawMessage(`{"cancelled":true}`))
		}
		var refusal *apierrors.APIError
		if !errors.As(err, &refusal) {
			return err
		}
		return lease.Fail(ctx, json.RawMessage(`{"error":"authority changed"}`))
	}
	if err = lease.StartExternal(ctx, json.RawMessage(`{"read":"identity"}`)); err != nil {
		return err
	}
	result, _ := json.Marshal(struct {
		Login string `json:"login"`
	}{info.User.Username})
	if err = s.contract.Validate("identity", result); err != nil {
		return lease.Fail(ctx, json.RawMessage(`{"error":"invalid identity"}`))
	}
	if ctx.Err() != nil {
		return lease.Cancelled(ctx, json.RawMessage(`{"cancelled":true}`))
	}
	return lease.Complete(ctx, result)
}
