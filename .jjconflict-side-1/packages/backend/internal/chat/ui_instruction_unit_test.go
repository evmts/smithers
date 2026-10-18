package chat

import (
	"encoding/json"
	"os"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// catalogRow is the part of a generated catalog operation these checks read.
type catalogRow struct {
	Name       string          `json:"name"`
	Actors     []string        `json:"actors"`
	Agent      string          `json:"agent"`
	Visibility string          `json:"visibility"`
	HTTP       json.RawMessage `json:"http"`
	CLI        json.RawMessage `json:"cli"`
	Payload    struct {
		Schema struct {
			Properties map[string]json.RawMessage `json:"properties"`
			AnyOf      []struct {
				Properties map[string]json.RawMessage `json:"properties"`
			} `json:"anyOf"`
			OneOf []struct {
				Properties map[string]json.RawMessage `json:"properties"`
			} `json:"oneOf"`
		} `json:"schema"`
	} `json:"payload"`
}

// Each UI instruction is a screen-only catalog row: the app agent runs it,
// no external agent can, and it has no HTTP door or CLI path. The fields it
// carries are exactly the ones the row declares.
func TestUIInstructionsMatchScreenOnlyCatalogRows(t *testing.T) {
	raw, err := os.ReadFile("../../../smithers/src/internal/backend/catalog.mvp.json")
	require.NoError(t, err)
	var catalog struct {
		Operations []catalogRow `json:"operations"`
	}
	require.NoError(t, json.Unmarshal(raw, &catalog))
	for command, declared := range uiInstructionFields {
		index := slices.IndexFunc(catalog.Operations, func(row catalogRow) bool { return row.Name == command })
		require.NotEqual(t, -1, index, command)
		row := catalog.Operations[index]
		require.True(t, slices.Contains(row.Actors, "app_agent"), command)
		require.False(t, slices.Contains(row.Actors, "external_agent"), command)
		require.Equal(t, []any{"run", "null", "null", false}, []any{row.Agent, string(row.HTTP), string(row.CLI), row.Visibility == "hidden"}, command)
		fields := []string{}
		for field := range row.Payload.Schema.Properties {
			fields = append(fields, field)
		}
		want := slices.Clone(declared)
		sort.Strings(fields)
		sort.Strings(want)
		require.Equal(t, want, fields, command)
		require.NotContains(t, declared, "command", command)
	}
}

// A form request belongs to an agent-invocable catalog row, but only fills
// the form its author submits. No row is in both tables.
func TestFormInstructionsMatchAgentConfirmedCatalogRows(t *testing.T) {
	raw, err := os.ReadFile("../../../smithers/src/internal/backend/catalog.mvp.json")
	require.NoError(t, err)
	var catalog struct {
		Operations []catalogRow `json:"operations"`
	}
	require.NoError(t, json.Unmarshal(raw, &catalog))
	require.Contains(t, formInstructionFields, "flow.edit")
	for command, declared := range formInstructionFields {
		index := slices.IndexFunc(catalog.Operations, func(row catalogRow) bool { return row.Name == command })
		require.NotEqual(t, -1, index, command)
		row := catalog.Operations[index]
		require.True(t, slices.Contains(row.Actors, "app_agent"), command)
		require.Contains(t, []string{"run", "confirm"}, row.Agent, command)
		require.NotEqual(t, "hidden", row.Visibility, command)
		fields := []string{}
		for field := range row.Payload.Schema.Properties {
			fields = append(fields, field)
		}
		for _, variant := range append(row.Payload.Schema.AnyOf, row.Payload.Schema.OneOf...) {
			for field := range variant.Properties {
				fields = append(fields, field)
			}
		}
		want := slices.Clone(declared)
		sort.Strings(fields)
		sort.Strings(want)
		for _, field := range want {
			require.Contains(t, fields, field, command)
		}
		require.NotContains(t, declared, "command", command)
		require.NotContains(t, uiInstructionFields, command)
	}
}

// A request for a form carries text for the fields the form declares, each
// optional, under the settled call's own command. Anything else is refused at
// commit, so no other value can reach a browser.
func TestFormUIInstructionCarriesOnlyDeclaredText(t *testing.T) {
	for _, item := range []struct {
		name, ui string
		want     bool
	}{
		{"flow.new", `{"command":"flow.new"}`, true},
		{"flow.new", `{"command":"flow.new","description":"label new issues by area"}`, true},
		{"flow.new", `{"command":"flow.new","repo":"acme/app"}`, true},
		{"flow.new", `{"command":"flow.new","description":"label new issues by area","repo":"acme/app"}`, true},
		{"flow.new", `{"command":"flow.new","name":"label-issues"}`, false},
		{"flow.new", `{"command":"flow.new","description":"label new issues","confirmed":"true"}`, false},
		{"flow.new", `{"command":"flow.new","description":7}`, false},
		{"flow.new", `{"command":"flow.new","description":true}`, false},
		{"flow.new", `{"command":"flow.new","description":null}`, false},
		{"flow.new", `{"command":"flow.new","description":{"text":"label new issues"}}`, false},
		{"flow.new", `{"command":"flow.new","description":"label new issues","repo":7}`, false},
		{"flow.new", `{"description":"label new issues"}`, false},
		{"flow.new", `"flow.new"`, false},
		// The request is the settled call's own: another command's name cannot carry it.
		{"docs", `{"command":"flow.new","description":"label new issues"}`, false},
		{"flow.run", `{"command":"flow.run","name":"create-flow"}`, true},
		{"form.submit", `{"command":"form.submit","cardId":"form-flow.new"}`, false},
	} {
		var frame map[string]any
		decoder := json.NewDecoder(strings.NewReader(`{"name":"` + item.name + `","ui":` + item.ui + `}`))
		decoder.UseNumber()
		require.NoError(t, decoder.Decode(&frame))
		require.Equal(t, item.want, validUIInstruction(frame), item.ui)
	}
}

// The view state serves each committed request as its command and payload.
func TestUIInstructionDecodeSplitsCommandFromPayload(t *testing.T) {
	instruction, err := decodeUIInstruction("turn:1:2", json.RawMessage(`{"command":"runs.trace.select","runId":"run-1","seq":4}`))
	require.NoError(t, err)
	encoded, err := json.Marshal(instruction)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"turn:1:2","command":"runs.trace.select","payload":{"runId":"run-1","seq":4}}`, string(encoded))
	instruction, err = decodeUIInstruction("turn:1:3", json.RawMessage(`{"command":"help"}`))
	require.NoError(t, err)
	encoded, err = json.Marshal(instruction)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"turn:1:3","command":"help","payload":{}}`, string(encoded))
	for _, raw := range []string{`null`, `[]`, `{"mode":"dark"}`, `{"command":""}`, `{"command":1}`} {
		_, err = decodeUIInstruction("turn:1:4", json.RawMessage(raw))
		require.ErrorIs(t, err, ErrCorrupt, raw)
	}
}

