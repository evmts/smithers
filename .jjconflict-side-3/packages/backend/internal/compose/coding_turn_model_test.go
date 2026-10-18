package compose

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

// The session's metadata.model is the model the coding host runs the turn
// on, chosen as ConfigureFlowHost chooses it: the catalog's pin first, then
// the install's coding seat, and nothing when neither names one.
func TestCodingTurnModelFollowsTheHostsChoice(t *testing.T) {
	seat := func(context.Context) (string, error) { return "anthropic:claude-opus-5-5", nil }
	broken := func(context.Context) (string, error) { return "", errors.New("settings unavailable") }

	model, err := codingTurnModel(" cerebras:qwen-3.8-27b ", seat)(context.Background())
	require.NoError(t, err)
	require.Equal(t, "cerebras:qwen-3.8-27b", model, "a hosted catalog pin wins")

	model, err = codingTurnModel("", seat)(context.Background())
	require.NoError(t, err)
	require.Equal(t, "anthropic:claude-opus-5-5", model, "an install runs its coding seat")

	model, err = codingTurnModel("", nil)(context.Background())
	require.NoError(t, err)
	require.Empty(t, model, "nothing names a model, so none is recorded")

	_, err = codingTurnModel("", broken)(context.Background())
	require.Error(t, err)
}
