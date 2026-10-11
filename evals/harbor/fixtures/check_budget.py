"""Offline checks of what keeps the pair equal: the time budget and the effort.

    python3 fixtures/check_budget.py

The 2026-09-26 runs gave this arm 3,600 s on every trial while the stock Codex
arm got the task's own agent timeout (5,400 s on DeepSWE 1.1), because the
budget fell back to a default nobody chose. What is pinned:

  - With no `budget_sec`, a real `SmithersAgent.run()` hands the CLI the agent
    timeout the runner enforces, less a minute: the task's `[agent]
    timeout_sec` through the trial's override, cap and multipliers, by the
    rule Harbor and Pier share. An explicit `budget_sec` is used as given.
  - A timeout that cannot be found is refused before the CLI starts. 3,600 s
    is never assumed.
  - The budget, its source and the requested effort are on the trial's record
    (`smithers-run.json`) and in its result metadata.
  - Blindness holds: of the task directory the run opens `task.toml` and
    nothing else, and lists no directory; with an explicit budget or a trial
    override it opens nothing there at all.
  - Both arms run at `xhigh` unless the run names another effort
    (`--ak reasoning_effort=`). For this arm a spelling the harness would
    silently read as `high` is refused. The stock Codex arm, checked when a
    runner is importable, passes the effort to the CLI and records both the
    effort asked for and the effort each turn of the session ran at.
  - When a runner is importable (HARBOR_PYTHON), the adapter's copy of the
    timeout rule agrees with the runner's own function over its own config
    model and path classes, so a runner upgrade that moves either is caught.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import sys
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import smithers_agent as agent  # noqa: E402
from check_agent import DDL  # noqa: E402

MODEL = "openai/gpt-6.1-sol"
CONTAINER = "c1"
DEEPSWE = "[metadata]\nname = 'task'\n\n[verifier]\ntimeout_sec = 1800.0\n\n[agent]\ntimeout_sec = 5400.0\n"
# Pier writes the whole trial config; Harbor leaves out every default.
PIER = {"timeout_multiplier": 1.0, "agent_timeout_multiplier": None,
        "agent": {"override_timeout_sec": None, "max_timeout_sec": None, "kwargs": {}}}
HARBOR = {"agent": {"name": "evals.harbor.smithers_agent:SmithersAgent", "model_name": MODEL}}

# Every file the process opens and every directory it lists, while armed.
_seen: list[str] = []
_armed = False


def _audit(event: str, args: tuple) -> None:
    if _armed and event in ("open", "os.listdir", "os.scandir") and args and isinstance(args[0], (str, bytes, os.PathLike)):
        _seen.append(os.path.realpath(os.fsdecode(args[0])))


sys.addaudithook(_audit)


class Driven(agent.SmithersAgent):
    """The real agent with the CLI replaced: records the budget `_drive` was
    given and leaves the journal of a run that reached the container."""

    def _drive(self, workspace: Path, env: dict[str, str], budget: float) -> tuple[int, str]:
        self.driven = budget
        flows = workspace / ".flows"
        flows.mkdir()
        connection = sqlite3.connect(flows / "control.db")
        connection.execute(DDL)
        events = [
            ("control.agent.turn-opened", {"seat": self.seat}),
            ("control.agent.cell-call-started", {"callId": "k1", "flowName": "bash",
                                                 "input": {"container": env["SMITHERS_BASH_CONTAINER"], "command": "ls"}}),
            ("control.agent.cell-call-settled", {"callId": "k1", "flowName": "bash", "outcome": "success",
                                                 "value": {"exitCode": 0}}),
            ("control.run.completed", {}),
        ]
        for index, (kind, payload) in enumerate(events):
            connection.execute("insert into flows_journal_events values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                               ("run-1", index, f"run-1-{index}", "fixture", index, 1_700_000_000_000 + index, kind,
                                json.dumps(payload), "{}"))
        connection.commit()
        connection.close()
        return 0, "run"


class Environment:
    """What a runner's environment exposes to an agent, and no more."""

    session_id = "task__abc__env"
    task_env_config = types.SimpleNamespace(workdir="/app")

    def __init__(self, environment_dir: Path) -> None:
        self.environment_dir = environment_dir

    async def exec(self, command, cwd=None, env=None, timeout_sec=None, **_):
        return types.SimpleNamespace(return_code=0, stdout="", stderr="")


