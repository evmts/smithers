package repohostserver

import (
	"runtime"
	"testing"
)

func TestMetricsExportsServerMemory(t *testing.T) {
	metrics, err := NewMetrics()
	if err != nil {
		t.Fatalf("NewMetrics returned error: %v", err)
	}
	gathered, err := metrics.registry.Gather()
	if err != nil {
		t.Fatalf("gather metrics: %v", err)
	}
	families := map[string]bool{}
	for _, family := range gathered {
		families[family.GetName()] = true
	}

	want := []string{"go_memstats_heap_inuse_bytes", "go_goroutines"}
	// Production runs Linux, where the process collector reads /proc.
	if runtime.GOOS == "linux" {
		want = append(want, "process_resident_memory_bytes")
	}
	for _, name := range want {
		if !families[name] {
			t.Errorf("metric %s not exported", name)
		}
	}
}
