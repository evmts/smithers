package services

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// plue#839. On 2026-10-18 every lane workspace failed at the advertisement
// step with exit_class=fatal, attempts=1. The cause was the per-sandbox
// egress proxy answering CONNECT with 429 because the payer's daily egress
// was spent, and no central record said so. These tests run a real `git
// ls-remote` through a local one-file proxy that answers the way plue's
// worker proxy does, so the stderr the classifier reads is curl's own bytes
// and not a fixture's guess at them.

// egressRefusalProxy is the one-file proxy. It answers each connection with
// the next status in statuses (the last one repeats) using the worker proxy's
// refusal bytes, and counts the connections it answered.
type egressRefusalProxy struct {
	mu       sync.Mutex
	statuses []int
	connects int
	url      string
}

func startEgressRefusalProxy(t *testing.T, statuses ...int) *egressRefusalProxy {
	t.Helper()
	require.NotEmpty(t, statuses)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	proxy := &egressRefusalProxy{statuses: statuses, url: "http://" + listener.Addr().String()}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go proxy.refuse(conn)
		}
	}()
	return proxy
}

func (p *egressRefusalProxy) refuse(conn net.Conn) {
	defer conn.Close()
	request, err := http.ReadRequest(bufio.NewReader(conn))
	if err != nil {
		return
	}
	_ = request.Body.Close()
	p.mu.Lock()
	status := p.statuses[0]
	if len(p.statuses) > 1 {
		p.statuses = p.statuses[1:]
	}
	p.connects++
	p.mu.Unlock()
	_, _ = conn.Write(workerEgressRefusal(status))
}

func (p *egressRefusalProxy) connections() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.connects
}

// workerEgressRefusal is plue's worker proxy refusal
// (internal/microsandbox/worker/egress_meter.go egressQuotaRefusal and
// egressRefusal), byte for byte apart from the status line.
func workerEgressRefusal(status int) []byte {
	body := "egress quota exhausted for today (UTC)\n"
	retryAfter := ""
	switch status {
	case http.StatusServiceUnavailable:
		body, retryAfter = "egress metering unavailable\n", "Retry-After: 1\r\n"
	case http.StatusForbidden:
		body = "egress not granted\n"
	}
	return []byte("HTTP/1.1 " + strconv.Itoa(status) + " " + http.StatusText(status) + "\r\n" + retryAfter +
		"Content-Type: text/plain; charset=utf-8\r\nContent-Length: " + strconv.Itoa(len(body)) +
		"\r\nConnection: close\r\n\r\n" + body)
}

// realGitRuntime executes repository commands with the host's real git, the
// way a guest does: an empty home, no prompt, and every connection through
// the egress proxy.
type realGitRuntime struct {
	workspaceapi.WorkspaceRuntime
	proxy string
	home  string
}

func (r *realGitRuntime) ExecuteCommand(ctx context.Context, _ string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	cmd := exec.CommandContext(ctx, command.Args[0], command.Args[1:]...)
	cmd.Dir = r.home
	cmd.Env = []string{
		"PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
		"HOME=" + r.home,
		"GIT_TERMINAL_PROMPT=0",
		"GIT_CONFIG_NOSYSTEM=1",
	}
	if r.proxy != "" {
		cmd.Env = append(cmd.Env, "HTTPS_PROXY="+r.proxy, "https_proxy="+r.proxy)
	}
	for key, value := range command.Environment {
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if err != nil && !errors.As(err, &exit) {
		return workspaceapi.CommandResult{}, err
	}
	return workspaceapi.CommandResult{ExitCode: cmd.ProcessState.ExitCode(), Stdout: stdout.String(), Stderr: stderr.String()}, nil
}

const egressRefusalCloneURL = "https://smithers.invalid/alice/demo.git"

func advertiseThroughProxy(t *testing.T, proxyURL string) (*[]capturedLog, error) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git is required: %v", err)
	}
	records := captureReconcilerLogs(t)
	svc := &WorkspaceService{runtime: &realGitRuntime{proxy: proxyURL, home: t.TempDir()}}
	row := sampleDBWorkspace("ws-egress-refusal")
	_, err := svc.runtimeRepositorySourceEmpty(context.Background(), row, row.UserID, egressRefusalCloneURL, map[string]string{
		"GIT_CONFIG_COUNT":   "1",
		"GIT_CONFIG_KEY_0":   "http.extraHeader",
		"GIT_CONFIG_VALUE_0": "Authorization: Bearer sk-live-c0ffee-DO-NOT-LOG",
	})
	return records, err
}

