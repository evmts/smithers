"""Harbor's stock Codex CLI agent, drawing one Codex login per trial.

    harbor run … -a evals.harbor.codex_pool:PooledCodex -m openai/gpt-6.1-sol \
        --ak version=0.160.0 --ak reasoning_effort=max

Harbor's `codex` agent takes one `auth.json` for the whole job
(`CODEX_FORCE_AUTH_JSON` / `CODEX_AUTH_JSON_PATH`). This subclass leases the
next account from `accounts.Pool` for each trial instead, records the label
(never the email) beside the trial's logs, and applies the same policy as
`SmithersAgent`: a usage limit takes the account out of rotation and re-runs
the trial whole on the next healthy account (every re-run in `requeue.log`),
and when none is left the pool pauses and then raises, so a dry seat is never
scored. The wrapper also pins the runtime, seals its shell tools, and meters
the retained sessions while keeping the stock framework's execution boundary.
"""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
import os
import re
import shlex
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import toml

from .framework import selected

FRAMEWORK = selected()
if FRAMEWORK == "pier":
    from pier.agents.installed.codex import Codex
    from pier.environments.base import BaseEnvironment
    from pier.models.agent.context import AgentContext
else:
    from harbor.agents.installed.codex import Codex
    from harbor.environments.base import BaseEnvironment
    from harbor.models.agent.context import AgentContext

from . import accounts

ACCOUNT_FILE = "codex-account.json"
DEFAULT_MODEL = "openai/gpt-6.1-sol"
DEFAULT_VERSION = "0.160.0"
SANDBOX_PROBE_COMMAND = "curl --noproxy '*' --connect-timeout 5 --max-time 10 https://example.com"
SANDBOX_PROBE_INSTRUCTION = (
    "Before working, invoke the shell tool with this exact command as a separate call: "
    + SANDBOX_PROBE_COMMAND + ". Its network connection should be denied by the sandbox. "
    "Do not request elevated permissions or bypass the sandbox. Then complete the task.\n\n"
)


def sealed_config(config: dict[str, Any]) -> dict[str, Any]:
    """Merge the benchmark's runtime seal without duplicate TOML keys."""
    config = deepcopy(config)
    required = {"web_search": "disabled", "check_for_update_on_startup": False,
                "forced_login_method": "chatgpt", "model_provider": "openai",
                "sandbox_mode": "workspace-write", "approval_policy": "never"}
    sections = {"analytics", "feedback", "otel", "sandbox_workspace_write"}
    unknown = config.keys() - required.keys() - sections - {"model_reasoning_effort", "model_reasoning_summary"}
    if unknown:
        raise ValueError(f"unsupported benchmark Codex config keys: {', '.join(sorted(unknown))}")
    for key, value in required.items():
        if key in config and (type(config[key]) is not type(value) or config[key] != value):
            raise ValueError(f"benchmark Codex config requires {key}={value!r}")
        config[key] = value
    for section, key, value in (("analytics", "enabled", False), ("feedback", "enabled", False),
                                ("otel", "exporter", "none"), ("sandbox_workspace_write", "network_access", False)):
        table = config.setdefault(section, {})
        if not isinstance(table, dict):
            raise ValueError(f"benchmark Codex config requires [{section}] to be a table")
        if table.keys() - {key}:
            raise ValueError(f"unsupported benchmark Codex [{section}] config")
        if key in table and (type(table[key]) is not type(value) or table[key] != value):
            raise ValueError(f"benchmark Codex config requires {section}.{key}={value!r}")
        table[key] = value
    return config


