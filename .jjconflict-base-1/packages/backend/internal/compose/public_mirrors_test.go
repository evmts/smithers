package compose

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/services"
)

func TestSelectPublicMirrors(t *testing.T) {
	mirrors, err := selectPublicMirrors([]string{"smithersai/smithers"}, []string{"jj-vcs/jj", "SmithersAI/Smithers"}, true)
	require.NoError(t, err)
	assert.Equal(t, []services.PublicMirror{{Owner: "smithersai", Repo: "smithers"}, {Owner: "jj-vcs", Repo: "jj"}}, mirrors,
		"the composer's mirrors come first and a repository named twice is one mirror")

	composed := []string{"smithersai/smithers"}
	_, err = selectPublicMirrors(composed[:1:1], []string{"jj-vcs/jj"}, true)
	require.NoError(t, err)
	assert.Equal(t, []string{"smithersai/smithers"}, composed, "the composer's list is not written through")

	none, err := selectPublicMirrors(nil, nil, false)
	require.NoError(t, err)
	assert.Empty(t, none, "an install that names no mirror starts")

	for name, lists := range map[string][2][]string{
		"composed on an install":   {{"smithersai/smithers"}, nil},
		"configured on an install": {nil, {"smithersai/smithers"}},
	} {
		_, err := selectPublicMirrors(lists[0], lists[1], false)
		assert.ErrorContains(t, err, "public mirrors apply to a hosted deployment only", name)
	}

	_, err = selectPublicMirrors([]string{"smithers"}, nil, true)
	assert.ErrorContains(t, err, `public mirror "smithers" must be owner/repo`, "a malformed name stops the start")
}
