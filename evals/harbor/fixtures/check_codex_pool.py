"""Account and stock Codex regressions, with no model or container invocation.

Account/session fixtures use temporary files. Runner compatibility tests import
real Harbor/Pier classes and replace only the remote environment execution seam;
no model call or VM is necessary to validate command/auth/context behavior.
Run with either framework's Python to exercise that framework's stock agent.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from evals.harbor import accounts
try:
    from evals.harbor import codex_pool as pool
except ImportError:
    pool = None


def login(root: Path, label: str) -> accounts.Account:
    home = root / (".codex" if label == "default" else f".smithers/accounts/{label}")
    home.mkdir(parents=True, exist_ok=True)
    (home / "auth.json").write_text("{}")
    return accounts.Account(label, home)


def token(input: int = 100, cached: int = 70, output: int = 30, reasoning: int = 20,
          percent: float = 10, *, info: bool = True, timestamp: str = "2026-10-02T10:00:00Z") -> dict:
    return {"type": "event_msg", "timestamp": timestamp, "payload": {
        "type": "token_count", "info": {"total_token_usage": {
            "input_tokens": input, "cached_input_tokens": cached, "output_tokens": output,
            "reasoning_output_tokens": reasoning, "total_tokens": input + output},
            "last_token_usage": {"input_tokens": input, "cached_input_tokens": cached, "output_tokens": output,
                                 "reasoning_output_tokens": reasoning}} if info else None,
        "rate_limits": {"primary": {"used_percent": percent, "resets_at": 1790950000}}}}


def session(path: Path, id: str, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row) for row in [
        {"type": "session_meta", "payload": {"id": id, "cli_version": "0.160.0"}},
        {"type": "turn_context", "payload": {"model": "gpt-6.1-sol"}},
        {"type": "response_item", "timestamp": "2026-10-02T10:00:00Z", "payload": {
            "type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "done"}]}},
        *rows]) + "\n")


class AccountTests(unittest.TestCase):
    def test_remote_accounts_directory_and_rediscovery_never_use_local_accounts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / "local"
            login(local, "codex-1")
            login(local, "default")
            remote = root / "remote-accounts"
            remote.mkdir()
            env = {accounts.ACCOUNTS_DIR_VARIABLE: str(remote), accounts.ALLOWLIST_VARIABLE: "codex-1,codex-3",
                   accounts.WAIT_VARIABLE: "0"}
            with patch.object(Path, "home", return_value=local):
                wheel = accounts.Pool.from_environment(env)
                self.assertEqual(wheel.state_path, remote / "pool.json")
                with self.assertRaises(accounts.NoSeatLeft):
                    wheel.lease()
                with self.assertRaises(ValueError):
                    accounts.Pool.from_environment({**env, accounts.ALLOWLIST_VARIABLE: "default"})
                seat = remote / "codex-1"
                seat.mkdir()
                (seat / "auth.json").write_text("{}")
                leased = wheel.lease()
                self.assertEqual(leased.home, seat)
                self.assertEqual(leased.auth, seat / "auth.json")
                # Capture the directory once, including after rediscovery.
                env[accounts.ACCOUNTS_DIR_VARIABLE] = str(local)
                self.assertEqual(wheel.lease().home, seat)
                with self.assertRaises(ValueError):
                    accounts.Pool.from_environment({accounts.ACCOUNTS_DIR_VARIABLE: " ", accounts.WAIT_VARIABLE: "0"})
                with self.assertRaises(ValueError):
                    accounts.Pool.from_environment({accounts.WAIT_VARIABLE: "0"})

    def test_discovery_and_allowlist_without_reading_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            for label in ("default", "codex-1", "codex-2", "codex-3", "codex-acct-1"):
                login(home, label)
            login(home, "claude-1")
            (home / ".smithers/accounts/codex-missing").mkdir()
            self.assertEqual([a.label for a in accounts.discover(home)],
                             ["default", "codex-1", "codex-2", "codex-3", "codex-acct-1"])
            with patch.object(Path, "home", return_value=home):
                env = {accounts.ALLOWLIST_VARIABLE: " codex-1,codex-3,codex-acct-1,codex-1 ",
                       accounts.ACCOUNTS_DIR_VARIABLE: str(home / ".smithers/accounts"),
                       accounts.WAIT_VARIABLE: "0", accounts.STATE_VARIABLE: str(home / "pool.json")}
                wheel = accounts.Pool.from_environment(env)
                self.assertEqual([wheel.lease().label for _ in range(4)],
                                 ["codex-1", "codex-3", "codex-acct-1", "codex-1"])
                # Rediscovery adds allowed logins but never expands the captured
                # allowlist when a new login or an environment change appears.
                login(home, "codex-4")
                env[accounts.ALLOWLIST_VARIABLE] = "codex-4"
                self.assertNotIn("codex-4", [wheel.lease().label for _ in range(5)])

    def test_missing_empty_and_exhausted_allowlist_never_fall_back(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            login(home, "default")
            login(home, "codex-2")
            with patch.object(Path, "home", return_value=home):
                for value in ("", " , ", "codex-1", "codex-1,codex-3"):
                    with self.subTest(value=value):
                        wheel = accounts.Pool.from_environment({accounts.ALLOWLIST_VARIABLE: value,
                            accounts.ACCOUNTS_DIR_VARIABLE: str(home / ".smithers/accounts"),
                            accounts.WAIT_VARIABLE: "0", accounts.STATE_VARIABLE: str(home / "pool.json")})
                        with self.assertRaises(accounts.NoSeatLeft):
                            wheel.lease()
                        self.assertIsNotNone(wheel.paused())
                one = login(home, "codex-1")
                wheel = accounts.Pool.from_environment({accounts.ALLOWLIST_VARIABLE: "codex-1",
                    accounts.ACCOUNTS_DIR_VARIABLE: str(home / ".smithers/accounts"),
                    accounts.WAIT_VARIABLE: "0", accounts.STATE_VARIABLE: str(home / "single.json")})
                self.assertEqual(wheel.lease(), one)
                wheel.disable(one.label, "usage limit")
                with self.assertRaises(accounts.NoSeatLeft):
                    wheel.lease()
                wheel.enable(one.label)
                self.assertEqual(wheel.lease(), one)

    def test_new_allowed_login_and_expired_reset_recover(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            with patch.object(Path, "home", return_value=home):
                wheel = accounts.Pool.from_environment({accounts.ALLOWLIST_VARIABLE: "codex-1",
                    accounts.ACCOUNTS_DIR_VARIABLE: str(home / ".smithers/accounts"),
                    accounts.WAIT_VARIABLE: "0", accounts.STATE_VARIABLE: str(home / "pool.json")})
                with self.assertRaises(accounts.NoSeatLeft):
                    wheel.lease()
                one = login(home, "codex-1")
                self.assertEqual(wheel.lease(), one)
                wheel.disable(one.label, "usage limit", "2000-01-01T00:00:00+00:00")
                self.assertEqual(wheel.lease(), one)
                self.assertEqual(wheel.disabled(), {})
                self.assertIsNone(wheel.paused())

    def test_allowlist_boundary_validation(self):
        self.assertIsNone(accounts.allowlist({}))
        self.assertEqual(accounts.allowlist({accounts.ALLOWLIST_VARIABLE: "default,codex-acct-1"}),
                         frozenset(("default", "codex-acct-1")))
        for label in ("../codex-1", "codex-1/auth.json", "claude-1", "codex-", "CODEx-1"):
            with self.subTest(label=label), self.assertRaises(ValueError):
                accounts.allowlist({accounts.ALLOWLIST_VARIABLE: label})

    def test_benchmark_pool_rejects_reserved_labels_even_when_logged_in(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in ("codex-1", "codex-2", "codex-3", "codex-4", "codex-5", "codex-acct-1"):
                login(root, label)
            env = {accounts.ACCOUNTS_DIR_VARIABLE: str(root / ".smithers/accounts"),
                   accounts.STATE_VARIABLE: str(root / "pool.json"), accounts.WAIT_VARIABLE: "0"}
            for reserved in ("codex-2", "codex-4", "codex-5", "default", "codex-1,codex-2", "codex-3,codex-5"):
                with self.subTest(reserved=reserved), self.assertRaises(ValueError):
                    accounts.Pool.from_environment({**env, accounts.ALLOWLIST_VARIABLE: reserved})
                self.assertFalse((root / "pool.json").exists(), "reject before any lease is recorded")
            wheel = accounts.Pool.from_environment(env)
            self.assertEqual([wheel.lease().label for _ in range(3)], ["codex-1", "codex-3", "codex-acct-1"])
            subset = accounts.Pool.from_environment({**env, accounts.ALLOWLIST_VARIABLE: "codex-3"})
            self.assertEqual(subset.lease().label, "codex-3")
            empty = accounts.Pool.from_environment({**env, accounts.ALLOWLIST_VARIABLE: ""})
            with self.assertRaises(accounts.NoSeatLeft):
                empty.lease()
            self.assertIsNotNone(empty.paused())

    def test_async_leases_match_healthy_sync_rotation_and_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seats = [login(root, label) for label in ("codex-1", "codex-3")]
            sync = accounts.Pool(seats, root / "sync.json", wait_sec=0)
            asynchronous = accounts.Pool(seats, root / "async.json", wait_sec=0)
            async def take():
                return [(await asynchronous.lease_async(f"t{n}")).label for n in range(4)]
            self.assertEqual(asyncio.run(take()), [sync.lease(f"t{n}").label for n in range(4)])
            self.assertEqual([row["trial"] for row in asynchronous._load()["leases"]], ["t0", "t1", "t2", "t3"])
            now = [1000.0]
            sleeps = []
            empty = accounts.Pool([], root / "empty.json", wait_sec=125, clock=lambda: now[0])
            async def advance(seconds):
                sleeps.append(seconds)
                now[0] += seconds
            with patch.object(accounts.asyncio, "sleep", side_effect=advance):
                with self.assertRaises(accounts.NoSeatLeft):
                    asyncio.run(empty.lease_async("empty"))
            self.assertEqual(sleeps, [60, 60, 5])
            self.assertEqual(empty._load().get("leases", []), [])
            self.assertIsNotNone(empty.paused())

    def test_async_wait_recovers_on_reenabled_seat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seat = login(root, "codex-1")
            wheel = accounts.Pool([seat], root / "pool.json")
            wheel.disable(seat.label, "limit")
            async def enable(seconds):
                self.assertEqual(seconds, accounts.POLL_SEC)
                wheel.enable(seat.label)
            with patch.object(accounts.asyncio, "sleep", side_effect=enable):
                self.assertEqual(asyncio.run(wheel.lease_async("recovered")), seat)
            self.assertIsNone(wheel.paused())
            self.assertEqual(len(wheel._load()["leases"]), 1)


@unittest.skipIf(pool is None, "install Harbor or Pier to check the stock adapter")
class SessionTests(unittest.TestCase):
    def test_sandbox_seal_requires_actual_denied_shell_tool_probe(self):
        command = "/bin/bash -lc " + __import__("shlex").quote(pool.SANDBOX_PROBE_COMMAND)
        def event(code=7, output="curl: (7) socket: Operation not permitted", **extra):
            return json.dumps({"type": "item.completed", "item": {"type": "command_execution",
                "command": command, "exit_code": code, "aggregated_output": output, **extra}})
        receipt = pool.sandbox_proof(event(), sandbox_invoked=True)
        self.assertTrue(receipt["sealed"])
        self.assertEqual(receipt["sealed_by"], "codex-sandbox")
        self.assertEqual(receipt["sandbox_probe"]["source"], "codex-shell-tool")
        self.assertTrue(receipt["sandbox_probe"]["denied"])
        zsh_command = "/bin/zsh -lc " + __import__("shlex").quote(pool.SANDBOX_PROBE_COMMAND)
        self.assertTrue(pool.sandbox_proof(event(command=zsh_command), sandbox_invoked=True)["sealed"])
        self.assertFalse(pool.sandbox_proof(event(), sandbox_invoked=False)["sealed"])
        self.assertFalse(pool.sandbox_proof("", sandbox_invoked=True)["sealed"])
        self.assertFalse(pool.sandbox_proof(event() + "\nerror running Landlock", sandbox_invoked=True)["sealed"])
        for code, output in ((0, "example page"), (28, "Operation timed out"),
                             (7, "Connection refused"), (60, "SSL certificate problem"), (False, "permission denied")):
            with self.subTest(code=code, output=output):
                self.assertFalse(pool.sandbox_proof(event(code, output), sandbox_invoked=True)["sealed"])
        for changed in ({"type": "agent_message"}, {"command": "echo " + pool.SANDBOX_PROBE_COMMAND},
                        {"command": pool.SANDBOX_PROBE_COMMAND + " || true"}, {"command": "curl https://unrelated.com"},
                        {"command": "'unterminated"}, {"aggregated_output": None}):
            with self.subTest(changed=changed):
                self.assertFalse(pool.sandbox_proof(event(**changed), sandbox_invoked=True)["sealed"])
        dns_denied = event(6, "curl: (6) Could not resolve host: example.com")
        self.assertFalse(pool.sandbox_proof(dns_denied, sandbox_invoked=True)["sealed"])
        for sequence in (event() + "\n" + event(0, "example page"), event(0, "example page") + "\n" + event()):
            self.assertFalse(pool.sandbox_proof(sequence, sandbox_invoked=True)["sealed"])
    def test_cumulative_duplicates_multi_session_and_rate_only_events(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [token(100, 70, 30, 20, 10), token(150, 100, 50, 30, 11,
                    timestamp="2026-10-02T10:02:00Z")]
            session(root / "2026/10/02/first.jsonl", "one", rows + [rows[-1]])
            session(root / "copy/first.jsonl", "one", rows)
            session(root / "2026/10/03/second.jsonl", "two", [
                token(60, 0, 10, 0, 12, timestamp="2026-10-03T10:00:00Z"),
                token(percent=13, info=False, timestamp="2026-10-03T10:03:00Z")])
            result = pool.session_usage(root)
            self.assertEqual((result["n_input_tokens"], result["n_cache_tokens"], result["n_output_tokens"]),
                             (210, 100, 60))
            self.assertEqual(result["reasoning_output_tokens"], 30)
            self.assertEqual(result["sessions"], 2)
            self.assertEqual(result["models"], ["gpt-6.1-sol"])
            self.assertEqual((result["primary_used_percent_first"], result["primary_used_percent_last"]), (10, 13))
            self.assertEqual(result["resets_at"], 1790950000)
            self.assertEqual([(r["input"], r["cached"], r["output"]) for r in result["request_usage"]],
                             [(100, 70, 30), (50, 30, 20), (60, 0, 10)])
            self.assertFalse(result["metering_complete"], "the second last-usage fixture does not match its cumulative delta")

    def test_request_deltas_and_context_tier_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = token(300000, 100000, 50, 30)
            second = token(300050, 100020, 70, 35)
            second["payload"]["info"]["last_token_usage"] = {
                "input_tokens": 50, "cached_input_tokens": 20, "output_tokens": 20, "reasoning_output_tokens": 5}
            session(root / "one.jsonl", "one", [first, second, second])
            result = pool.session_usage(root)
            self.assertEqual([request["context_input"] for request in result["request_usage"]], [300000, 50])
            self.assertTrue(result["metering_complete"])
            self.assertEqual(sum(request["input"] for request in result["request_usage"]), result["n_input_tokens"])
            # A resumed file that lacks the earlier request retains totals but
            # cannot claim exact context-tier pricing for all its usage.
            session(root / "one.jsonl", "one", [second])
            result = pool.session_usage(root)
            self.assertEqual(result["request_usage"][0]["context_input"], 50)
            self.assertEqual(result["request_usage"][0]["input"], 300050)
            self.assertFalse(result["metering_complete"])

    def test_truncated_invalid_and_missing_usage_are_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertIsNone(pool.session_usage(root)["n_input_tokens"])
            bad = [token(-1), token(cached=101), token(reasoning=31), token(input=True), token(input=2.5)]
            session(root / "one.jsonl", "one", bad + [token(info=False)])
            with (root / "one.jsonl").open("a") as handle:
                handle.write('null\n[]\n{"payload": []}\n{"type":')
            self.assertIsNone(pool.session_usage(root)["n_output_tokens"])
            self.assertEqual(pool.session_usage(root)["primary_used_percent_last"], 10)
            session(root / "two.jsonl", "two", [token(0, 0, 0, 0)])
            self.assertEqual(pool.session_usage(root)["n_input_tokens"], 0)
            self.assertEqual(pool.session_usage(root)["n_cache_tokens"], 0)

    def test_rate_only_session_preserves_limits_without_inventing_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session(root / "one.jsonl", "one", [token(info=False, percent=17)])
            result = pool.session_usage(root)
            self.assertIsNone(result["n_input_tokens"])
            self.assertIsNone(result["n_cache_tokens"])
            self.assertIsNone(result["n_output_tokens"])
            self.assertEqual(result["request_usage"], [])
            self.assertFalse(result["metering_complete"])
            self.assertEqual(result["primary_used_percent_first"], 17)
            self.assertEqual(result["primary_used_percent_last"], 17)

    def test_missing_cache_total_leaves_usage_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            partial = token(100, 70, 30, 20, percent=18)
            del partial["payload"]["info"]["total_token_usage"]["cached_input_tokens"]
            session(root / "one.jsonl", "one", [partial])
            result = pool.session_usage(root)
            self.assertIsNone(result["n_input_tokens"])
            self.assertIsNone(result["n_cache_tokens"], "missing cache usage must never be fabricated as zero")
            self.assertIsNone(result["n_output_tokens"])
            self.assertEqual(result["request_usage"], [])
            self.assertFalse(result["metering_complete"])
            self.assertEqual(result["primary_used_percent_last"], 18)
            # An explicit zero cache counter is a valid measured receipt.
            session(root / "one.jsonl", "one", [token(100, 0, 30, 20)])
            self.assertEqual(pool.session_usage(root)["n_cache_tokens"], 0)

    def test_command_completion_gate_handles_duplicates_and_corruption(self):
        rows = [{"type": "item.completed", "item": {"id": "a", "type": "command_execution", "exit_code": 0}},
                {"type": "item.completed", "item": {"id": "b", "type": "command_execution", "exit_code": 1}},
                {"type": "item.started", "item": {"type": "command_execution"}},
                {"type": "item.completed", "item": {"type": "command_execution", "exit_code": False}},
                {"type": "item.completed", "item": {"type": "agent_message"}}, {}, None]
        text = "\n".join(json.dumps(row) for row in rows + [rows[0]]) + '\n{broken}\n'
        self.assertEqual(pool.container_commands(text), {"attempted": 3, "succeeded": 1})
        self.assertIsNone(pool.usage_limit_in("normal output"))
        self.assertIn("usage limit", pool.usage_limit_in("foo\nYou've hit your usage limit\nbar"))


@unittest.skipIf(pool is None, "install Harbor or Pier to check runner compatibility")
class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.logs = self.root / "agent"
        self.logs.mkdir()
        self.seat = login(self.root, "codex-1")
        self.wheel = accounts.Pool([self.seat], self.root / "pool.json", wait_sec=0)
        self.pool_patch = patch.object(accounts.Pool, "from_environment", return_value=self.wheel)
        self.pool_patch.start()
        self.addCleanup(self.pool_patch.stop)
        self.env_patch = patch.dict(os.environ, {accounts.ACCOUNTS_DIR_VARIABLE: str(self.root / ".smithers/accounts"),
            "SMITHERS_ROOT": str(self.root), "SMITHERS_CLI": str(self.root / "packages/smithers/bin/smithers.mjs")})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.agent = pool.PooledCodex(self.logs)
        self.agent._account = self.seat
        self.env = types.SimpleNamespace(capabilities=types.SimpleNamespace(mounted=True))

    def test_both_agent_setups_cancel_empty_pool_without_later_leases(self):
        from evals.harbor import smithers_agent
        fake_cli = self.root / smithers_agent.CLI_RELATIVE
        fake_cli.parent.mkdir(parents=True, exist_ok=True)
        fake_cli.write_text("// not executed\n")
        helper = self.root / "helper"
        helper.write_text("not executed")
        with patch.dict(os.environ, {"SMITHERS_OPENAI_AUTH": "chatgpt"}):
            smithers = smithers_agent.SmithersAgent(self.logs)
        smithers.root = self.root
        for agent in (self.agent, smithers):
            with self.subTest(agent=type(agent).__name__):
                self.wheel.wait_sec = 6 * 3600
                self.wheel.disable(self.seat.label, "no quota")
                agent._account = None
                original_sleep = asyncio.sleep
                async def scenario():
                    waiting = asyncio.Event()
                    never = asyncio.Event()
                    async def paused(seconds):
                        self.assertEqual(seconds, accounts.POLL_SEC)
                        waiting.set()
                        await never.wait()
                    with patch.object(accounts.asyncio, "sleep", side_effect=paused), \
                         patch.object(smithers_agent, "helper_binary", return_value=helper), \
                         patch.object(pool.Codex, "setup") as install:
                        task = asyncio.create_task(agent.setup(self.env))
                        await asyncio.wait_for(waiting.wait(), timeout=15)
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await task
                        self.wheel.enable(self.seat.label)
                        await original_sleep(0)
                        await original_sleep(0)
                        self.assertTrue(task.done())
                        self.assertIsNone(agent._account)
                        self.assertEqual(agent._requeues, [])
                        self.assertEqual(self.wheel._load().get("leases", []), [])
                        install.assert_not_called()
                asyncio.run(scenario())

    def test_both_agent_setups_lease_healthy_pool(self):
        from evals.harbor import smithers_agent
        fake_cli = self.root / smithers_agent.CLI_RELATIVE
        fake_cli.parent.mkdir(parents=True, exist_ok=True)
        fake_cli.write_text("// not executed\n")
        with patch.dict(os.environ, {"SMITHERS_OPENAI_AUTH": "chatgpt"}):
            smithers = smithers_agent.SmithersAgent(self.logs)
        smithers.root = self.root
        with patch.object(smithers_agent, "helper_binary", return_value=self.seat.auth), \
             patch.object(pool.Codex, "setup") as install:
            asyncio.run(self.agent.setup(self.env))
            asyncio.run(smithers.setup(self.env))
            install.assert_awaited_once()
        self.assertEqual(self.agent._account, self.seat)
        self.assertEqual(smithers._account, self.seat)
        self.assertEqual(len(self.wheel._load()["leases"]), 2)

    def test_cancel_requeue_wait_retains_attempt_and_never_leases_later(self):
        self.wheel.wait_sec = 6 * 3600
        runs = []
        async def ran(agent, instruction, env, context):
            runs.append(agent._account.label)
            session(self.logs / "sessions/one.jsonl", "one", [token()])
            (self.logs / "codex.txt").write_text("usage_limit_reached")
        original_sleep = asyncio.sleep
        async def scenario():
            waiting = asyncio.Event()
            never = asyncio.Event()
            async def paused(seconds):
                waiting.set()
                await never.wait()
            with patch.object(accounts.asyncio, "sleep", side_effect=paused), patch.object(pool.Codex, "run", ran):
                task = asyncio.create_task(self.agent.run("fix", self.env, pool.AgentContext()))
                await asyncio.wait_for(waiting.wait(), timeout=15)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.wheel.enable(self.seat.label)
                await original_sleep(0)
                await original_sleep(0)
            self.assertEqual(runs, ["codex-1"])
            self.assertEqual(self.wheel._load().get("leases", []), [])
            self.assertEqual(len(self.agent._requeues), 1)
            self.assertIsNone(self.agent._requeues[0]["to"])
            self.assertEqual(self.agent._requeues[0]["usage"]["n_input_tokens"], 100)
        asyncio.run(scenario())

    def test_actual_runner_factory_and_defaults(self):
        if pool.FRAMEWORK == "pier":
            from pier.agents.factory import AgentFactory
            from pier.agents.base import BaseAgent
            agent = AgentFactory.create_agent_from_import_path("evals.harbor.codex_pool:PooledCodex", self.logs)
            self.assertIsInstance(agent, BaseAgent)
            self.assertEqual(agent.network_allowlist().domains, [])
            self.assertEqual(agent.install_spec().version, "0.160.0")
        else:
            from harbor.agents.base import BaseAgent
            from harbor.agents.factory import AgentFactory
            from harbor.models.trial.config import AgentConfig
            agent = AgentFactory.create_agent_from_config(
                AgentConfig(import_path="evals.harbor.codex_pool:PooledCodex"), self.logs)
            self.assertIsInstance(agent, BaseAgent)
            self.assertIsNone(agent.network_allowlist())
        self.assertEqual(agent.version(), "0.160.0")
        self.assertEqual(agent.model_name, "openai/gpt-6.1-sol")
        self.assertIn("model_reasoning_effort=max", agent.build_cli_flags())
        custom = pool.PooledCodex(self.logs, "openai/custom", version="0.155.1", reasoning_effort="low")
        self.assertEqual(custom.version(), "0.155.1")
        self.assertEqual(custom.model_name, "openai/custom")
        self.assertIn("model_reasoning_effort=low", custom.build_cli_flags())
        with patch.dict(os.environ, {}, clear=True):
            pool.PooledCodex(self.logs)
            self.assertEqual(self.pool_patch.target.from_environment.call_args.args[0][accounts.ALLOWLIST_VARIABLE],
                             accounts.BENCHMARK_POOL)
        with patch.dict(os.environ, {accounts.ALLOWLIST_VARIABLE: ""}):
            pool.PooledCodex(self.logs)
            self.assertEqual(self.pool_patch.target.from_environment.call_args.args[0][accounts.ALLOWLIST_VARIABLE], "")

    def test_config_sources_merge_and_unsafe_overrides_fail_closed(self):
        import toml
        config = {"model_reasoning_effort": "max", "analytics": {"enabled": False}}
        merged = pool.sealed_config(config)
        self.assertEqual(config, {"model_reasoning_effort": "max", "analytics": {"enabled": False}})
        self.assertEqual(merged["web_search"], "disabled")
        self.assertFalse(merged["feedback"]["enabled"])
        self.assertEqual(merged["otel"]["exporter"], "none")
        self.assertEqual(merged["sandbox_mode"], "workspace-write")
        self.assertFalse(merged["sandbox_workspace_write"]["network_access"])
        self.assertEqual(merged["approval_policy"], "never")
        config_file = self.root / "config.toml"
        config_file.write_text(toml.dumps(config))
        for kwargs in ({"config_toml": toml.dumps(config)}, {"config_toml_file": str(config_file)},
                       {"config": config}, {"config": str(config_file)}):
            agent = pool.PooledCodex(self.logs, **kwargs)
            effective = toml.loads(agent._config_toml) if pool.FRAMEWORK == "pier" else agent._base_config
            self.assertEqual(effective, merged)
        bad = [{"web_search": "live"}, {"check_for_update_on_startup": True},
               {"analytics": {"enabled": True}}, {"feedback": {"enabled": True}},
               {"otel": {"exporter": "otlp-http"}}, {"feedback": False},
               {"model_provider": "api"}, {"forced_login_method": "api"},
               {"openai_base_url": "https://api.openai.com"}, {"analytics": {"enabled": 0}},
               {"sandbox_mode": "danger-full-access"}, {"sandbox_workspace_write": {"network_access": True}},
               {"approval_policy": "on-request"}, {"mcp_servers": {}}, {"model_providers": {}},
               {"features": {"web_search_request": True}}, {"profiles": {}}, {"tools": {}},
               {"sandbox_workspace_write": {"writable_roots": ["/"]}}, {"otel": {"trace_exporter": "otlp-http"}}]
        for unsafe in bad:
            with self.subTest(unsafe=unsafe), self.assertRaises(ValueError):
                pool.PooledCodex(self.logs, config=unsafe)
        with self.assertRaises(ValueError):
            pool.PooledCodex(self.logs, config={}, config_toml="")
        for unsafe in ({"mcp_servers": ["extra"]}, {"command_model_name": "other"},
                       {"extra_env": {"CODEX_HOME": "/unsafe"}}, {"extra_env": {"HTTPS_PROXY": "https://unsafe"}},
                       {"reasoning_effort": "max --enable web_search"}, {"reasoning_summary": "unknown"},
                       {"config": {"model_reasoning_effort": "low"}}, {"version": "0.160.0; curl bad"}):
            with self.subTest(unsafe=unsafe), self.assertRaises(ValueError):
                pool.PooledCodex(self.logs, **unsafe)
        with self.assertRaises(ValueError):
            pool.PooledCodex(self.logs, "openai/model --enable web_search")

    def test_unsafe_or_changed_native_command_never_reaches_environment(self):
        commands = ["codex exec --sandbox danger-full-access -- --task", "codex exec -- --task",
                    "codex exec --model x --dangerously-bypass-approvals-and-sandbox -- --task",
                    "sh -c 'codex exec --dangerously-bypass-approvals-and-sandbox -- --task'",
                    "codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true -- --task"]
        for command in commands:
            with self.subTest(command=command), patch.object(pool.Codex, "exec_as_agent") as native:
                with self.assertRaises(RuntimeError):
                    asyncio.run(self.agent.exec_as_agent(self.env, command))
                native.assert_not_called()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "OPENAI_BASE_URL": "https://api.openai.com"}):
            agent = pool.PooledCodex(self.logs, extra_env={"OPENAI_API_KEY": "other-secret", "KEEP": "yes"})
            self.assertIsNone(agent._get_env("OPENAI_API_KEY"))
            self.assertIsNone(agent._get_env("OPENAI_BASE_URL"))
            self.assertEqual(agent._get_env("KEEP"), "yes")
            self.assertNotIn("OPENAI_API_KEY", agent._extra_env)
            if pool.FRAMEWORK == "harbor":
                self.assertIsNone(agent.model_connection.configured_base_url)
                self.assertIsNone(agent.model_connection.api_key)
            else:
                self.assertNotIn("OPENAI_API_KEY", agent.build_process_env({"OPENAI_API_KEY": "third-secret"}))

    def test_real_stock_run_auth_command_and_context(self):
        agent = self.agent
        commands = []
        uploads = []
        uploaded_config = []
        async def exec(command, **kwargs):
            commands.append((command, kwargs))
            if "codex exec " in command:
                session(self.logs / "sessions/2026/10/02/one.jsonl", "one", [token()])
                (self.logs / "codex.txt").write_text("\n".join(json.dumps(row) for row in [
                    {"type": "item.completed", "item": {"id": "probe", "type": "command_execution",
                        "command": pool.SANDBOX_PROBE_COMMAND, "exit_code": 7,
                        "aggregated_output": "curl: (7) socket: Operation not permitted"}},
                    {"type": "item.completed", "item": {"id": "c1", "type": "command_execution", "exit_code": 0}}]))
            return types.SimpleNamespace(return_code=0, stdout="codex-cli 0.160.0\n", stderr="")
        async def upload(source, target):
            uploads.append((Path(source), target))
            if target.endswith("config.toml"):
                uploaded_config.append(Path(source).read_text())
        env = types.SimpleNamespace(exec=exec, upload_file=upload, default_user="root",
                                    capabilities=types.SimpleNamespace(mounted=True),
                                    agent_install_spec=agent.install_spec() if pool.FRAMEWORK == "pier" else None)
        env.agent_process_env = types.MethodType(pool.BaseEnvironment.agent_process_env, env) if pool.FRAMEWORK == "pier" else lambda given: given
        context = pool.AgentContext()
        asyncio.run(agent.setup(env))
        asyncio.run(agent.run("fix 'the task'", env, context))
        self.assertTrue(context.is_empty(), "the runner must still call its post-run parser")
        agent.populate_context_post_run(context)
        self.assertEqual((context.n_input_tokens, context.n_cache_tokens, context.n_output_tokens), (100, 70, 30))
        self.assertEqual(context.metadata["reasoning_output_tokens"], 20)
        self.assertEqual(context.metadata["account"], "codex-1")
        self.assertEqual(context.metadata["model"], "openai/gpt-6.1-sol")
        self.assertTrue((self.logs / "trajectory.json").is_file())
        self.assertIn((self.seat.auth, "/tmp/codex-secrets/auth.json"), uploads)
        native = [command for command, _ in commands if "codex exec " in command]
        self.assertEqual(len(native), 1)
        self.assertIn("--model gpt-6.1-sol", native[0])
        self.assertIn("model_reasoning_effort=max", native[0])
        self.assertIn("--sandbox workspace-write", native[0])
        self.assertIn("sandbox_workspace_write.network_access=false", native[0])
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", native[0])
        self.assertIn("Before working", native[0])
        self.assertTrue(context.metadata["benchmark_seal"]["sealed"])
        self.assertFalse(any("npm install" in command for command, _ in commands))
        self.assertTrue(all("OPENAI_API_KEY" not in (kwargs.get("env") or {}) for _, kwargs in commands))
        if pool.FRAMEWORK == "pier":
            self.assertTrue(any('web_search = "disabled"' in command and 'enabled = false' in command
                                for command, _ in commands))
        else:
            import toml
            effective = toml.loads(uploaded_config[0])
            self.assertEqual(effective["web_search"], "disabled")
            self.assertEqual(effective["forced_login_method"], "chatgpt")
            self.assertFalse(effective["analytics"]["enabled"])
        receipt = json.loads((self.logs / pool.ACCOUNT_FILE).read_text())
        self.assertEqual(receipt["n_input_tokens"], 100)
        self.assertTrue(receipt["benchmark_seal"]["sandbox_probe"]["denied"])

    def test_multiple_session_directories_meter_without_stock_parser_crash(self):
        session(self.logs / "sessions/day1/one.jsonl", "one", [token()])
        session(self.logs / "sessions/day2/two.jsonl", "two", [token(50, 10, 10, 0)])
        context = pool.AgentContext(metadata={"prior": "keep"})
        self.agent.populate_context_post_run(context)
        self.assertEqual((context.n_input_tokens, context.n_cache_tokens, context.n_output_tokens), (150, 80, 40))
        self.assertEqual(context.metadata["prior"], "keep")
        # Repeated population is idempotent, never a second charge.
        self.agent.populate_context_post_run(context)
        self.assertEqual(context.n_input_tokens, 150)

    def test_requeue_archives_usage_and_retries_on_next_allowed_seat(self):
        second = login(self.root, "codex-3")
        self.wheel.accounts.append(second)
        runs = []
        async def ran(agent, instruction, env, context):
            runs.append(agent._account.label)
            if len(runs) == 1:
                session(self.logs / "sessions/one.jsonl", "old", [token(900, 800, 90, 50)])
                (self.logs / "codex.txt").write_text("usage_limit_reached resets_at 2026-10-10T00:00:00Z")
            else:
                session(self.logs / "sessions/two.jsonl", "new", [token()])
                (self.logs / "codex.txt").write_text('{"type":"item.completed","item":{"type":"command_execution","exit_code":0}}')
        context = pool.AgentContext()
        with patch.object(pool.Codex, "run", ran):
            asyncio.run(self.agent.run("fix", self.env, context))
        self.agent.populate_context_post_run(context)
        self.assertEqual(runs, ["codex-1", "codex-3"])
        self.assertEqual(context.n_input_tokens, 100)
        self.assertEqual(context.metadata["requeues"][0]["usage"]["n_input_tokens"], 900)
        self.assertEqual(context.metadata["requeues"][0]["resetAt"], "2026-10-10T00:00+00:00")
        self.assertTrue((self.logs / "sessions-attempt-1/one.jsonl").exists())
        self.assertTrue((self.logs / "codex-attempt-1.txt").exists())
        self.assertEqual(self.wheel.disabled().keys(), {"codex-1"})
        self.assertEqual(context.metadata["account"], "codex-3")

    def test_failure_cancellation_and_missing_commands_do_not_requeue(self):
        for failure in (RuntimeError("provider transport failed"), asyncio.CancelledError(), None):
            with self.subTest(failure=type(failure).__name__):
                async def ran(agent, instruction, env, context):
                    session(self.logs / "sessions/one.jsonl", "one", [token()])
                    (self.logs / "codex.txt").write_text("no command ran")
                    if failure is not None:
                        raise failure
                context = pool.AgentContext()
                with patch.object(pool.Codex, "run", ran):
                    with self.assertRaises(type(failure) if failure is not None else accounts.ContainerUnreachable):
                        asyncio.run(self.agent.run("fix", self.env, context))
                self.agent.populate_context_post_run(context)
                self.assertEqual(context.n_input_tokens, 100)
                self.assertEqual(self.wheel.disabled(), {})
                self.assertEqual(self.agent._requeues, [])
                self.assertFalse(context.metadata["benchmark_seal"]["sealed"])

    def test_no_seat_preserves_failed_attempt_receipt(self):
        async def ran(agent, instruction, env, context):
            session(self.logs / "sessions/one.jsonl", "one", [token()])
            raise RuntimeError("usage_limit_reached resets_at 2026-10-10T00:00:00Z")
        with patch.object(pool.Codex, "run", ran), self.assertRaises(accounts.NoSeatLeft):
            asyncio.run(self.agent.run("fix", self.env, pool.AgentContext()))
        receipt = json.loads((self.logs / pool.ACCOUNT_FILE).read_text())
        self.assertEqual(receipt["requeues"][0]["usage"]["n_input_tokens"], 100)
        self.assertIsNone(receipt["requeues"][0]["to"])
        self.assertEqual(self.wheel.disabled()["codex-1"]["resetAt"], "2026-10-10T00:00+00:00")

    def test_remote_output_and_session_download_before_retry(self):
        called = []
        async def download_file(remote, local):
            called.append(remote)
            Path(local).write_text('{"type":"item.completed","item":{"type":"command_execution","exit_code":0}}')
        async def download_dir(remote, local):
            called.append(remote)
            session(Path(local) / "one.jsonl", "one", [token()])
        env = types.SimpleNamespace(capabilities=types.SimpleNamespace(mounted=False),
                                    download_file=download_file, download_dir=download_dir)
        async def ran(*args):
            return None
        with patch.object(pool.Codex, "run", ran):
            asyncio.run(self.agent.run("fix", env, pool.AgentContext()))
        self.assertEqual(called, ["/logs/agent/codex.txt"])
        asyncio.run(self.agent._fetch_sessions(env))
        self.assertEqual(called[-1], "/logs/agent/sessions")
        context = pool.AgentContext()
        self.agent.populate_context_post_run(context)
        self.assertEqual(context.n_input_tokens, 100)
        async def missing(*args):
            raise OSError("no logs")
        env.download_file = missing
        env.download_dir = missing
        asyncio.run(self.agent._fetch_output(env, self.logs / "absent.txt"))
        asyncio.run(self.agent._fetch_sessions(env))
        self.assertFalse((self.logs / "absent.txt").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