func requireStepOutcome(t *testing.T, err error) (*pkgerrors.APIError, workspaceRepositoryStepOutcome) {
	t.Helper()
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	cause, ok := api.Cause().(workspaceRepositoryStepOutcome)
	require.True(t, ok, "the refusal carries its finite outcome")
	return api, cause
}

func requireUnverifiedLog(t *testing.T, records *[]capturedLog) capturedLog {
	t.Helper()
	logged := warnings(records, "workspace repository step could not be verified")
	require.Len(t, logged, 1)
	for _, secret := range []string{"sk-live-c0ffee", "Bearer", "smithers.invalid", "alice/demo", "fatal:", "CONNECT tunnel"} {
		require.NotContainsf(t, logged[0].text, secret, "the diagnostic leaked %q", secret)
	}
	return logged[0]
}

// A spent quota is an exhausted quota, not an advertisement that could not be
// verified, and it is not retried: the next attempt cannot pass before 00:00
// UTC.
func TestWorkspaceRepositoryAdvertisementThroughQuotaRefusingProxy(t *testing.T) {
	proxy := startEgressRefusalProxy(t, http.StatusTooManyRequests)
	records, err := advertiseThroughProxy(t, proxy.url)

	api, cause := requireStepOutcome(t, err)
	require.Equal(t, pkgerrors.CodeQuotaExceeded, api.Code)
	require.Equal(t, workspaceEgressQuotaExhaustedMessage, api.Message)
	require.Equal(t, workspaceRepositoryExitEgressQuota, cause.exitClass)
	require.Equal(t, workspaceProxyStatusQuota, cause.proxyStatus)
	require.Equal(t, 1, cause.attempts)
	require.Equal(t, 1, proxy.connections(), "an exhausted quota is not retried")

	logged := requireUnverifiedLog(t, records)
	require.Equal(t, "429", logged.attrs["proxy_status"])
	require.Equal(t, "egress_quota_exhausted", logged.attrs["exit_class"])
	require.Equal(t, "false", logged.attrs["retry_budget_exhausted"])
}

// A ledger outage is the proxy's 503 with Retry-After: 1. It is retried, and
// the retry reads the next answer on its own merits.
func TestWorkspaceRepositoryAdvertisementRetriesAnUnavailableEgressProxy(t *testing.T) {
	proxy := startEgressRefusalProxy(t, http.StatusServiceUnavailable, http.StatusTooManyRequests)
	records, err := advertiseThroughProxy(t, proxy.url)

	api, cause := requireStepOutcome(t, err)
	require.Equal(t, pkgerrors.CodeQuotaExceeded, api.Code)
	require.Equal(t, workspaceProxyStatusQuota, cause.proxyStatus)
	require.Equal(t, 2, cause.attempts)
	require.Equal(t, 2, proxy.connections(), "the 503 was retried once, then the 429 stopped it")
	require.Equal(t, "429", requireUnverifiedLog(t, records).attrs["proxy_status"])
}

// When the outage outlasts the retry budget the stored verdict stays the
// registered advertisement sentence, so the retained-guest stop door still
// reaches the row, and the record names the proxy as the cause.
func TestWorkspaceRepositoryAdvertisementReportsAnEgressProxyOutage(t *testing.T) {
	proxy := startEgressRefusalProxy(t, http.StatusServiceUnavailable)
	records, err := advertiseThroughProxy(t, proxy.url)

	api, cause := requireStepOutcome(t, err)
	require.Equal(t, pkgerrors.CodeConflict, api.Code)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, api.Message)
	require.Equal(t, workspaceRepositoryExitEgressUnavailable, cause.exitClass)
	require.Equal(t, workspaceProxyStatusUnavailable, cause.proxyStatus)
	require.True(t, cause.retryable)
	require.Equal(t, 4, cause.attempts)
	require.Equal(t, 4, proxy.connections())
	require.Contains(t, cause.Error(), "proxy_status=503")

	logged := requireUnverifiedLog(t, records)
	require.Equal(t, "503", logged.attrs["proxy_status"])
	require.Equal(t, "egress_unavailable", logged.attrs["exit_class"])
	require.Equal(t, "true", logged.attrs["retry_budget_exhausted"])
}

