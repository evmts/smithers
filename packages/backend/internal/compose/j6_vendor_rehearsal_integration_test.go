package compose

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// The trusted-process install cannot prove R2. This opt-in row launches the
// same committed real-microVM terminal test, refusing skipped evidence.
func (r *rehearsal) vendorTerminalRow() {
	if os.Getenv("SMITHERS_J6_VENDOR_MICROVM") != "1" {
		r.pending("4 claude and codex signed in", "real microVM guest", "vendor and npm hosts reachable, others refused; claude and codex run (set SMITHERS_J6_VENDOR_MICROVM=1)", "T-MCH-12", "vendor-egress")
		return
	}
	r.step("4 claude and codex signed in", "real microVM guest terminal", "Anthropic/npm connect; unlisted host refused; claude/codex versions; login home retained", "T-MCH-12", func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 13*time.Minute)
		defer cancel()
		command := exec.CommandContext(ctx, "go", "test", "../../microsandbox", "-run", "^TestRealMicroVMVendorTerminal$", "-count=1", "-v", "-timeout", "12m")
		command.Env = append(os.Environ(), "SMITHERS_REQUIRE_MICROVM_TESTS=1")
		output, err := command.CombinedOutput()
		if err != nil {
			return fmt.Errorf("real microVM vendor terminal: %w: %s", err, output)
		}
		if !strings.Contains(string(output), "--- PASS: TestRealMicroVMVendorTerminal") || strings.Contains(string(output), "--- SKIP:") {
			return fmt.Errorf("missing real guest proof: %s", output)
		}
		r.actual = "real microVM: Anthropic/npm HTTPS connected; unlisted host denied; both CLI versions ran as agent; retained home after stop/start"
		return nil
	})
}
