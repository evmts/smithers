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
	head      int64
	stalled   bool
}

func newTurnProgress(grant ProducerGrant, logger *slog.Logger) *turnProgress {
	now := time.Now()
	return &turnProgress{logger: logger.With("turn_id", grant.TurnID, "run_id", grant.RunID, "generation", grant.Generation), started: now, changed: now, stage: ports.ChatStageDispatch, head: grant.Cursor.Batch}
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
	p.logger.Info("chat turn awaiting progress", "stage", p.stage, "sandbox_id", p.sandboxID, "head_batch", p.head,
		"stage_elapsed_ms", silence.Milliseconds(), "turn_elapsed_ms", time.Since(p.started).Milliseconds())
	return silence
}

// stall marks the turn as interrupted for making no progress, so the attempt
// fails under its own name instead of an ordinary host error.
func (p *turnProgress) stall(silence time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stalled = true
	p.logger.Error("chat turn interrupted after its host stopped making progress", "stage", p.stage, "sandbox_id", p.sandboxID,
		"head_batch", p.head, "silent_ms", silence.Milliseconds(), "turn_elapsed_ms", time.Since(p.started).Milliseconds())
}

func (p *turnProgress) silent() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.stalled
}
