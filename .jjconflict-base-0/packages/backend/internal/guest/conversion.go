package guest

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
)

// ConversionInput is the one-file request shared by all converter doors.
type ConversionInput struct {
	Input       string `json:"input"`
	Key         string `json:"idempotencyKey"`
	SourceLabel string `json:"sourceLabel"`
}

// Diagnostic is bounded, untrusted compiler text, never HTML or a command.
type Diagnostic struct {
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Receipt binds content and compiler identities to a result and version.
type Receipt struct {
	InputSha           string `json:"inputSha"`
	OutputSha          string `json:"outputSha"`
	CompilerDigest     string `json:"compilerDigest"`
	DependenciesDigest string `json:"dependenciesDigest"`
	Signature          string `json:"signature"`
}

// ConversionResult is persisted before any terminal result is returned.
type ConversionResult struct {
	State         string       `json:"state"`
	Effeck        string       `json:"effeck,omitempty"`
	Diagnostics   []Diagnostic `json:"diagnostics,omitempty"`
	EffeckVersion string       `json:"effeckVersion"`
	Refusal       string       `json:"refusal,omitempty"`
	Receipt       *Receipt     `json:"receipt,omitempty"`
}

// ConversionFlowDeclaration is the executable-free template accepted at main.
// Repositories may supply prompt text, never a different guest action body.
//
//go:embed testdata/convert/flow.ts
var ConversionFlowDeclaration string

type conversionSource interface {
	ReadConversion(context.Context, string, string, string) (string, error)
}

func hashText(s string) string { sum := sha256.Sum256([]byte(s)); return hex.EncodeToString(sum[:]) }

// ReceiptMessage is the public, versioned signature encoding. Each component
// occupies one UTF-8 line, including the final newline. Digests are hex SHA-256.
func ReceiptMessage(result ConversionResult) []byte {
	r := result.Receipt
	if r == nil {
		return nil
	}
	return []byte(strings.Join([]string{"smithers.convert.v1", result.State, result.EffeckVersion, r.InputSha, r.OutputSha, r.CompilerDigest, r.DependenciesDigest, ""}, "\n"))
}
func (h *Handler) signingKey() (ed25519.PrivateKey, error) {
	seed, err := base64.StdEncoding.DecodeString(h.Config.ReceiptSeed)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, errors.New("receipt key unavailable")
	}
	return ed25519.NewKeyFromSeed(seed), nil
}
func (h *Handler) ConversionKey(w http.ResponseWriter, r *http.Request) {
	if _, err := h.repositoryAccess(r, false); err != nil {
		refuse(w, err)
		return
	}
	key, err := h.signingKey()
	if err != nil {
		refuse(w, Refusal("guest_unavailable"))
		return
	}
	writeJSON(w, 200, map[string]string{"algorithm": "Ed25519", "domain": "smithers.convert.v1", "publicKey": base64.StdEncoding.EncodeToString(key.Public().(ed25519.PublicKey))})
}
func validConversionKey(key string) bool {
	if len(key) == 0 || len(key) > 128 {
		return false
	}
	for _, r := range key {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("-_.", r)) {
			return false
		}
	}
	return true
}
func validSourceLabel(label string) bool {
	switch label {
	case "hn", "x", "discord", "telegram", "share", "direct", "other":
		return true
	}
	return false
}