// Any other proxy answer (403 for a sandbox with no egress grant, 407, ...)
// is reported as `other`, never as its number, and is not retried.
func TestWorkspaceRepositoryAdvertisementReportsAnotherProxyRefusal(t *testing.T) {
	proxy := startEgressRefusalProxy(t, http.StatusForbidden)
	records, err := advertiseThroughProxy(t, proxy.url)

	api, cause := requireStepOutcome(t, err)
	require.Equal(t, pkgerrors.CodeConflict, api.Code)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, api.Message)
	require.Equal(t, workspaceRepositoryExitFatal, cause.exitClass)
	require.Equal(t, workspaceProxyStatusOther, cause.proxyStatus)
	require.Equal(t, 1, proxy.connections())

	logged := requireUnverifiedLog(t, records)
	require.Equal(t, "other", logged.attrs["proxy_status"])
	require.NotContains(t, logged.text, "403")
}

// A refusal that never reached a proxy says so.
func TestWorkspaceRepositoryAdvertisementWithoutAProxyAnswer(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	closed := "http://" + listener.Addr().String()
	require.NoError(t, listener.Close())
	records, err := advertiseThroughProxy(t, closed)

	_, cause := requireStepOutcome(t, err)
	require.Equal(t, workspaceRepositoryExitFatal, cause.exitClass)
	require.Equal(t, workspaceProxyStatusNone, cause.proxyStatus)
	require.Equal(t, "none", requireUnverifiedLog(t, records).attrs["proxy_status"])
}

func TestWorkspaceProxyStatusReadsOnlyCurlsConnectPhrase(t *testing.T) {
	for _, tc := range []struct {
		stderr string
		want   workspaceProxyStatus
	}{
		{"", workspaceProxyStatusNone},
		{"fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response 429", workspaceProxyStatusQuota},
		{"fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response 429\nmore", workspaceProxyStatusQuota},
		{"fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response 503\r\n", workspaceProxyStatusUnavailable},
		{"fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response 403", workspaceProxyStatusOther},
		{"fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response 407", workspaceProxyStatusOther},
		{"CONNECT tunnel failed, response 4290", workspaceProxyStatusNone},
		{"CONNECT tunnel failed, response 42", workspaceProxyStatusNone},
		{"fatal: unable to access 'https://h/r.git/': The requested URL returned error: 429", workspaceProxyStatusNone},
		{"fatal: unable to access 'https://h/r.git/': Received HTTP code 429 from proxy after CONNECT", workspaceProxyStatusNone},
	} {
		require.Equalf(t, tc.want, workspaceProxyStatusFor(tc.stderr), "%q", tc.stderr)
	}
}

func TestWorkspaceTransferRetriesOnlyAnUnavailableEgressProxy(t *testing.T) {
	refusal := func(status string) workspaceapi.CommandResult {
		return workspaceapi.CommandResult{ExitCode: 128, Stderr: "fatal: unable to access 'https://h/r.git/': CONNECT tunnel failed, response " + status}
	}
	for _, verb := range []string{"ls-remote", "fetch", "clone"} {
		command := workspaceapi.Command{Args: []string{"git", verb}}
		require.True(t, retryableWorkspaceTransfer(command, refusal("503")), verb)
		require.False(t, retryableWorkspaceTransfer(command, refusal("429")), verb)
		require.False(t, retryableWorkspaceTransfer(command, refusal("403")), verb)
	}
	require.False(t, retryableWorkspaceTransfer(workspaceapi.Command{Args: []string{"git", "checkout"}}, refusal("503")))
	truncated := refusal("503")
	truncated.OutputTruncated = true
	require.False(t, retryableWorkspaceTransfer(workspaceapi.Command{Args: []string{"git", "fetch"}}, truncated))
	require.Equal(t, workspaceRepositoryExitEgressUnavailable, workspaceRepositoryExitClassFor(refusal("503")))
	require.Equal(t, workspaceRepositoryExitEgressQuota, workspaceRepositoryExitClassFor(refusal("429")))
	require.Equal(t, workspaceRepositoryExitFatal, workspaceRepositoryExitClassFor(refusal("403")))
}
