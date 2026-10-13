package chat

import (
	"log/slog"
	"sync"
	"time"

	"github.com/smithersai/smithers/packages/backend/ports"
)

// turnProgress joins host stages with the durable producer identity. Renewals
// report the last stage even when a host is blocked and emits no frames.
type turnProgress struct {
	mu        sync.Mutex
	logger    *slog.Logger
	started   time.Time
	changed   time.Time
	stage     ports.ChatStage
	sandboxID string
}

func newTurnProgress(grant ProducerGrant, logger *slog.Logger) *turnProgress {
	now := time.Now()
	return &turnProgress{logger: logger.With("turn_id", grant.TurnID, "run_id", grant.RunID, "generation", grant.Generation), started: now, changed: now, stage: ports.ChatStageDispatch}
}

func (p *turnProgress) observe(event ports.ChatProgress) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stage, p.changed = event.Stage, time.Now()
	if event.SandboxID != "" {
		p.sandboxID = event.SandboxID
	}
	p.logger.Info("chat turn progress", "stage", p.stage, "sandbox_id", p.sandboxID, "turn_elapsed_ms", time.Since(p.started).Milliseconds())
}

func (p *turnProgress) waiting() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.logger.Info("chat turn awaiting progress", "stage", p.stage, "sandbox_id", p.sandboxID, "stage_elapsed_ms", time.Since(p.changed).Milliseconds(), "turn_elapsed_ms", time.Since(p.started).Milliseconds())
}
