package repohostserver

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestUploadPackHTTPRunningGaugeCountsProcessSlots(t *testing.T) {
	h := newUploadPackQueueHTTPHarness(t, Config{
		MaxConcurrentUploadPacks: 2, MaxQueuedUploadPacks: 1, UploadPackQueueTimeout: 10 * time.Second,
	})
	first := h.request("active", "want", 4)
	second := h.request("active-two", "want", 4)
	h.waitStarts(2)
	queued := h.request("queued", "want", 4)
	h.waitAdmissions(3)
	metrics := h.metrics()
	require.Contains(t, metrics, "smithers_repo_host_upload_pack_running 2\n")
	require.Contains(t, metrics, "smithers_repo_host_upload_pack_waiting 1\n", "a queued fetch waits without a process slot")
	h.releasePacks()
	for _, conn := range []net.Conn{first, second, queued} {
		status, body, _ := h.response(conn)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, "PACK", body)
	}
	h.waitAdmissions(0)
	metrics = h.metrics()
	require.Contains(t, metrics, "smithers_repo_host_upload_pack_running 0\n")
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		require.Contains(t, metrics, "smithers_repo_host_upload_pack_peak_rss_bytes_count 3\n")
	}
}

func TestUploadPackHTTPPeakRSSIncludesPackBuildingChild(t *testing.T) {
	if runtime.GOOS != "linux" && runtime.GOOS != "darwin" {
		t.Skip("peak RSS comes from wait4 rusage, read only on linux and darwin")
	}
	// The stub upload-pack runs a child that touches 96 MiB, as git runs
	// pack-objects; the recorded peak must be the child's.
	h := newUploadPackQueueHTTPHarnessWithOutput(t, Config{}, fmt.Sprintf(
		"SMITHERS_PEAK_RSS_HELPER=1 '%s' -test.run='^TestPeakRSSHelperProcess$' >/dev/null 2>&1 || exit 1\nprintf PACK", os.Args[0]))
	conn := h.request("active", "want", 4)
	h.releasePacks()
	status, body, _ := h.response(conn)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "PACK", body)
	h.waitAdmissions(0)
	match := regexp.MustCompile(`(?m)^smithers_repo_host_upload_pack_peak_rss_bytes_sum (\S+)$`).FindStringSubmatch(h.metrics())
	require.NotNil(t, match)
	peak, err := strconv.ParseFloat(match[1], 64)
	require.NoError(t, err)
	require.GreaterOrEqual(t, peak, float64(64<<20), "peak RSS must include the pack-building child")
	require.Less(t, peak, float64(1<<30), "peak RSS must be in bytes, not KiB scaled twice")
}

// TestPeakRSSHelperProcess is the child the stub upload-pack runs: it touches
// 96 MiB so its resident peak is unmistakable, then exits.
func TestPeakRSSHelperProcess(t *testing.T) {
	if os.Getenv("SMITHERS_PEAK_RSS_HELPER") != "1" {
		return
	}
	buf := make([]byte, 96<<20)
	for i := 0; i < len(buf); i += 4096 {
		buf[i] = 1
	}
	runtime.KeepAlive(buf)
	os.Exit(0)
}