def session_usage(sessions_dir: Path) -> dict[str, Any]:
    """Meter cumulative token_count snapshots once per Codex session.

    Cached input is part of input, and reasoning output is part of output.
    Copied/resumed JSONLs with the same session ID must not be charged twice.
    A rate-limit update may have info=null and still carries useful metadata.
    """
    names = ("input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens")
    snapshots: dict[str, dict[str, int]] = {}
    usage_events: dict[str, dict[tuple[int, ...], dict[str, Any]]] = {}
    rate_events: list[tuple[str, int, dict[str, Any]]] = []
    models: list[str] = []
    for path in sorted(sessions_dir.rglob("*.jsonl")):
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        rows: list[dict[str, Any]] = []
        session_id = str(path.relative_to(sessions_dir))
        for line in lines:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict) or not isinstance(row.get("payload"), dict):
                continue
            rows.append(row)
            if row.get("type") == "session_meta" and isinstance(row["payload"].get("id"), str):
                session_id = row["payload"]["id"]
        for row in rows:
            payload = row["payload"]
            if row.get("type") == "turn_context" and isinstance(payload.get("model"), str):
                if payload["model"] not in models:
                    models.append(payload["model"])
            if row.get("type") != "event_msg" or payload.get("type") != "token_count":
                continue
            limits = payload.get("rate_limits")
            primary = limits.get("primary") if isinstance(limits, dict) else None
            if isinstance(primary, dict):
                rate_events.append((str(row.get("timestamp", "")), len(rate_events), dict(primary)))
            info = payload.get("info")
            total = info.get("total_token_usage") if isinstance(info, dict) else None
            if not isinstance(total, dict):
                continue
            values = {name: total.get(name, 0) for name in names}
            if any(type(value) is not int or value < 0 for value in values.values()):
                continue
            if any(name not in total for name in names[:3]):
                continue
            if values["cached_input_tokens"] > values["input_tokens"] or values["reasoning_output_tokens"] > values["output_tokens"]:
                continue
            previous = snapshots.setdefault(session_id, dict.fromkeys(names, 0))
            for name in names:
                previous[name] = max(previous[name], values[name])
            key = tuple(values[name] for name in names)
            events = usage_events.setdefault(session_id, {})
            last_usage = info.get("last_token_usage")
            if key not in events or isinstance(last_usage, dict):
                events[key] = last_usage if isinstance(last_usage, dict) else {}
    requests: list[dict[str, Any]] = []
    complete = bool(snapshots)
    for session_id, events in usage_events.items():
        previous = dict.fromkeys(names, 0)
        # Cumulative counters provide ordering even for duplicate or resumed
        # files with overlapping timestamp ranges.
        for key, last in sorted(events.items()):
            current = dict(zip(names, key))
            delta = {name: current[name] - previous[name] for name in names}
            if any(value < 0 for value in delta.values()):
                complete = False
                continue
            if any(delta.values()):
                context_input = last.get("input_tokens")
                if type(context_input) is not int or context_input < 0:
                    context_input = delta["input_tokens"]
                complete = complete and all(type(last.get(name)) is int and last[name] == delta[name] for name in names[:3])
                requests.append({"input": delta["input_tokens"], "cached": delta["cached_input_tokens"],
                                 "output": delta["output_tokens"], "context_input": context_input,
                                 "session_id": session_id})
            previous = current
    rates = [primary for _, _, primary in sorted(rate_events)]
    first = rates[0] if rates else {}
    last = rates[-1] if rates else {}
    return {
        "n_input_tokens": sum(row["input_tokens"] for row in snapshots.values()) if snapshots else None,
        "n_cache_tokens": sum(row["cached_input_tokens"] for row in snapshots.values()) if snapshots else None,
        "n_output_tokens": sum(row["output_tokens"] for row in snapshots.values()) if snapshots else None,
        "reasoning_output_tokens": sum(row["reasoning_output_tokens"] for row in snapshots.values()) if snapshots else None,
        "sessions": len(snapshots),
        "request_usage": requests,
        "metering_complete": complete,
        "models": models,
        "primary_used_percent_first": first.get("used_percent"),
        "primary_used_percent_last": last.get("used_percent"),
        "resets_at": last.get("resets_at"),
        "primary_first": first or None,
        "primary_last": last or None,
    }


def usage_limit_in(output: str) -> str | None:
    """The usage-limit line in the CLI's output, if any."""
    for line in output.splitlines():
        if accounts.mentions_usage_limit(line):
            return line.strip()[:500]
    return None


def container_commands(output: str) -> dict[str, int]:
    """Codex `command_execution` items the CLI completed inside the task
    container, and how many exited 0. The CLI runs in the container, so every
    command it ran is a container command."""
    attempted = succeeded = 0
    completed: set[str] = set()
    for line in output.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        item = event.get("item")
        if event.get("type") != "item.completed" or not isinstance(item, dict):
            continue
        if item.get("type") == "command_execution":
            item_id = item.get("id")
            if isinstance(item_id, str):
                if item_id in completed:
                    continue
                completed.add(item_id)
            attempted += 1
            if type(item.get("exit_code")) is int and item["exit_code"] == 0:
                succeeded += 1
    return {"attempted": attempted, "succeeded": succeeded}