def trial(root: Path, *, task_toml: str | None = DEEPSWE, config: dict | None = HARBOR, **kwargs):
    """One trial of one task, laid out as both runners lay it out, run through
    `SmithersAgent.run()`. Returns the agent, the context, the record and the
    paths the run touched inside the task directory."""
    global _armed
    task = root / "task"
    for name, text in (("instruction.md", "do it"), ("tests/test_outputs.py", "assert False"),
                       ("solution/solve.sh", "exit 0"), ("environment/Dockerfile", "FROM scratch")):
        (task / name).parent.mkdir(parents=True, exist_ok=True)
        (task / name).write_text(text)
    if task_toml is not None:
        (task / "task.toml").write_text(task_toml)
    logs = root / "jobs" / "task__abc" / "agent"
    logs.mkdir(parents=True)
    if config is not None:
        (logs.parent / "config.json").write_text(json.dumps(config))
    driven = Driven(logs_dir=logs, model_name=MODEL, **kwargs)
    driven.driven = None
    context = types.SimpleNamespace()
    del _seen[:]
    _armed = True
    try:
        asyncio.run(driven.run("Fix the bug.", Environment(task / "environment"), context))
    finally:
        _armed = False
    record = json.loads((logs / "smithers-run.json").read_text())
    return driven, context, record, task_reads(root)


def task_reads(root: Path) -> list[str]:
    """What the last run opened or listed in the task directory, `.` being
    the directory itself."""
    task = os.path.realpath(root / "task")
    return sorted({os.path.relpath(path, task) for path in _seen if path == task or path.startswith(task + os.sep)})


def refused(root: Path, **given) -> str:
    """The refusal of a trial whose agent timeout cannot be found."""
    try:
        trial(root, **given)
    except agent.BudgetUnknown as error:
        assert not (root / "jobs" / "task__abc" / "agent" / "smithers-run.json").exists(), "refused before the CLI starts"
        assert set(task_reads(root)) <= {"task.toml"}, f"a refusal looked at {task_reads(root)} in the task directory"
        return str(error)
    raise AssertionError(f"a trial with no findable agent timeout must be refused, never run at a default: {given}")


