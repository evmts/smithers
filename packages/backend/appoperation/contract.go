// Package appoperation projects shared Control operation contracts into product hosts.
package appoperation

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed account.generated.json
var accountContract []byte

type Declaration struct {
	Requires       []string        `json:"requires,omitempty"`
	RuntimeAny     []string        `json:"runtimeAny,omitempty"`
	Hosts          []string        `json:"hosts,omitempty"`
	UserOnlyReason string          `json:"userOnlyReason,omitempty"`
	Form           json.RawMessage `json:"form,omitempty"`
	Name           string          `json:"name"`
	Summary        string          `json:"summary"`
	Runtime        []string        `json:"runtime"`
	Input          json.RawMessage `json:"input"`
	UserOnly       bool            `json:"userOnly"`
	Confirm        json.RawMessage `json:"confirm"`
}

type Contract struct {
	Version    int                        `json:"version"`
	Operations []Declaration              `json:"operations"`
	Schemas    map[string]json.RawMessage `json:"schemas"`
	validators map[string]*jsonschema.Schema
}

// Account loads only the generated projection of Control.Account.
func Account() (*Contract, error) {
	var document struct {
		Version    int                        `json:"version"`
		Operations []Declaration              `json:"operations"`
		Schemas    map[string]json.RawMessage `json:"schemas"`
	}
	if err := json.Unmarshal(accountContract, &document); err != nil {
		return nil, err
	}
	if document.Version != 1 || len(document.Operations) != 1 {
		return nil, fmt.Errorf("invalid Account contract")
	}
	c := &Contract{Version: document.Version, Operations: document.Operations, Schemas: document.Schemas, validators: map[string]*jsonschema.Schema{}}
	for name, raw := range document.Schemas {
		value, err := decode(raw)
		if err != nil {
			return nil, err
		}
		compiler := jsonschema.NewCompiler()
		uri := "https://smithers.invalid/account/" + name
		if err = compiler.AddResource(uri, value); err != nil {
			return nil, err
		}
		compiled, err := compiler.Compile(uri)
		if err != nil {
			return nil, err
		}
		c.validators[name] = compiled
	}
	return c, nil
}

func decode(raw json.RawMessage) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var tail any
	if err := decoder.Decode(&tail); err != io.EOF {
		return nil, fmt.Errorf("exactly one JSON value required")
	}
	return value, nil
}

// Validate enforces the generated schema, including refusal of unknown input properties.
func (c *Contract) Validate(name string, raw json.RawMessage) error {
	validator, ok := c.validators[name]
	if !ok {
		return fmt.Errorf("unknown Account schema")
	}
	value, err := decode(raw)
	if err != nil {
		return err
	}
	return validator.Validate(value)
}
