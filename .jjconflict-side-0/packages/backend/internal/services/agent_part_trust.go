package services

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

type agentPartWriter interface {
	CreateAgentPart(context.Context, db.CreateAgentPartParams) (db.AgentPart, error)
}

// createUntrustedAgentPart is the common persistence boundary for model,
// runner, public message, copy and import parts. Only completeCodingTurn may
// bypass it to write coding_result with the server producer marker.
func createUntrustedAgentPart(ctx context.Context, writer agentPartWriter, part db.CreateAgentPartParams) (db.AgentPart, error) {
	if part.PartType == "coding_result" {
		return db.AgentPart{}, pkgerrors.BadRequest("coding_result is server-only")
	}
	return writer.CreateAgentPart(ctx, part)
}