def check_budget() -> None:
    cases = [
        # name, trial arguments, budget, source, the runner's agent timeout, task files opened
        ("the task's own timeout, Pier's config", {"config": PIER}, 5340.0, "task.toml", 5400.0, ["task.toml"]),
        ("the task's own timeout, Harbor's config", {"config": HARBOR}, 5340.0, "task.toml", 5400.0, ["task.toml"]),
        ("--agent-timeout-multiplier wins over --timeout-multiplier",
         {"config": {**PIER, "agent_timeout_multiplier": 2.0, "timeout_multiplier": 3.0}}, 10740.0, "task.toml", 10800.0, ["task.toml"]),
        ("--timeout-multiplier alone", {"config": {**HARBOR, "timeout_multiplier": 1.5}}, 8040.0, "task.toml", 8100.0, ["task.toml"]),
        ("the cap applies before the multiplier",
         {"config": {"timeout_multiplier": 2.0, "agent": {"max_timeout_sec": 3000.0}}}, 5940.0, "task.toml", 6000.0, ["task.toml"]),
        ("the trial's override replaces the task's timeout, which is then not read",
         {"config": {"agent": {"override_timeout_sec": 1800.0}}}, 1740.0, "override_timeout_sec", 1800.0, []),
        ("a short timeout keeps a minute of budget", {"task_toml": "[agent]\ntimeout_sec = 90\n"}, 60.0, "task.toml", 90.0, ["task.toml"]),
        ("an explicit budget is used as given", {"budget_sec": "900"}, 900.0, "budget_sec", None, []),
        ("an explicit budget needs no task timeout", {"task_toml": None, "config": None, "budget_sec": 1200}, 1200.0, "budget_sec", None, []),
        ("a runner that hands over its timeout is believed", {"task_toml": None, "config": None, "agent_timeout_sec": "5400"},
         5340.0, "agent_timeout_sec", 5400.0, []),
    ]
    for name, given, budget, source, timeout, opened in cases:
        with tempfile.TemporaryDirectory() as directory:
            driven, context, record, reads = trial(Path(directory), **given)
        assert driven.driven == budget, f"{name}: the CLI was given {driven.driven}, not {budget}"
        assert (record["budgetSec"], record["budgetSource"], record["agentTimeoutSec"]) == (budget, source, timeout), (name, record)
        metadata = context.metadata
        assert (metadata["budget_sec"], metadata["budget_source"], metadata["agent_timeout_sec"]) == (budget, source, timeout), \
            (name, metadata)
        assert reads == opened, f"{name}: the run touched {reads} in the task directory"

    for name, given in [
        ("task.toml declares no agent timeout", {"task_toml": "[agent]\nuser = 'root'\n"}),
        ("task.toml has no [agent] table", {"task_toml": "[metadata]\nname = 'task'\n"}),
        ("task.toml is missing", {"task_toml": None}),
        ("task.toml does not parse", {"task_toml": "[agent\ntimeout_sec ="}),
        ("the trial config is missing, so the multipliers are unknown", {"config": None}),
        ("the trial config does not parse", {"config": "not json"}),
    ]:
        with tempfile.TemporaryDirectory() as directory:
            message = refused(Path(directory), **given)
        assert "budget_sec" in message, f"{name}: the refusal names the way out: {message}"
        assert "3600" not in message and "3,600" not in message, name


def check_runner_rule() -> str:
    """The adapter's copy of the timeout rule against the installed runner's
    own: its config model written the way it writes `config.json`, its path
    classes, and the function that feeds its `asyncio.wait_for`."""
    try:
        try:
            from pier.models.task.paths import TaskPaths
            from pier.models.trial.config import AgentConfig, TaskConfig, TrialConfig
            from pier.models.trial.paths import TrialPaths
            from pier.trial.execution import TrialExecution

            def enforced(config, task_timeout):
                return TrialExecution._resolve_agent_timeout(
                    agent_config=config.agent, task_agent_timeout_sec=task_timeout,
                    timeout_multiplier=config.timeout_multiplier, agent_timeout_multiplier=config.agent_timeout_multiplier)

            runner, written = "Pier", {"indent": 4}
        except ImportError:
            from harbor.models.task.paths import TaskPaths
            from harbor.models.trial.config import AgentConfig, TaskConfig, TrialConfig
            from harbor.models.trial.paths import TrialPaths
            from harbor.trial.trial import Trial

            def enforced(config, task_timeout):
                trial = types.SimpleNamespace(config=config, task=types.SimpleNamespace(
                    config=types.SimpleNamespace(agent=types.SimpleNamespace(timeout_sec=task_timeout))))
                trial._resolve_timeout_sec = lambda **given: Trial._resolve_timeout_sec(trial, **given)
                return Trial._compute_agent_timeout_sec(trial)

            runner, written = "Harbor", {"indent": 4, "exclude_defaults": True}
    except ImportError:
        if os.environ.get("HARBOR_PYTHON"):
            raise
        return "not compared (no runner importable)"

    compared = 0
    with tempfile.TemporaryDirectory() as directory:
        task, paths = TaskPaths(Path(directory) / "task"), TrialPaths(trial_dir=Path(directory) / "jobs" / "task__abc")
        task.environment_dir.mkdir(parents=True)
        paths.agent_dir.mkdir(parents=True)
        for task_timeout in (None, 900.0, 5400.0):
            task.config_path.write_text("[agent]\n" + (f"timeout_sec = {task_timeout}\n" if task_timeout else ""))
            for override in (None, 1800.0):
                for cap in (None, 3000.0):
                    for multiplier in (1.0, 2.0):
                        for agent_multiplier in (None, 0.5, 3.0):
                            config = TrialConfig(task=TaskConfig(path=task.task_dir),
                                                 agent=AgentConfig(override_timeout_sec=override, max_timeout_sec=cap),
                                                 timeout_multiplier=multiplier, agent_timeout_multiplier=agent_multiplier)
                            paths.config_path.write_text(config.model_dump_json(**written))
                            theirs = enforced(config, task_timeout)
                            try:
                                ours = agent.enforced_agent_timeout(paths.agent_dir, Environment(task.environment_dir))[0]
                            except agent.BudgetUnknown:
                                ours = None
                            assert ours == theirs, (f"{runner} enforces {theirs} and the adapter found {ours}: task "
                                                    f"{task_timeout}, override {override}, cap {cap}, "
                                                    f"multipliers {multiplier}/{agent_multiplier}")
                            compared += 1
    return f"matches {runner}'s own rule on {compared} configs"