// Convert claims once, then executes the fixed validate/admit/model/compile
// sequence. Client disconnects do not interrupt persistence. An interrupted
// process leaves an expiring claim, never a reason to purchase a second call.
func (h *Handler) Convert(w http.ResponseWriter, r *http.Request) {
	repository, err := h.repositoryAccess(r, false)
	if err != nil {
		conversionRefuse(w, err)
		return
	}
	session, ok := h.session(w, r, repository.ID, false)
	if !ok {
		conversionRefuse(w, Refusal("guest_session_required"))
		return
	}
	var input ConversionInput
	// 8 KiB source may contain JSON escapes, up to six bytes per character.
	rawInput, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, 64*1024))
	if readErr != nil || !validSourceJSON(rawInput) {
		conversionRefuse(w, Refusal("invalid_source"))
		return
	}
	decoder := json.NewDecoder(bytes.NewReader(rawInput))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || !validConversionKey(input.Key) || !validSourceLabel(input.SourceLabel) {
		conversionRefuse(w, Refusal("guest_invalid_request"))
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 60*time.Second)
	defer cancel()
	id := uuid.NewString()
	tag, err := h.DB.Exec(ctx, `INSERT INTO guest_conversions(repository_id,session_hash,request_key,id,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, repository.ID, session, input.Key, id, repository.Revision)
	if err != nil {
		conversionRefuse(w, Refusal("guest_unavailable"))
		return
	}
	if tag.RowsAffected() == 0 {
		h.conversionResult(w, r, repository.ID, session, input.Key)
		return
	}
	log := slog.Default().With("interaction_id", id, "run_id", id, "reservation_id", id, "repository_id", repository.ID, "revision", repository.Revision)
	stage := func(name string, start time.Time, code string) {
		log.Info("guest conversion", "stage", name, "duration_ms", time.Since(start).Milliseconds(), "code", code)
	}
	started := time.Now()
	result := ConversionResult{State: "refused"}
	switch {
	case len(input.Input) > 8192:
		result.Refusal = "too_large"
	case !utf8.ValidString(input.Input) || strings.ContainsRune(input.Input, 0):
		result.Refusal = "invalid_source"
	case !importsEffect(input.Input):
		result.Refusal = "not_effect"
	default:
		stage("validate", started, "")
		result = h.executeConversion(ctx, r, repository, session, id, input, stage)
	}
	stage("result", started, result.Refusal)
	raw, _ := json.Marshal(result)
	persist, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer stop()
	tag, err = h.DB.Exec(persist, `UPDATE guest_conversions SET result=$4 WHERE repository_id=$1 AND session_hash=$2 AND request_key=$3 AND result IS NULL`, repository.ID, session, input.Key, raw)
	if err != nil || tag.RowsAffected() != 1 {
		conversionRefuse(w, Refusal("guest_unavailable"))
		return
	}
	writeJSON(w, 200, result)
}
func conversionRefuse(w http.ResponseWriter, err error) {
	var refusal Refusal
	if !errors.As(err, &refusal) {
		refusal = "guest_unavailable"
	}
	status, _, _ := refusal.ModelRefusal()
	if refusal == "guest_not_allowed" {
		status = 403
	}
	writeJSON(w, status, ConversionResult{State: "refused", Refusal: string(refusal)})
}
func (h *Handler) Conversion(w http.ResponseWriter, r *http.Request) {
	repo, err := h.repositoryAccess(r, false)
	if err != nil {
		conversionRefuse(w, err)
		return
	}
	session, ok := h.session(w, r, repo.ID, false)
	if !ok {
		conversionRefuse(w, Refusal("guest_session_required"))
		return
	}
	h.conversionResult(w, r, repo.ID, session, chi.URLParam(r, "key"))
}
func (h *Handler) conversionResult(w http.ResponseWriter, r *http.Request, repo int64, session, key string) {
	if !validConversionKey(key) {
		http.NotFound(w, r)
		return
	}
	// The execution deadline is 60s plus a 5s persistence allowance. Recovery
	// records an honest failure, retaining any uncertain spend in the shared pool.
	failed, _ := json.Marshal(ConversionResult{State: "failed", Refusal: "conversion_interrupted"})
	_, err := h.DB.Exec(r.Context(), `UPDATE guest_conversions SET result=$4 WHERE repository_id=$1 AND session_hash=$2 AND request_key=$3 AND result IS NULL AND created_at < now()-interval '70 seconds'`, repo, session, key, failed)
	if err != nil {
		conversionRefuse(w, Refusal("guest_unavailable"))
		return
	}
	var raw []byte
	err = h.DB.QueryRow(r.Context(), `SELECT result FROM guest_conversions WHERE repository_id=$1 AND session_hash=$2 AND request_key=$3`, repo, session, key).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		conversionRefuse(w, Refusal("guest_unavailable"))
		return
	}
	if len(raw) == 0 {
		w.Header().Set("Retry-After", "1")
		writeJSON(w, 202, map[string]string{"state": "running"})
		return
	}
	var result ConversionResult
	if json.Unmarshal(raw, &result) != nil {
		conversionRefuse(w, Refusal("guest_unavailable"))
		return
	}
	writeJSON(w, 200, result)
}

func (h *Handler) executeConversion(ctx context.Context, r *http.Request, repo Repository, session, id string, input ConversionInput, stage func(string, time.Time, string)) ConversionResult {
	fail := func(code string) ConversionResult { return ConversionResult{State: "failed", Refusal: code} }
	key, err := h.signingKey()
	if err != nil {
		return fail("conversion_unconfigured")
	}
	endpoint, err := url.Parse(h.Config.CompileEndpoint)
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.User != nil || endpoint.Fragment != "" {
		return fail("conversion_unconfigured")
	}
	source, ok := h.Source.(conversionSource)
	if !ok {
		return fail("conversion_unavailable")
	}
	prompt, err := source.ReadConversion(ctx, chi.URLParam(r, "owner"), chi.URLParam(r, "repo"), repo.Revision)
	if err != nil || prompt == "" || len(prompt) > 24*1024 || !utf8.ValidString(prompt) || strings.ContainsRune(prompt, 0) {
		return fail("conversion_unavailable")
	}
	ipHash, err := h.ipHash(r)
	if err != nil {
		return fail("guest_unavailable")
	}
	spend := &Spend{DB: h.DB, Config: h.Config, ID: id, SessionHash: session, IPHash: ipHash, Key: input.Key, LandingID: uuid.NewSHA1(uuid.NameSpaceOID, []byte(session)).String(), Revision: repo.Revision, RepositoryID: repo.ID, Now: h.Now, ReservationNanos: 100_000_000}
	body, _ := json.Marshal(map[string]any{"model": h.Config.Model, "stream": false, "max_completion_tokens": 4096, "messages": []any{map[string]string{"role": "system", "content": prompt}, map[string]string{"role": "user", "content": input.Input}}})
	request, _ := http.NewRequestWithContext(ctx, "POST", modelproxy.Path+"/"+h.Config.Provider+"/v1/chat/completions", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	// Use the existing proxy and accounting. Bound the provider response before
	// that proxy reads it, and disable redirects even with an injected client.
	client := boundedClient(h.Client, 128*1024)
	proxy := &modelproxy.Handler{OwnerPaid: true, Owner: spend, Keys: h.Keys, Upstreams: h.Upstreams, Client: client, CancelWithCaller: true, Callers: caller{OwnerType: "user", OwnerID: h.Config.SponsorID, RepositoryID: repo.ID, Source: "guest", Reference: id}}
	response := newResponseBuffer()
	start := time.Now()
	proxy.ServeHTTP(response, request)
	stage("model", start, "")
	if response.Code != 200 {
		var envelope struct {
			Error struct {
				Code string `json:"type"`
			} `json:"error"`
		}
		_ = json.Unmarshal(response.Body.Bytes(), &envelope)
		if strings.HasPrefix(envelope.Error.Code, "guest_") {
			return ConversionResult{State: "refused", Refusal: envelope.Error.Code}
		}
		return fail("model_failed")
	}
	var answer struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Finish string `json:"finish_reason"`
		} `json:"choices"`
	}
	if json.Unmarshal(response.Body.Bytes(), &answer) != nil || len(answer.Choices) != 1 || answer.Choices[0].Finish != "stop" {
		return fail("model_output_invalid")
	}
	code, ok := fencedCode(answer.Choices[0].Message.Content)
	if !ok {
		return fail("model_output_invalid")
	}
	compileCtx, stopGuard := watchSuspension(ctx, h.DB)
	defer stopGuard()
	disabled, checkErr := Suspended(compileCtx, h.DB)
	if checkErr != nil || disabled || h.Config.Disabled {
		return fail("guest_disabled")
	}
	start = time.Now()
	result := h.compile(compileCtx, endpoint.String(), code)
	stage("compile", start, result.Refusal)
	if result.State != "compiled" && result.State != "diagnostics" {
		return result
	}
	result.Receipt.InputSha = hashText(input.Input)
	result.Receipt.OutputSha = hashText(code)
	result.Receipt.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key, ReceiptMessage(result)))
	return result
}
func fencedCode(text string) (string, bool) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "```") || !strings.HasSuffix(text, "```") || strings.Count(text, "```") != 2 {
		return "", false
	}
	newline := strings.IndexByte(text, '\n')
	if newline < 3 {
		return "", false
	}
	language := strings.TrimSpace(text[3:newline])
	if language != "" && language != "effeck" && language != "ts" && language != "typescript" {
		return "", false
	}
	code := strings.TrimSuffix(text[newline+1:len(text)-3], "\n")
	return code, code != "" && len(code) <= 32*1024 && utf8.ValidString(code) && !strings.ContainsRune(code, 0)
}

