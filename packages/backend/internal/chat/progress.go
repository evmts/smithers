package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/ports"
)

// ProgressRecord is public execution metadata. It carries no request content,
// provider output, connection address or capability.
type ProgressRecord struct {
	Stage         string `json:"stage"`
	At            int64  `json:"at"`
	RequestID     string `json:"requestId"`
	TurnID        string `json:"turnId"`
	RunID         string `json:"runId"`
	Generation    int64  `json:"generation"`
	Code          string `json:"code,omitempty"`
	SandboxID     string `json:"sandboxId,omitempty"`
	MachineID     string `json:"machineId,omitempty"`
	ReservationID string `json:"reservationId,omitempty"`
}

// recordProgress fences metadata with the same producer as the model journal,
// without consuming that journal's cursor. Notifications commit with the stage.
func (s *Store) recordProgress(ctx context.Context, grant ProducerGrant, record ProgressRecord) error {
	switch record.Stage {
	case "allocating", "cloning", "model", "verifying", "refused":
	default:
		return ErrInvalidRequest
	}
	record.RequestID, record.TurnID, record.RunID, record.Generation = grant.LegID, grant.TurnID, grant.RunID, grant.Generation
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	record.At = s.now().UnixMilli()
	raw, err := json.Marshal([]ProgressRecord{record})
	if err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `UPDATE chat_turns SET progress=progress || $4::jsonb
		WHERE id=$1 AND producer_generation=$2 AND producer_token_hash=$3 AND NOT terminal AND producer_lease_expires_at>$5`, grant.TurnID, grant.Generation, hashToken(grant.Token), raw, s.now().UTC())
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrProducerFenced
	}
	if err = notifyTx(ctx, tx, grant.TurnID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// recordVerification commits the stage reached by a verified terminal batch
// with that batch. It retains allocation ids only from the same producer.
func recordVerification(ctx context.Context, tx pgx.Tx, turn turnRecord, now time.Time) error {
	record := ProgressRecord{Stage: "verifying", At: now.UnixMilli(), RequestID: turn.LegID, TurnID: turn.ID, RunID: turn.RunID, Generation: turn.ProducerGeneration}
	raw, err := json.Marshal(record)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE chat_turns SET progress=progress || jsonb_build_array(
   (CASE WHEN progress->-1->>'generation'=$2 THEN progress->-1 ELSE '{}'::jsonb END - 'code') || $3::jsonb)
   WHERE id=$1 AND (progress->-1->>'stage' IS DISTINCT FROM 'verifying' OR progress->-1->>'generation' IS DISTINCT FROM $2)`, turn.ID, fmt.Sprint(turn.ProducerGeneration), raw)
	return err
}

// turnProgress joins host stages with the durable producer identity. Renewals
// report the last stage even when a host is blocked and emits no frames.
type turnProgress struct {
	mu            sync.Mutex
	logger        *slog.Logger
	started       time.Time
	changed       time.Time
	stage         ports.ChatStage
	sandboxID     string
	machineID     string
	reservationID string
	route         string
	head          int64
	stalled       bool
	grant         ProducerGrant
	public        ProgressRecord
	record        func(ProgressRecord)
}

func newTurnProgress(grant ProducerGrant, logger *slog.Logger) *turnProgress {
	now := time.Now()
	return &turnProgress{grant: grant, logger: logger.With("request_id", grant.LegID, "turn_id", grant.TurnID, "run_id", grant.RunID, "generation", grant.Generation), started: now, changed: now, stage: ports.ChatStageDispatch, head: grant.Cursor.Batch}
}

func (p *turnProgress) observe(event ports.ChatProgress) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stage, p.changed = event.Stage, time.Now()
	if event.SandboxID != "" {
		p.sandboxID = event.SandboxID
	}
	if event.Route != "" {
		p.route = event.Route
	}
	stage := ""
	switch event.Stage {
	case ports.ChatStageDispatch, ports.ChatStageCredential, ports.ChatStageSource, ports.ChatStageInstructions, ports.ChatStageModel, ports.ChatStageSandboxCreate:
		stage = "allocating"
	case ports.ChatStageSandboxCreated, ports.ChatStageService, ports.ChatStageHealth:
		stage = p.public.Stage
		if stage == "" {
			stage = "allocating"
		}
	case ports.ChatStageCloning:
		stage = "cloning"
	case ports.ChatStageHostRequest, ports.ChatStageHostResponse, ports.ChatStageHostBody:
		stage = "model"
	case ports.ChatStageVerifying:
		stage = "verifying"
	}
	if event.MachineID != "" {
		p.machineID = event.MachineID
	}
	if event.ReservationID != "" {
		p.reservationID = event.ReservationID
	}
	if stage == "" && (event.SandboxID != "" || event.MachineID != "" || event.ReservationID != "") {
		stage = p.public.Stage
	}
	if stage != "" {
		p.publish(stage, "")
	}
	p.logger.Info("chat turn progress", "stage", p.stage, "sandbox_id", p.sandboxID, "machine_id", p.public.MachineID, "reservation_id", p.public.ReservationID, "model_route", p.route, "turn_elapsed_ms", time.Since(p.started).Milliseconds())
}

func (p *turnProgress) publish(stage, code string) {
	next := ProgressRecord{Stage: stage, RequestID: p.grant.LegID, TurnID: p.grant.TurnID, RunID: p.grant.RunID, Generation: p.grant.Generation,
		Code: code, SandboxID: p.sandboxID, MachineID: p.machineID, ReservationID: p.reservationID}
	if next == p.public {
		return
	}
	p.public = next
	if p.record != nil {
		p.record(next)
	}
}

func (p *turnProgress) refused(code string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.publish("refused", code)
	p.logger.Info("chat turn progress", "stage", "refused", "code", code, "sandbox_id", p.sandboxID, "machine_id", p.public.MachineID, "reservation_id", p.public.ReservationID)
}

// waiting records the journal head one renewal read, logs the turn's current
// stage, and reports how long the turn has shown no progress at all: neither a
// new host stage nor a new committed batch.
func (p *turnProgress) waiting(head int64) time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	if head > p.head {
		p.head, p.changed = head, time.Now()
	}
	silence := time.Since(p.changed)
	p.logger.Info("chat turn awaiting progress", "stage", p.stage, "sandbox_id", p.sandboxID, "machine_id", p.machineID, "reservation_id", p.reservationID, "model_route", p.route, "head_batch", p.head,
		"stage_elapsed_ms", silence.Milliseconds(), "turn_elapsed_ms", time.Since(p.started).Milliseconds())
	return silence
}

// stall marks the turn as interrupted for making no progress, so the attempt
// fails under its own name instead of an ordinary host error.
func (p *turnProgress) stall(silence time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stalled = true
	p.logger.Error("chat turn interrupted after its host stopped making progress", "stage", p.stage, "sandbox_id", p.sandboxID, "machine_id", p.machineID, "reservation_id", p.reservationID,
		"model_route", p.route, "head_batch", p.head, "silent_ms", silence.Milliseconds(), "turn_elapsed_ms", time.Since(p.started).Milliseconds())
}

func (p *turnProgress) silent() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.stalled
}
