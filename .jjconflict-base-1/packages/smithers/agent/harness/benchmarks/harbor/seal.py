"""The denied-connect proof of a task container's network seal.

A task that declares `network_mode = "no-network"` must not let its agent
reach the internet: an unsealed agent downloads the upstream fix. The stock
Codex CLI runs inside the task container and has to reach its model, so its
container cannot be on `network none`. Under Pier it sits on an internal
network whose only way out is a proxy that allows `ALLOWED_HOSTS`. Under
Harbor's docker egress control, a transparent proxy cuts every other TLS
handshake.

`script()` is run inside the task container before the CLI starts, with the
environment the CLI's own commands get. It tries each URL of `ATTEMPTS` with
curl and prints one line per attempt. `verdict()` reads those lines:
`sealed` is true only when every attempt to reach a host outside the allowlist
was refused. Anything else is `sealed: false` with the reason: a connection,
a probe that could not run, a missing or unreadable line.
"""

from __future__ import annotations

import shlex

# Every host the ChatGPT-subscription route of the Codex CLI needs (read off
# the CLI's source at rust-v0.155.1):
#   chatgpt.com      the model backend, https://chatgpt.com/backend-api/codex
#                    (`CHATGPT_CODEX_BASE_URL`, the base URL of every ChatGPT auth mode)
#   auth.openai.com  the token refresh, https://auth.openai.com/oauth/token
#                    (`REFRESH_TOKEN_URL`; an access token is refreshed 5 minutes before it expires)
# `api.openai.com` is the API-key route and is not on it.
ALLOWED_HOSTS = ("auth.openai.com", "chatgpt.com")

# (kind, url). `allowed` shows the route to the model is open. `denied` goes
# the way the agent's own requests go, through the proxy when there is one.
# `denied-direct` goes around the proxy, by name and by address, so a
# resolver that fails is not mistaken for a wall.
ATTEMPTS = (
    ("allowed", "https://chatgpt.com/"),
    ("allowed", "https://auth.openai.com/"),
    ("denied", "https://github.com/"),
    ("denied-direct", "https://github.com/"),
    ("denied-direct", "https://1.1.1.1/"),
)

# curl exit codes that say no connection to the target was made.
REFUSED = {
    5: "the proxy did not resolve",
    6: "the host did not resolve",
    7: "the connection failed",
    # Harbor's docker egress control: a transparent proxy reads the SNI and
    # hangs up on a host off its allowlist before the handshake completes.
    35: "the TLS handshake was cut",
    56: "the proxy refused the tunnel",
    97: "the proxy handshake failed",
}

MARK = "seal-probe"


def script(attempts: tuple = ATTEMPTS) -> str:
    """The probe, for `sh`. It always exits 0; the lines carry the result."""
    lines = [
        "attempt() { kind=$1; url=$2; shift 2",
        "  status=0",
        "  seen=$(curl -sS -o /dev/null -w '%{http_code} %{http_connect}' --connect-timeout 10 --max-time 20 \"$@\" \"$url\" 2>/dev/null) || status=$?",
        f"  echo \"{MARK} $kind $url $status ${{seen:-000 000}}\"; }}",
    ]
    for kind, url in attempts:
        around = " --noproxy '*'" if kind == "denied-direct" else ""
        lines.append(f"attempt {shlex.quote(kind)} {shlex.quote(url)}{around}")
    lines.append("exit 0")
    return "\n".join(lines)


def read(output: str) -> list[dict]:
    """One record per probe line, in order; unreadable lines are dropped."""
    attempts = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) != 6 or fields[0] != MARK:
            continue
        try:
            status, http, proxy = (int(field) for field in fields[3:])
        except ValueError:
            continue
        attempts.append({"kind": fields[1], "url": fields[2], "curl": status, "http": http, "proxy": proxy})
    return attempts


def verdict(output: str, attempts: tuple = ATTEMPTS, allowlist: tuple = ALLOWED_HOSTS) -> dict:
    """The proof for one trial: `sealed`, the attempts, and why not when not."""
    seen = read(output)
    reasons = []
    for kind, url in attempts:
        if kind == "allowed":
            continue
        made = [attempt for attempt in seen if (attempt["kind"], attempt["url"]) == (kind, url)]
        if not made:
            reasons.append(f"no {kind} attempt on {url} was recorded")
        for attempt in made:
            if attempt["curl"] == 0:
                reasons.append(f"{kind} {url} connected (http {attempt['http']})")
            elif attempt["curl"] not in REFUSED:
                reasons.append(f"{kind} {url} proves nothing: curl exit {attempt['curl']}")
    allowed = [attempt for attempt in seen if attempt["kind"] == "allowed"]
    proof = {
        "sealed": not reasons,
        "allowlist": sorted(allowlist),
        "reachable": bool(allowed) and all(attempt["curl"] == 0 for attempt in allowed),
        "attempts": seen,
    }
    if reasons:
        proof["reason"] = "; ".join(reasons)
    return proof
