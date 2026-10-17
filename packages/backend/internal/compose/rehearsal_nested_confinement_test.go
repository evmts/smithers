package compose

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// openWriteProbe is this test's own fixture, and it is the ONLY way this test
// asks whether a protected kernel entry is writable.
//
// It opens the path with O_WRONLY and closes it. `O_WRONLY` alone, by
// construction:
//
//   - no `O_CREAT`, so a path the venue does not have is reported as absent
//     and never brought into existence;
//   - no `O_TRUNC`, so an existing entry's bytes are not disturbed even for an
//     instant — which is why shell `>` redirection cannot be the primitive
//     here, since `>` opens `O_WRONLY|O_CREAT|O_TRUNC`;
//   - no write, no sysctl call, no mount, no global kernel state and no cache
//     purge anywhere in the fixture.
//
// That matters because this test exists to detect a FAILED boundary. A probe
// that wrote a value to `/proc/sysrq-trigger`, `/proc/sys/kernel/core_pattern`
// or `/proc/irq/*/smp_affinity` to find out whether it could would, in exactly
// the case it is meant to catch, perform the damage it was testing for. An
// earlier version of this file did that and must never be restored.
//
// The three answers are distinct on purpose: `denied` is the permission
// refusal this test asserts, `absent` is a venue that does not expose the
// entry, and `opened` is the protection having been traded away. "Not opened"
// would have been a weaker oracle, so it is not the one used.
const openWriteProbe = `package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"syscall"
)

func main() {
	for _, path := range os.Args[1:] {
		file, err := os.OpenFile(path, os.O_WRONLY, 0)
		switch {
		case err == nil:
			_ = file.Close()
			fmt.Println("opened")
		case errors.Is(err, fs.ErrNotExist):
			fmt.Println("absent")
		case errors.Is(err, fs.ErrPermission), errors.Is(err, syscall.EROFS):
			fmt.Println("denied")
		default:
			fmt.Println("unexpected")
		}
	}
}
`

