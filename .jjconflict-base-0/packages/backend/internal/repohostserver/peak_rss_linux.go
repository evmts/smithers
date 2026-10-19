//go:build linux

package repohostserver

import (
	"os"
	"syscall"
)

// peakRSSBytes reads a reaped process's peak resident set. Linux reports
// ru_maxrss in KiB and includes the largest descendant the process reaped.
func peakRSSBytes(state *os.ProcessState) (float64, bool) {
	usage, ok := state.SysUsage().(*syscall.Rusage)
	if !ok || usage == nil {
		return 0, false
	}
	return float64(usage.Maxrss) * 1024, true
}
