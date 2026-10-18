package compose

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

// Launch gate item 13 (Security d-aso4h5, PM d-20prd2): on hosted, adding a
// person to an organization is refused before the handler runs, typed and not
// retryable; a self-hosted install still adds members.
func TestOrgMemberAddIsClosedOnHosted(t *testing.T) {
	added := 0
	add := func(w http.ResponseWriter, _ *http.Request) { added++; w.WriteHeader(http.StatusCreated) }

	hosted := httptest.NewRecorder()
	orgMemberAdd(add, true)(hosted, httptest.NewRequest(http.MethodPost, "/api/orgs/acme/members", nil))
	require.Equal(t, http.StatusServiceUnavailable, hosted.Code)
	require.Zero(t, added, "the member is never added")
	var refusal map[string]any
	require.NoError(t, json.Unmarshal(hosted.Body.Bytes(), &refusal))
	require.Equal(t, "org_members_unavailable", refusal["code"])
	require.Equal(t, "Adding people to an organization isn't open on smithers.sh yet.", refusal["message"])

	install := httptest.NewRecorder()
	orgMemberAdd(add, false)(install, httptest.NewRequest(http.MethodPost, "/api/orgs/acme/members", nil))
	require.Equal(t, http.StatusCreated, install.Code)
	require.Equal(t, 1, added)
}