// What the guest runs: it proves its own isolation, then runs the product's
// own confined-child posture inside itself and proves that child's isolation
// too. Every line is an assertion the Go test reads back; a missing line fails
// the test, so a step that silently did not run cannot pass.
//
// Every negative has a POSITIVE CONTROL beside it, because a search that can
// never find anything proves nothing:
//
//   - Process visibility is searched by a unique marker in a process's own
//     command line, never by a bare PID. PID numbers are namespace-relative
//     and collide, so `/proc/<n>` existing says nothing about WHICH process
//     that is.
//   - Environment visibility is searched for a nonce placed in a witness
//     process's INITIAL exec environment, because `/proc/<pid>/environ`
//     reports the environment the process was exec'd with; a nonce added later
//     with setenv is not there and would make the search vacuously negative.
//   - Each searcher is handed a BRACKETED pattern (`wit[n]ess…`), never the
//     literal, so grep cannot match its own command line or the guest's. The
//     guest derives the literal only where it has to plant one.
//
// Arguments: `$1` the witness's command-line pattern, `$2` the witness's
// environment pattern, `$3` a secret file outside every path the guest binds,
// `$4` a readable file INSIDE the guest's own machine, `$5` the literal marker
// this guest's own shell carries, `$6` the pattern for the sentinel the guest
// plants itself, `$7` the pattern for the confined child's own shell. No
// marker, nonce or secret value is ever printed.
const nestedConfinementProbe = `
set -u
unbracket() { printf '%s' "$1" | tr -d '[]'; }
seen_cmdline() { if grep -rqs -- "$1" /proc/*/cmdline 2>/dev/null; then echo yes; else echo no; fi; }
seen_environ() { if grep -rqs -- "$1" /proc/*/environ 2>/dev/null; then echo yes; else echo no; fi; }
echo "GUEST_UID=$(id -u)"
echo "GUEST_PIDS=$(ls /proc | grep -c '^[0-9]*$')"

# POSITIVE CONTROL for the procfs identity oracle: this guest's own shell is
# the process its own procfs reports at its own PID. If the procfs belonged to
# an enclosing PID namespace, /proc/$$ would be another process, or none.
if grep -qs -- "$5" "/proc/$$/cmdline" 2>/dev/null; then echo "GUEST_PROC_SELF_IS_OWN_SHELL=yes"; else echo "GUEST_PROC_SELF_IS_OWN_SHELL=no"; fi
# NEGATIVE: no process outside this guest's own tree is in its process table.
echo "GUEST_SEES_WITNESS=$(seen_cmdline "$1")"
# NEGATIVE: the witness's initial environment is not readable from here.
echo "GUEST_READS_WITNESS_ENV=$(seen_environ "$2")"

# Every protected kernel entry is checked with openw, which opens for writing
# and writes nothing. Unprivileged, bubblewrap mounts no read-only covers over
# them, so each one has to be refused by the guest's own credential. An opened
# answer on any line is a protection that is not there, and the test fails.
echo "GUEST_OPENW_SYSRQ=$(openw /proc/sysrq-trigger)"
echo "GUEST_OPENW_SYSCTL_KERNEL=$(openw /proc/sys/kernel/core_pattern)"
echo "GUEST_OPENW_SYSCTL_HOSTNAME=$(openw /proc/sys/kernel/hostname)"
echo "GUEST_OPENW_SYSCTL_UNPRIV=$(openw /proc/sys/kernel/unprivileged_userns_clone)"
echo "GUEST_OPENW_SYSCTL_NET=$(openw /proc/sys/net/ipv4/ip_forward)"
echo "GUEST_OPENW_SYSCTL_VM=$(openw /proc/sys/vm/drop_caches)"
IRQ=$(ls /proc/irq 2>/dev/null | grep -m1 '^[0-9]*$')
if [ -n "$IRQ" ]; then echo "GUEST_OPENW_IRQ=$(openw "/proc/irq/$IRQ/smp_affinity")"; else echo "GUEST_OPENW_IRQ=absent"; fi
echo "GUEST_OPENW_BUS=$(openw /proc/bus/pci/00/00.0)"

# POSITIVE CONTROL for the file-read oracle: a file inside the guest's own
# machine reads. NEGATIVE: one outside it does not.
if cat "$4" >/dev/null 2>&1; then echo "GUEST_READ_MACHINE=yes"; else echo "GUEST_READ_MACHINE=no"; fi
if cat "$3" >/dev/null 2>&1; then echo "GUEST_READ_SECRET=yes"; else echo "GUEST_READ_SECRET=no"; fi

# The guest plants its OWN sentinel, in its own PID namespace, carrying the
# derived literal in both its command line and its initial environment. The
# guest finding it is the POSITIVE CONTROL that both search techniques work
# inside this very procfs; the confined child not finding it is the negative.
SENTINEL_MARK=$(unbracket "$6")
SMITHERS_TEST_SENTINEL="$SENTINEL_MARK" /bin/sh -c 'while true; do sleep 1; done' "$SENTINEL_MARK" &
SENTINEL=$!
sleep 1
echo "GUEST_SEES_OWN_SENTINEL=$(seen_cmdline "$6")"
echo "GUEST_READS_OWN_SENTINEL_ENV=$(seen_environ "$6")"

# ProcessSandbox.bubblewrap's posture, unchanged, including its own --proc.
bwrap --tmpfs / \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 --symlink usr/bin /bin \
  --dev /dev --proc /proc --tmpfs /tmp --dir /tmp/home --dir /tmp/cache \
  --remount-ro / --unshare-all --new-session --die-with-parent \
  -- /bin/sh -c '
    seen_cmdline() { if grep -rqs -- "$1" /proc/*/cmdline 2>/dev/null; then echo yes; else echo no; fi; }
    seen_environ() { if grep -rqs -- "$1" /proc/*/environ 2>/dev/null; then echo yes; else echo no; fi; }
    echo "CHILD_OK=yes"
    echo "CHILD_PIDS=$(ls /proc | grep -c "^[0-9]*$")"
    if grep -qs -- "$3" "/proc/$$/cmdline" 2>/dev/null; then echo "CHILD_PROC_SELF_IS_OWN_SHELL=yes"; else echo "CHILD_PROC_SELF_IS_OWN_SHELL=no"; fi
    echo "CHILD_SEES_GUEST_SENTINEL=$(seen_cmdline "$2")"
    echo "CHILD_READS_GUEST_SENTINEL_ENV=$(seen_environ "$2")"
    echo "CHILD_SEES_WITNESS=$(seen_cmdline "$1")"
    echo "CHILD_READS_WITNESS_ENV=$(seen_environ "$4")"
    if cat "$5" >/dev/null 2>&1; then echo "CHILD_READ_SECRET=yes"; else echo "CHILD_READ_SECRET=no"; fi
    if [ -w / ]; then echo "CHILD_ROOT_WRITABLE=yes"; else echo "CHILD_ROOT_WRITABLE=no"; fi
  ' "$(unbracket "$7")" "$1" "$6" "$(unbracket "$7")" "$2" "$3"
echo "CHILD_RC=$?"
kill "$SENTINEL" 2>/dev/null
echo "PROBE_COMPLETE=yes"
`