def sandbox_proof(output: str, *, sandbox_invoked: bool) -> dict[str, Any]:
    """Require a denied direct curl in Codex's completed shell-tool stream.

    Config and instructions are intent. An assistant's prose, arbitrary failed
    curl, timeout, HTTP error, and a command from the setup environment are not
    a sandbox receipt. Proxy bypass makes this probe exercise a direct socket.
    """
    probe = {"command": None, "exit_code": None, "denied": False,
             "source": "codex-shell-tool", "output": None}
    unsupported = any(signal in output.lower() for signal in (
        "error running landlock", "failed to install seccomp", "sandbox setup failed",
        "failed to initialize sandbox", "sandbox is not supported", "sandbox not supported",
        "bwrap: creating new namespace failed", "sandboxerror("))
    connected = False
    for line in output.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get("type") != "item.completed":
            continue
        item = event.get("item")
        if not isinstance(item, dict) or item.get("type") != "command_execution":
            continue
        command = item.get("command")
        if not isinstance(command, str):
            continue
        try:
            argv = shlex.split(command)
            if len(argv) == 3 and Path(argv[0]).name in ("bash", "sh", "zsh") and argv[1] in ("-c", "-lc"):
                argv = shlex.split(argv[2])
        except ValueError:
            continue
        if argv != shlex.split(SANDBOX_PROBE_COMMAND):
            continue
        code = item.get("exit_code")
        tool_output = item.get("aggregated_output")
        connected = connected or (type(code) is int and code == 0)
        if type(code) is not int or not isinstance(tool_output, str):
            continue
        denied = (code in (6, 7) and any(signal in tool_output.lower() for signal in (
            "operation not permitted", "permission denied"))) or (code > 0 and any(signal in tool_output.lower() for signal in (
            "network access denied by sandbox", "sandbox denied network")))
        probe = {"command": command, "exit_code": code, "denied": denied,
                 "source": "codex-shell-tool", "output": tool_output[:1000]}
    sealed = sandbox_invoked and probe["denied"] and not unsupported and not connected
    reason = None if sealed else ("guest sandbox unsupported" if unsupported else
             "shell-tool network probe connected" if connected else
             "sandbox invocation missing" if not sandbox_invoked else "denied shell-tool network probe missing")
    return {"sealed": sealed, "sealed_by": "codex-sandbox", "sandbox_probe": probe, "reason": reason}


