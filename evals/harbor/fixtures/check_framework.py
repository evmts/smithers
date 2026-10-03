"""Real runner factories and model receipts, without trials or model calls."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from evals.harbor import framework


class SelectionTests(unittest.TestCase):
    def select(self, installed, *, executable="python", configured=None):
        env = {} if configured is None else {"SMITHERS_BENCH_FRAMEWORK": configured}
        with patch.dict(os.environ, env, clear=True), patch.object(sys, "argv", [executable]), \
                patch.object(framework.importlib.util, "find_spec", side_effect=lambda name: name in installed or None):
            return framework.selected()

    def test_executable_and_explicit_runner_win_over_install_order(self):
        for executable, expected in (("/venv/bin/harbor", "harbor"), ("/venv/bin/pier", "pier")):
            self.assertEqual(self.select({"harbor", "pier"}, executable=executable), expected)
        self.assertEqual(self.select({"harbor", "pier"}), "harbor")
        self.assertEqual(self.select({"pier"}), "pier")
        self.assertEqual(self.select(set()), "none")
        self.assertEqual(self.select({"harbor", "pier"}, executable="harbor", configured="pier"), "pier")

    def test_bad_or_missing_explicit_runner_never_falls_back(self):
        for configured in ("", "auto", "other", "PIER"):
            with self.subTest(configured=configured), self.assertRaises(ValueError):
                self.select({"harbor", "pier"}, configured=configured)
        for requested in ("harbor", "pier"):
            with self.subTest(requested=requested), self.assertRaises(ImportError):
                self.select(set(), configured=requested)
            with self.assertRaises(ImportError):
                self.select(set(), executable=requested)

    def test_real_factories_keep_their_own_agent_and_context_models(self):
        script = '''
import importlib, json, os, sys
from pathlib import Path
sys.argv[0] = sys.argv[1]
runner = sys.argv[1]
factory = importlib.import_module(runner + ".agents.factory").AgentFactory
base = importlib.import_module(runner + ".agents.base").BaseAgent
config = importlib.import_module(runner + ".models.trial.config").AgentConfig
info = importlib.import_module(runner + ".models.trial.result").AgentInfo
for name in ("codex_pool:PooledCodex", "smithers_agent:SmithersAgent"):
    agent = factory.create_agent_from_config(
        config(import_path="evals.harbor." + name), logs_dir=Path(os.environ["TEST_LOGS"]))
    assert isinstance(agent, base), (runner, type(agent))
    info.model_validate(agent.to_agent_info())
    module = importlib.import_module(type(agent).__module__)
    context = importlib.import_module(runner + ".models.agent.context").AgentContext
    assert module.AgentContext is context
    assert module.FRAMEWORK == runner
    if runner == "harbor":
        assert agent.capabilities.atif
    else:
        assert agent.SUPPORTS_ATIF
    if name.startswith("smithers"):
        assert agent._commit == (runner == "pier")
print(json.dumps({"runner": runner, "agents": 2}))
'''
        installed = [name for name in ("harbor", "pier") if importlib.util.find_spec(name) is not None]
        if not installed:
            self.skipTest("install Harbor/Pier for real factory compatibility")
        with tempfile.TemporaryDirectory() as directory:
            for runner in installed:
                for explicit in (False, True):
                    env = {**os.environ, "PYTHONPATH": str(ROOT), "TEST_LOGS": directory,
                           "SMITHERS_CODEX_ACCOUNTS_DIR": directory, "SMITHERS_CODEX_POOL": ""}
                    env.pop("SMITHERS_BENCH_FRAMEWORK", None)
                    if explicit:
                        env["SMITHERS_BENCH_FRAMEWORK"] = runner
                    with self.subTest(runner=runner, explicit=explicit):
                        result = subprocess.run([sys.executable, "-c", script, runner], cwd=ROOT,
                                                env=env, capture_output=True, text=True, timeout=180)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertEqual(json.loads(result.stdout), {"runner": runner, "agents": 2})


if __name__ == "__main__":
    unittest.main(verbosity=2)