// boundedClient limits untrusted output before any downstream decoder or proxy
// can buffer it. It preserves the host transport, but never follows redirects.
func boundedClient(client *http.Client, limit int64) *http.Client {
	c := http.Client{}
	if client != nil {
		c = *client
	}
	transport := c.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	c.Transport = boundTransport{transport, limit}
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &c
}

type boundTransport struct {
	base  http.RoundTripper
	limit int64
}

func (t boundTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(r)
	if err != nil {
		return nil, err
	}
	response.Body = &boundBody{ReadCloser: response.Body, remaining: t.limit}
	return response, nil
}

type boundBody struct {
	io.ReadCloser
	remaining int64
}

func (b *boundBody) Read(p []byte) (int, error) {
	if b.remaining < 0 {
		return 0, errors.New("response_limit")
	}
	if int64(len(p)) > b.remaining+1 {
		p = p[:b.remaining+1]
	}
	n, err := b.ReadCloser.Read(p)
	b.remaining -= int64(n)
	if b.remaining < 0 {
		return n, errors.New("response_limit")
	}
	return n, err
}
func (h *Handler) compile(ctx context.Context, endpoint, code string) ConversionResult {
	failed := func(code string) ConversionResult { return ConversionResult{State: "failed", Refusal: code} }
	timeout := 15 * time.Second
	if h.CompileTimeout > 0 && h.CompileTimeout < timeout {
		timeout = h.CompileTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	body, _ := json.Marshal(map[string]string{"code": code})
	request, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response, err := boundedClient(h.Client, 64*1024).Do(request)
	if err != nil {
		return failed("compile_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return failed("compile_unavailable")
	}
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return failed("compile_response_invalid")
	}
	var reply struct {
		ExitCode           *int         `json:"exitCode"`
		Diagnostics        []Diagnostic `json:"diagnostics"`
		EffeckVersion      string       `json:"effeckVersion"`
		CompilerDigest     string       `json:"compilerDigest"`
		DependenciesDigest string       `json:"dependenciesDigest"`
	}
	if json.Unmarshal(raw, &reply) != nil || reply.ExitCode == nil || *reply.ExitCode < 0 || *reply.ExitCode > 255 || len(reply.Diagnostics) > 100 || !validVersion(reply.EffeckVersion) || !validDigest(reply.CompilerDigest) || !validDigest(reply.DependenciesDigest) {
		return failed("compile_response_invalid")
	}
	for _, d := range reply.Diagnostics {
		if d.Line < 0 || d.Column < 0 || len(d.Code) > 64 || len(d.Message) > 2048 || !utf8.ValidString(d.Message) || strings.ContainsAny(d.Message, "\x00\x1b") {
			return failed("compile_response_invalid")
		}
	}
	state := "diagnostics"
	if *reply.ExitCode == 0 {
		state = "compiled"
	}
	return ConversionResult{State: state, Effeck: code, Diagnostics: reply.Diagnostics, EffeckVersion: reply.EffeckVersion, Receipt: &Receipt{CompilerDigest: reply.CompilerDigest, DependenciesDigest: reply.DependenciesDigest}}
}
func validDigest(value string) bool {
	value = strings.TrimPrefix(value, "sha256:")
	b, err := hex.DecodeString(value)
	return err == nil && len(b) == 32 && value == strings.ToLower(value)
}
func validVersion(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || strings.ContainsRune(".-+_", r)) {
			return false
		}
	}
	return true
}
