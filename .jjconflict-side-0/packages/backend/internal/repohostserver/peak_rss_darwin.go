//go:build darwin

package repohostserver

import (
	"os"
	"syscall"
)

// peakRSSBytes reads a reaped process's peak resident set. Darwin reports
// ru_maxrss in bytes and includes the largest descendant the process reaped.
func peakRSSBytes(state *os.ProcessState) (float64, bool) {
	usage, ok := state.SysUsage().(*syscall.Rusage)
	if !ok || usage == nil {
		return 0, false
	}
	return float64(usage.Maxrss), true
}