func TestMonitorUIInstructionRefusesUndeclaredState(t *testing.T) {
	for _, state := range []string{`{}`, `null`, `{"selected":"cell-1","at":0,"tab":"journal"}`, `{"selected":null,"at":null,"tab":null}`, `"cell"`, `{"at":-1}`, `{"at":0.5}`, `{"tab":"owner"}`, `{"selected":{}}`, `{"shared":true}`, `{"at":1e0}`, `{"at":3.0}`, `{"at":1e309}`} {
		var frame map[string]any
		decoder := json.NewDecoder(strings.NewReader(`{"name":"runs.trace.view","ui":{"command":"runs.trace.view","runId":"run-9","view":"turns","state":` + state + `}}`))
		decoder.UseNumber()
		require.NoError(t, decoder.Decode(&frame))
		want := state == `{"at":1e0}` || state == `{"at":3.0}` || state == `{}` || state == `null` || state == `{"selected":"cell-1","at":0,"tab":"journal"}` || state == `{"selected":null,"at":null,"tab":null}`
		require.Equal(t, want, validUIInstruction(frame), state)
	}
}

func TestEveryCatalogFormInstructionIsDraftOnly(t *testing.T) {
	for command, fields := range formInstructionFields {
		t.Run(command, func(t *testing.T) {
			ui := map[string]any{"command": command}
			frame := map[string]any{"name": command, "ui": ui}
			require.True(t, validUIInstruction(frame))
			for _, field := range fields {
				ui[field] = "draft"
				require.True(t, validUIInstruction(frame), field)
				ui[field] = true
				require.False(t, validUIInstruction(frame), field)
				delete(ui, field)
			}
			ui["confirmed"] = "true"
			require.False(t, validUIInstruction(frame))
		})
	}
}