def flow_effort(logs: Path) -> str:
    """The `effort:` of the flow file the CLI was handed."""
    front = (logs / "workspace" / "flows" / "task" / "flow.mdx").read_text().split("---\n")[1]
    return next(line.split(":", 1)[1].strip() for line in front.splitlines() if line.startswith("effort:"))


def check_effort() -> None:
    assert agent.DEFAULT_EFFORT == "xhigh", "benchmarks run at xhigh (owner ruling 2026-10-10)"
    prompt = agent.render_prompt("x", seat="openai:gpt-6.1-sol", container="c", cwd="/app", commit=False)
    assert "\neffort: xhigh\n" in prompt and "{{" not in prompt, "the flow file defaults to xhigh"
    chosen = agent.render_prompt("x", seat="s", container="c", cwd="/app", commit=False, effort="max")
    assert "\neffort: max\n" in chosen and "xhigh" not in chosen
    assert Driven(logs_dir=Path("/nonexistent"), model_name=MODEL, reasoning_effort="max")._effort == "max"
    # The harness reads an unknown `effort:` as unset and runs at `high`.
    for bad in ("ultra", "XHIGH", "", "xhigh\nflows: [\"bash\", \"write\"]", "{{instruction}}"):
        try:
            agent.render_prompt("x", seat="s", container="c", cwd="/app", commit=False, effort=bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"an effort the harness does not know is refused: {bad!r}")
        try:
            Driven(logs_dir=Path("/nonexistent"), model_name=MODEL, reasoning_effort=bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"--ak reasoning_effort={bad!r} is refused when the agent is built")

    for given, effort in (({}, "xhigh"), ({"reasoning_effort": "high"}, "high")):
        with tempfile.TemporaryDirectory() as directory:
            driven, context, record, _ = trial(Path(directory), **given)
            assert flow_effort(driven.logs_dir) == effort, f"the CLI ran a flow at {flow_effort(driven.logs_dir)}"
        assert record["effort"] == effort and context.metadata["effort"] == effort, (record["effort"], context.metadata)