class PooledCodex(Codex):
    def __init__(self, logs_dir: Path, model_name: str | None = None, **kwargs: Any) -> None:
        kwargs.setdefault("version", DEFAULT_VERSION)
        if not re.fullmatch(r"[A-Za-z0-9_.:-]+/[A-Za-z0-9_.:-]+", model_name or DEFAULT_MODEL):
            raise ValueError("invalid benchmark Codex model name")
        if not isinstance(kwargs["version"], str) or not re.fullmatch(r"\d+\.\d+\.\d+", kwargs["version"]):
            raise ValueError("invalid benchmark Codex version")
        kwargs.setdefault("reasoning_effort", "max")
        if kwargs["reasoning_effort"] not in ("none", "minimal", "low", "medium", "high", "xhigh", "max"):
            raise ValueError("invalid benchmark Codex reasoning effort")
        if kwargs.get("reasoning_summary") not in (None, "auto", "concise", "detailed", "none"):
            raise ValueError("invalid benchmark Codex reasoning summary")
        if kwargs.get("mcp_servers"):
            raise ValueError("benchmark Codex cannot register additional MCP tools")
        if kwargs.get("command_model_name"):
            raise ValueError("benchmark Codex cannot override its model route")
        sources = [kwargs.pop(key, None) for key in ("config_toml", "config_toml_file", "config")]
        if sum(source is not None for source in sources) > 1:
            raise ValueError("provide only one Codex config source")
        inline, filename, config = sources
        if inline is not None:
            config = toml.loads(inline)
        elif filename is not None:
            config = toml.loads(Path(filename).read_text())
        elif config is not None and not isinstance(config, dict):
            config = toml.loads(Path(config).read_text())
        config = sealed_config(config or {})
        if config.get("model_reasoning_effort", kwargs["reasoning_effort"]) != kwargs["reasoning_effort"]:
            raise ValueError("Codex config and command reasoning effort differ")
        if config.get("model_reasoning_summary") not in (None, "auto", "concise", "detailed", "none"):
            raise ValueError("invalid benchmark Codex config reasoning summary")
        kwargs["config_toml" if FRAMEWORK == "pier" else "config"] = toml.dumps(config) if FRAMEWORK == "pier" else config
        if kwargs.get("extra_env"):
            if any(key.startswith("CODEX_") or key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "PATH")
                   for key in kwargs["extra_env"]):
                raise ValueError("benchmark Codex cannot override its execution or proxy environment")
            kwargs["extra_env"] = {key: value for key, value in kwargs["extra_env"].items()
                                   if key not in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_BASE")}
        super().__init__(logs_dir=logs_dir, model_name=model_name or DEFAULT_MODEL, **kwargs)
        self._pool = accounts.Pool.from_environment({**os.environ, accounts.ALLOWLIST_VARIABLE:
            os.environ.get(accounts.ALLOWLIST_VARIABLE, accounts.BENCHMARK_POOL)})
        self._account: accounts.Account | None = None
        self._requeues: list[dict[str, Any]] = []
        self._metadata: dict[str, Any] = {}
        self._sandbox_invocations = 0

    async def exec_as_agent(self, environment: BaseEnvironment, command: str, **kwargs: Any):
        # Keep the stock agent's auth, logging and command construction. Its
        # generated invocation is the one boundary that disables its sandbox.
        command, replaced = re.subn(
            r"(\bcodex exec (?:resume --last )?)--dangerously-bypass-approvals-and-sandbox\s+",
            r"\1--sandbox workspace-write -c sandbox_workspace_write.network_access=false ", command, count=1)
        argv = shlex.split(command)
        native = next((n for n in range(len(argv) - 1) if argv[n:n + 2] == ["codex", "exec"]), None)
        if native is not None:
            flags = argv[native + 2:argv.index("--", native + 2)] if "--" in argv[native + 2:] else []
            if ("--dangerously-bypass-approvals-and-sandbox" in argv or
                "--sandbox" not in flags or flags[flags.index("--sandbox") + 1:flags.index("--sandbox") + 2] != ["workspace-write"] or
                flags.count("--sandbox") != 1 or "sandbox_workspace_write.network_access=false" not in flags or
                any(flag.startswith("sandbox_workspace_write.network_access=") and flag != "sandbox_workspace_write.network_access=false" for flag in flags)):
                raise RuntimeError("unsupported stock Codex invocation: sandbox seal cannot be enforced")
            self._sandbox_invocations += 1
        elif replaced or "--dangerously-bypass-approvals-and-sandbox" in command:
            raise RuntimeError("unsupported stock Codex invocation contains a sandbox bypass")
        return await super().exec_as_agent(environment, command=command, **kwargs)

    @staticmethod
    def name() -> str:
        return "codex"

    def network_allowlist(self):
        if FRAMEWORK != "pier":
            return None
        try:
            from pier.models.agent.network import NetworkAllowlist
        except ImportError:
            return None
        return NetworkAllowlist()

    def _get_env(self, key: str, *alternatives: str) -> str | None:
        if key in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
            return None
        return super()._get_env(key, *alternatives)

    def _resolve_env(self, key: str, *alternatives: str) -> tuple[str, str] | None:
        if any(name in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_BASE") for name in (key, *alternatives)):
            return None
        return super()._resolve_env(key, *alternatives)

    def build_process_env(self, *args: Any, **kwargs: Any) -> dict[str, str]:
        env = super().build_process_env(*args, **kwargs)
        for key in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
            env.pop(key, None)
        return env

    async def setup(self, environment: BaseEnvironment) -> None:
        # Waits here while the pool is paused, before the CLI is installed.
        self._account = await self._pool.lease_async(self.logs_dir.parent.name)
        self._write_account()
        await super().setup(environment)

    def _write_account(self, **extra: Any) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / ACCOUNT_FILE).write_text(json.dumps(
            {"account": self._account.label if self._account else None, "model": self.model_name,
             "version": self._version, "requeues": self._requeues, **extra}, indent=2))

    def _resolve_auth_json_path(self) -> Path | None:
        if self._account is None:
            raise RuntimeError("PooledCodex.run before setup: no account leased")
        return self._account.auth

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        attempt = 0
        while True:
            attempt += 1
            self._sandbox_invocations = 0
            failure: BaseException | None = None
            try:
                await super().run(SANDBOX_PROBE_INSTRUCTION + instruction, environment, context)
            except Exception as error:  # a dry seat may surface as a failed command
                failure = error
            output = self.logs_dir / self._OUTPUT_FILENAME
            await self._fetch_output(environment, output)
            try:
                text = output.read_text(errors="replace")
            except OSError:
                text = ""
            limit = usage_limit_in(text) or (usage_limit_in(str(failure)) if failure else None)
            if limit is None:
                reached = container_commands(text)
                seal = sandbox_proof(text, sandbox_invoked=self._sandbox_invocations > 0)
                self._metadata = {"account": self._account.label if self._account else None,
                                  "model": self.model_name, "version": self._version,
                                  "attempt": attempt, "requeues": self._requeues, "container_commands": reached,
                                  "benchmark_seal": seal}
                self._write_account(attempt=attempt, containerCommands=reached, benchmark_seal=seal)
                if failure is not None:
                    raise failure
                break
            assert self._account is not None
            reset_at = accounts.reset_time_of(text) or accounts.reset_time_of(str(failure))
            previous = self._account.label
            self._pool.disable(previous, limit, reset_at)
            if output.is_file():
                shutil.move(str(output), str(self.logs_dir / f"codex-attempt-{attempt}.txt"))
            await self._fetch_sessions(environment)
            spent = session_usage(self.logs_dir / "sessions")
            if (self.logs_dir / "sessions").exists():
                shutil.move(str(self.logs_dir / "sessions"), str(self.logs_dir / f"sessions-attempt-{attempt}"))
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            with (self.logs_dir / "requeue.log").open("a", encoding="utf-8") as log:
                log.write(f"{now} attempt {attempt} on {previous} ended in a usage limit (resets {reset_at or 'unknown'}): {limit}\n")
            self._requeues.append({"attempt": attempt, "from": previous, "to": None,
                                   "cause": limit, "resetAt": reset_at, "usage": spent})
            self._write_account(attempt=attempt)
            self._account = await self._pool.lease_async(self.logs_dir.parent.name)
            self._requeues[-1]["to"] = self._account.label
            self._write_account()
            with (self.logs_dir / "requeue.log").open("a", encoding="utf-8") as log:
                log.write(f"{now} requeued as attempt {attempt + 1} on {self._account.label}\n")
        reached = container_commands(text)
        self._write_account(attempt=attempt, containerCommands=reached, benchmark_seal=self._metadata["benchmark_seal"])
        # Kept off the context until Harbor has filled it: Harbor reads the
        # session's token usage only into an empty context.
        if reached["succeeded"] == 0:
            raise accounts.ContainerUnreachable(
                f"codex ran no command with exit 0 in the task container ({reached['attempted']} attempted)")

    def populate_context_post_run(self, context: AgentContext) -> None:
        """Harbor's usage and trajectory from the Codex session, then the pool's
        record. Harbor calls this after `run`, raised or not, only while the
        context is still empty."""
        try:
            super().populate_context_post_run(context)
        except ValueError as error:
            # Stock parsers assume exactly one leaf directory. Multiple Codex
            # sessions still have valid independent token receipts.
            self.logger.warning("Codex trajectory unavailable: %s", error)
        usage = session_usage(self.logs_dir / "sessions")
        for name in ("n_input_tokens", "n_cache_tokens", "n_output_tokens"):
            # No receipt is unknown usage, never an invented zero from ATIF.
            setattr(context, name, usage[name])
        metadata = {"account": self._account.label if self._account else None,
                    "model": self.model_name, "version": self._version,
                    "benchmark_seal": sandbox_proof("", sandbox_invoked=False),
                    **self._metadata, **usage}
        context.metadata = {**(context.metadata or {}), **metadata}
        self._write_account(**{key: value for key, value in metadata.items() if key not in ("account", "model", "version", "requeues")})

    async def _fetch_sessions(self, environment: BaseEnvironment) -> None:
        if getattr(getattr(environment, "capabilities", None), "mounted", True):
            return
        try:
            await environment.download_dir("/logs/agent/sessions", self.logs_dir / "sessions")
        except Exception:
            pass

    async def _fetch_output(self, environment: BaseEnvironment, output: Path) -> None:
        """On an environment that does not mount the logs directory (plue),
        the CLI's output is still in the container when `run` returns; the
        runner copies it only afterwards. Fetch it now so the usage-limit
        check and the container gate read what the CLI printed."""
        capabilities = getattr(environment, "capabilities", None)
        if getattr(capabilities, "mounted", True):
            return
        try:
            await environment.download_file(f"/logs/agent/{self._OUTPUT_FILENAME}", output)
        except Exception:  # absent when the CLI never started; the gate then sees nothing
            pass
