package appoperation

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAccountGeneratedContractHasStrictLiteralBoundaries(t *testing.T) {
	contract, err := Account()
	require.NoError(t, err)
	require.Len(t, contract.Operations, 1)
	require.Equal(t, "account.show", contract.Operations[0].Name)
	require.Equal(t, []string{"identity"}, contract.Operations[0].Runtime)
	require.False(t, contract.Operations[0].UserOnly)
	require.JSONEq(t, `null`, string(contract.Operations[0].Confirm))
	for _, input := range []string{`{}`, `{"unknown":1}`, `{"unknown":{"nested":true}}`, `{"":null}`, `{"__proto__":{}}`, `{"constructor":1}`, `[]`, `null`, `""`, `0`, `true`} {
		t.Run(input, func(t *testing.T) {
			err := contract.Validate("noInput", json.RawMessage(input))
			if input == `{}` {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
	require.NoError(t, contract.Validate("invocation", json.RawMessage(`{"name":"account.show","requestId":"request:1","input":{}}`)))
	for _, input := range []string{`{"name":"account.show","requestId":"../escape","input":{}}`, `{"name":"account.show","requestId":"request","input":{},"actor":"user"}`, `{"name":"account.other","requestId":"request","input":{}}`, `{"name":"account.show","requestId":"request","input":{"unknown":1}}`} {
		require.Error(t, contract.Validate("invocation", json.RawMessage(input)))
	}
	for _, outcome := range []string{`{"operationId":"id","requestId":"request","state":"accepted","actor":"api"}`, `{"operationId":"id","requestId":"request","state":"completed","actor":"user","result":{"login":"owner"}}`, `{"operationId":"id","requestId":"request","state":"failed","actor":"agent","error":"Read failed"}`} {
		require.NoError(t, contract.Validate("outcome", json.RawMessage(outcome)))
	}
	for _, outcome := range []string{`{"operationId":"id","requestId":"request","state":"completed","actor":"api"}`, `{"operationId":"id","requestId":"request","state":"accepted","actor":"api","result":{"login":"owner"}}`, `{"operationId":"id","requestId":"request","state":"completed","actor":"api","result":{"login":"owner","token":"private"}}`, `{"operationId":"id","requestId":"request","state":"failed","actor":"agent"}`} {
		require.Error(t, contract.Validate("outcome", json.RawMessage(outcome)))
	}
}