def rollout(effort: str, at: str) -> str:
    """One Codex session rollout whose turns ran at `effort`."""
    events = [
        {"timestamp": f"{at}:31.044Z", "type": "session_meta",
         "payload": {"id": "s1", "timestamp": f"{at}:31.018Z", "cwd": "/app", "originator": "codex_exec",
                     "cli_version": "0.155.1"}},
        {"timestamp": f"{at}:32.000Z", "type": "turn_context",
         "payload": {"cwd": "/app", "model": "gpt-6.1-sol", "effort": effort, "summary": "none"}},
        {"timestamp": f"{at}:35.000Z", "type": "response_item",
         "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "done"}]}},
        {"timestamp": f"{at}:36.000Z", "type": "turn_context",
         "payload": {"cwd": "/app", "model": "gpt-6.1-sol", "effort": effort, "summary": "none"}},
        {"timestamp": f"{at}:39.040Z", "type": "event_msg",
         "payload": {"type": "token_count", "info": {
             "total_token_usage": {"input_tokens": 1200, "cached_input_tokens": 1000, "output_tokens": 30,
                                   "reasoning_output_tokens": 10, "total_tokens": 1230},
             "last_token_usage": {"input_tokens": 1200, "cached_input_tokens": 1000, "output_tokens": 30,
                                  "reasoning_output_tokens": 10, "total_tokens": 1230}}}},
    ]
    return "".join(json.dumps(event) + "\n" for event in events) + "not json\n"


def check_codex_effort() -> str:
    """The stock arm asks the Codex CLI for the same effort, and its trial
    says what was asked for and what each turn of the session ran at."""
    sys.path.insert(0, str(HERE.parent.parent.parent))
    try:
        from evals.harbor import codex_pool
    except ImportError:
        if os.environ.get("HARBOR_PYTHON"):
            raise
        return "not checked (no runner importable)"

    with tempfile.TemporaryDirectory() as directory:
        logs = Path(directory) / "agent"
        sessions = logs / "sessions" / "2026" / "10" / "10"
        sessions.mkdir(parents=True)
        assert codex_pool.session_efforts(logs / "sessions") == [] and codex_pool.session_efforts(logs / "none") == []
        (sessions / "rollout-2026-10-10T09-45-31-s1.jsonl").write_text(rollout("xhigh", "2026-10-10T09:45"))
        (logs / "codex.txt").write_text('{"type":"item.completed","item":{"type":"command_execution","exit_code":0}}\n')
        home = Path(directory) / "seat"
        home.mkdir()
        (home / "auth.json").write_text("{}")
        seat = codex_pool.accounts.Account("codex-2", home)

        pooled = codex_pool.PooledCodex(logs_dir=logs, model_name=MODEL)
        assert "model_reasoning_effort=xhigh" in pooled.build_cli_flags(), pooled.build_cli_flags()
        told = codex_pool.PooledCodex(logs_dir=logs, model_name=MODEL, reasoning_effort="max")
        assert "model_reasoning_effort=max" in told.build_cli_flags() and "xhigh" not in told.build_cli_flags()

        pooled._pool = types.SimpleNamespace(lease=lambda trial="": seat)
        pooled._account = seat  # what setup() leases before the CLI is installed

        async def ran(self, instruction, environment, context):  # the CLI already ran in the container
            return None

        original = codex_pool.Codex.run
        codex_pool.Codex.run = ran
        try:
            context = codex_pool.AgentContext()
            environment = types.SimpleNamespace(capabilities=types.SimpleNamespace(mounted=True))
            asyncio.run(pooled.run("fix it", environment, context))
        finally:
            codex_pool.Codex.run = original
        pooled.populate_context_post_run(context)
        assert context.metadata["reasoning_effort"] == "xhigh", context.metadata
        assert context.metadata["efforts"] == ["xhigh"], "the effort each turn ran at is read off the session"
        assert context.metadata["container_commands"] == {"attempted": 1, "succeeded": 1}, "the pool's record is kept"
        assert json.loads((logs / "codex-account.json").read_text())["reasoningEffort"] == "xhigh"

        # A session that did not run at the effort asked for says so.
        later = logs / "sessions" / "2026" / "10" / "11"
        later.mkdir()
        (later / "rollout-2026-10-11T09-45-31-s2.jsonl").write_text(rollout("high", "2026-10-11T09:45"))
        assert codex_pool.session_efforts(logs / "sessions") == ["xhigh", "high"]
    return "checked"


if __name__ == "__main__":
    os.environ["SMITHERS_BENCH_CONTAINER"] = CONTAINER
    with tempfile.TemporaryDirectory() as empty:
        os.environ["SMITHERS_ROOT"] = empty  # no checkout: the revision and the fingerprint are simply absent
        check_budget()
        check_effort()
    rule = check_runner_rule()
    codex = check_codex_effort()
    print(f"check_budget.py: the budget follows the task's agent timeout under both runners' configs, an unknown "
          f"timeout is refused, the task directory stays unread but for task.toml, and the flow defaults to xhigh; "
          f"timeout rule {rule}; codex arm effort {codex}.")
