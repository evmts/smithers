//go:build !linux && !darwin

package repohostserver

import "os"

// peakRSSBytes has no portable source elsewhere; no sample is recorded.
func peakRSSBytes(*os.ProcessState) (float64, bool) { return 0, false }