// The real boundary: the product's own confinement has to work INSIDE the
// rehearsal guest's confinement, and both have to stay confinements. The
// guest's posture is the published one, unchanged; what this test adds is the
// proof, and the launcher requirement that proof depends on.
//
// A coding turn's immutable tree export spawns the native exporter through the
// coding host's confined spawner (flows/coding/immutable-source.ts), which is
// ProcessSandbox's bubblewrap posture and mounts its own `/proc` for its own
// PID namespace. Inside the rehearsal's guest that export was refused with
// `bwrap: Can't mount proc on /newroot/proc: Operation not permitted`, and
// every coding turn ended `coding/Error/invalid_receipt`.
//
// Measured, on the pinned venue (kernel 5.10.0-32-cloud-amd64, bubblewrap
// 0.8.0), with this posture held fixed and only the launching uid changed:
//
//	launcher uid 0      guest procfs carries 3 read-only covers   child --proc REFUSED
//	launcher uid 19997  guest procfs carries 0 covers             child --proc succeeds
//
// Bubblewrap covers `/proc/sys`, `/proc/sysrq-trigger`, `/proc/irq` and
// `/proc/bus` only when it runs privileged, because unprivileged it does not
// have to: the kernel already refuses those writes to the guest's credential.
// Those covers are what the child's own `--proc` then collides with — a
// nested user namespace locks them, and the kernel's mount_too_revealing()
// check refuses a second procfs that would reveal what locked covers hide.
//
// So the refusal was the VENUE running the fixture as root, not the fixture.
// The posture needs no repair and does not get one: giving the guest an
// `unshare --mount-proc` procfs instead would drop those covers, and under a
// privileged launcher that measurably opens `/proc/sysrq-trigger` to the
// guest — the protection trade this lane is forbidden to make.
//
// Hence the launcher's own uid is part of the oracle. From kernel uid 0 this
// test proves nothing about the protected entries: root's DAC check passes on
// its own. The guest's own `id -u` cannot settle it either, because a
// `--map-root-user` above it maps the inner uid onto the CALLING uid, so an
// inner 19998 over a root launcher is still kernel uid 0 — which is how lane
// 116 came to read `GUEST_WROTE_SYSRQ=yes` as a lost protection.
//
// The negatives are the point, not the completion: the guest cannot see this
// process, the child cannot see the guest's processes or this process, neither
// can read the bootstrap caller's environment or a host file outside the
// machine, the child's root is still read-only, and every protected kernel
// entry is still refused. A change that bound the caller's procfs, dropped the
// child's `--proc` or stopped confining the guest fails at least one of them.
func TestConfinedRehearsalGuestNestsAConfinedChild(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("the guest is an unprivileged Linux user/mount namespace")
	}
	bwrap, err := exec.LookPath("bwrap")
	if err != nil {
		t.Skip("bubblewrap is not on PATH")
	}
	require.NotZero(t, os.Getuid(),
		"this test must be launched by a real unprivileged uid outside every namespace: "+
			"from kernel uid 0 a protected entry's refusal proves a mount cover, not a credential")

	base := t.TempDir()
	machine := filepath.Join(base, "machine")
	root := filepath.Join(machine, "checkout")
	require.NoError(t, os.MkdirAll(root, 0o755))
	// Inside the guest's own machine: the positive control for reading at all.
	inside := filepath.Join(root, "inside-the-machine")
	require.NoError(t, os.WriteFile(inside, []byte("the guest's own file"), 0o600))
	// Outside every path the guest binds, and outside the machine directory.
	secret := filepath.Join(base, "host-secret")
	require.NoError(t, os.WriteFile(secret, []byte("nested-child-must-not-read-this"), 0o600))

	// Each needle is unique to this run, so a stale process cannot answer for
	// it, and each is handed to a searcher only as a bracketed pattern that
	// cannot match the searcher's own command line.
	witnessMark := nestedConfinementMark(t, "witnesscmd")
	witnessEnv := nestedConfinementMark(t, "witnessenv")
	guestMark := nestedConfinementMark(t, "guestshell")
	sentinelMark := nestedConfinementMark(t, "guestsentinel")
	childMark := nestedConfinementMark(t, "childshell")

	// The witness is a process OUTSIDE the guest entirely, holding its nonce in
	// the environment it was exec'd with. It stands in for any process of this
	// host whose environment an untrusted check must not reach.
	witness := exec.Command("/bin/sh", "-c", "while true; do sleep 1; done", witnessMark)
	witness.Env = []string{"SMITHERS_REHEARSAL_WITNESS=" + witnessEnv, "PATH=/usr/bin:/bin"}
	require.NoError(t, witness.Start())
	t.Cleanup(func() {
		_ = witness.Process.Kill()
		_, _ = witness.Process.Wait()
	})

	// POSITIVE CONTROL, from this process, before anything is asked of the
	// guest: both needles ARE findable in the witness's own procfs entries. A
	// negative from inside the guest is only meaningful after this holds.
	witnessProc := filepath.Join("/proc", strconv.Itoa(witness.Process.Pid))
	require.EventuallyWithT(t, func(ready *assert.CollectT) {
		cmdline, err := os.ReadFile(filepath.Join(witnessProc, "cmdline"))
		assert.NoError(ready, err, "the witness's command line reads from this process")
		assert.Contains(ready, string(cmdline), witnessMark, "the witness carries its command-line marker")
		environ, err := os.ReadFile(filepath.Join(witnessProc, "environ"))
		assert.NoError(ready, err, "the witness's environment reads from this process")
		assert.Contains(ready, string(environ), witnessEnv,
			"the witness carries its nonce in the environment it was exec'd with")
	}, 3*time.Second, 10*time.Millisecond, "the host witness becomes observable before isolation checks")

	// The open-only fixture, built into the directory `confined` already binds
	// read-only and puts on the guest's PATH. No new bind, no new tool: the
	// repository's own pinned Go toolchain compiles it from the source above.
	tools := t.TempDir()
	bwrapBinary, err := os.ReadFile(bwrap)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(tools, "bwrap"), bwrapBinary, 0o755))
	fixture := filepath.Join(t.TempDir(), "openw.go")
	require.NoError(t, os.WriteFile(fixture, []byte(openWriteProbe), 0o600))
	build := exec.Command("go", "build", "-o", filepath.Join(tools, "openw"), fixture)
	build.Env = append(os.Environ(), "CGO_ENABLED=0")
	built, buildErr := build.CombinedOutput()
	require.NoError(t, buildErr, "the open-only probe built: %s", built)

	guest := &rehearsalReviewRuntime{bubblewrap: bwrap, tools: tools}
	confined := guest.confined(
		workspaceapi.Workspace{Root: root},
		workspaceapi.Command{Args: []string{
			"/bin/sh", "-c", nestedConfinementProbe, guestMark,
			nestedConfinementPattern(witnessMark), nestedConfinementPattern(witnessEnv),
			secret, inside, guestMark,
			nestedConfinementPattern(sentinelMark), nestedConfinementPattern(childMark),
		}},
	)
	command := exec.Command(confined.Args[0], confined.Args[1:]...)
	for name, value := range confined.Environment {
		command.Env = append(command.Env, name+"="+value)
	}
	out, runErr := command.CombinedOutput()
	t.Logf("launcher uid %d, guest output:\n%s", os.Getuid(), out)

	observed := map[string]string{}
	for _, line := range strings.Split(string(out), "\n") {
		if name, value, found := strings.Cut(strings.TrimSpace(line), "="); found {
			observed[name] = value
		}
	}
	require.NoError(t, runErr, "the guest ran: %s", out)
	require.Equal(t, "yes", observed["PROBE_COMPLETE"], "every probe step ran")

	// The guest's own positive controls, asserted FIRST: a search technique
	// that cannot find anything here would make every negative below vacuous.
	require.Equal(t, "yes", observed["GUEST_PROC_SELF_IS_OWN_SHELL"],
		"the guest's procfs reports the guest's own shell at the guest's own PID")
	require.Equal(t, "yes", observed["GUEST_SEES_OWN_SENTINEL"],
		"positive control: a command-line marker IS findable in this procfs")
	require.Equal(t, "yes", observed["GUEST_READS_OWN_SENTINEL_ENV"],
		"positive control: an environment nonce IS findable in this procfs")
	require.Equal(t, "yes", observed["GUEST_READ_MACHINE"],
		"positive control: the guest can read a file inside its own machine")

	// The guest is still a confinement.
	require.Equal(t, "19998", observed["GUEST_UID"], "the guest runs as the unprivileged agent uid")
	require.Equal(t, "no", observed["GUEST_SEES_WITNESS"], "the guest sees no process outside its own tree")
	require.Equal(t, "no", observed["GUEST_READS_WITNESS_ENV"],
		"the guest cannot read the environment of a process outside its tree")
	require.Equal(t, "no", observed["GUEST_READ_SECRET"], "the guest reads nothing outside its machine")

	// Root's requirement: the host's protection is not traded away. Every
	// protected entry is still refused, here by the credential the guest
	// actually has rather than by a mount a privileged bubblewrap would have
	// laid over it.
	for _, entry := range []string{
		"GUEST_OPENW_SYSRQ",
		"GUEST_OPENW_SYSCTL_KERNEL",
		"GUEST_OPENW_SYSCTL_HOSTNAME",
		"GUEST_OPENW_SYSCTL_UNPRIV",
		"GUEST_OPENW_SYSCTL_NET",
		"GUEST_OPENW_SYSCTL_VM",
		"GUEST_OPENW_IRQ",
		"GUEST_OPENW_BUS",
	} {
		require.Contains(t, []string{"denied", "absent"}, observed[entry],
			"%s: a protected kernel entry refused an open for writing", entry)
	}

	// The product's own confinement works inside it, unchanged.
	require.Equal(t, "yes", observed["CHILD_OK"], "the product's confined child mounts its own procfs")
	require.Equal(t, "0", observed["CHILD_RC"], "the product's confined child exits cleanly")

	// And is still a confinement, with a procfs of its own PID namespace: the
	// child's own PID resolves to the child's own shell, and the guest's
	// sentinel and this host's witness are both absent from it.
	require.Equal(t, "yes", observed["CHILD_PROC_SELF_IS_OWN_SHELL"],
		"the child's procfs reports the child's own shell at the child's own PID")
	require.Equal(t, "no", observed["CHILD_SEES_GUEST_SENTINEL"], "the child cannot see the guest's processes")
	require.Equal(t, "no", observed["CHILD_READS_GUEST_SENTINEL_ENV"],
		"the child cannot read the guest's process environment")
	require.Equal(t, "no", observed["CHILD_SEES_WITNESS"], "the child cannot see this host's processes")
	require.Equal(t, "no", observed["CHILD_READS_WITNESS_ENV"],
		"the child cannot read the environment of a process outside the guest")
	require.Equal(t, "no", observed["CHILD_READ_SECRET"], "the child reads nothing outside its declared reads")
	require.Equal(t, "no", observed["CHILD_ROOT_WRITABLE"], "the child's root stays read-only")
	pids, err := strconv.Atoi(observed["CHILD_PIDS"])
	require.NoError(t, err, "the child's process table is countable")
	require.Less(t, pids, 16, "the child's process table holds only its own tree")
}

// nestedConfinementMark is a needle unique to this run, so no stale process
// can answer for it. Letters and digits only: it is also used as a regular
// expression.
func nestedConfinementMark(t *testing.T, kind string) string {
	t.Helper()
	nonce := make([]byte, 8)
	_, err := rand.Read(nonce)
	require.NoError(t, err)
	return "smithersrehearsal" + kind + hex.EncodeToString(nonce)
}

// nestedConfinementPattern brackets one character of a needle. The result
// matches the needle's own text but NOT itself, so a searcher handed the
// pattern cannot match its own command line, and neither can grep.
func nestedConfinementPattern(mark string) string {
	return mark[:3] + "[" + mark[3:4] + "]" + mark[4:]
}
