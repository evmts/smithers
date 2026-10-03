"""Offline behavioral checks for benchmark tool/network seals and CLI lifecycle."""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import accounts
import smithers_agent as agent
import plue_env

ROOT = HERE.parents[2]
CONTAINER = 'task-container'
PROMPT = (HERE.parent / 'prompt.md').read_text()


def environment(*, internet: bool = False, requested=None, allow=()):
    return types.SimpleNamespace(task_env_config=types.SimpleNamespace(allow_internet=internet),
                                 network_policy=types.SimpleNamespace(network_mode=requested, allowed_hosts=list(allow)))


def cloud_environment(record, **kwargs):
    env = environment(**kwargs)
    env._ws = lambda *flags: (CONTAINER, '--repo', 'acme/bench', *flags)
    env._run = AsyncMock(return_value=types.SimpleNamespace(stdout=json.dumps(record).encode()))
    return env


class SealTests(unittest.TestCase):
    def test_cli_environment_removes_external_tools_and_pool(self):
        original = {'SMITHERS_REMOTE': 'https://host', 'SMITHERS_MCP_CONFIG': '/tmp/tools.json',
                    'SMITHERS_ACCOUNT_POOL_URL': 'https://pool', 'SMITHERS_ACCOUNT_POOL_PROVIDERS': 'openai',
                    'SMITHERS_ACCOUNT_POOL_KEY': 'pool-secret', 'OPENAI_API_KEY': 'api-key',
                    'SMITHERS_TEST_COMMAND': 'secret tests', 'SMITHERS_BASH_CONTAINER': 'wrong',
                    'PATH': '/usr/bin', 'CODEX_HOME': '/old/account'}
        env = agent.cli_environment(original, auth_mode='chatgpt', container=CONTAINER,
                                    codex_home=Path('/benchmark/account'))
        for name in ('SMITHERS_REMOTE', 'SMITHERS_MCP_CONFIG', 'SMITHERS_ACCOUNT_POOL_URL', 'SMITHERS_ACCOUNT_POOL_PROVIDERS', 'SMITHERS_ACCOUNT_POOL_KEY',
                     'OPENAI_API_KEY', 'SMITHERS_TEST_COMMAND'):
            self.assertNotIn(name, env)
        self.assertEqual(env['CODEX_HOME'], '/benchmark/account')
        self.assertEqual(env['SMITHERS_BASH_CONTAINER'], CONTAINER)
        self.assertEqual(original['SMITHERS_BASH_CONTAINER'], 'wrong')
        self.assertNotIn('SMITHERS_BASH_CONTAINER', agent.cli_environment(original, auth_mode='api-key'))

    def test_current_prompt_and_host_offer_no_provider_tools(self):
        env = agent.cli_environment({}, auth_mode='chatgpt', container=CONTAINER)
        seal = agent.benchmark_tools(ROOT, PROMPT, env, CONTAINER)
        self.assertEqual(seal, {'asserted': True, 'web_tools': False, 'network_tools': [],
                               'flows': ['bash', 'wait', 'ask'], 'container': CONTAINER})

    def test_prompt_and_environment_refusals(self):
        good = {'SMITHERS_BASH_CONTAINER': CONTAINER}
        for prompt in [PROMPT.replace('flows: ["bash"]', 'flows: ["bash", "web"]'),
                       PROMPT.replace('flows: ["bash"]', 'flows: ["bash"]\ntools: ["web"]'),
                       PROMPT.replace('flows: ["bash"]', 'flows: ["bash"]\nserverTools: ["web"]'),
                       PROMPT.replace('flows: ["bash"]', 'flows: ["bash"]\nweb: true'),
                       'no frontmatter']:
            with self.subTest(prompt=prompt[:100]), self.assertRaises(accounts.ModelRouteError):
                agent.benchmark_tools(ROOT, prompt, good, CONTAINER)
        for env in [{}, {'SMITHERS_BASH_CONTAINER': 'foreign'},
                    {**good, 'SMITHERS_REMOTE': 'remote'}, {**good, 'SMITHERS_MCP_CONFIG': 'web.json'}]:
            with self.subTest(env=env), self.assertRaises(accounts.ModelRouteError):
                agent.benchmark_tools(ROOT, PROMPT, env, CONTAINER)
        with self.assertRaises(accounts.ModelRouteError):
            agent.benchmark_tools(ROOT, PROMPT, {'SMITHERS_BASH_CONTAINER': ''}, '')

    def test_duplicate_frontmatter_cannot_hide_network_flows(self):
        prompt = PROMPT.replace('flows: ["bash"]', 'flows: ["bash"]\nflows: ["web"]')
        with self.assertRaises(accounts.ModelRouteError):
            agent.benchmark_tools(ROOT, prompt, {'SMITHERS_BASH_CONTAINER': CONTAINER}, CONTAINER)

    def test_provider_host_source_is_checked_before_model_launch(self):
        for source in ['const actionHost = AgentAction.makeHost({\n          serverTools: webTools\n        })',
                       '// no verified host construction']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                host = root / 'packages/smithers/src/internal/NativeControl.ts'
                host.parent.mkdir(parents=True)
                host.write_text(source)
                with self.assertRaises(accounts.ModelRouteError):
                    agent.benchmark_tools(root, PROMPT, {'SMITHERS_BASH_CONTAINER': CONTAINER}, CONTAINER)

    def test_journal_rejects_unsealed_and_provider_calls(self):
        good = [
            {'type': 'control.agent.model-requested', 'payload': {'toolCount': 0}},
            {'type': 'control.agent.cell-call-started', 'payload': {'flowName': 'bash', 'input': {'container': CONTAINER}}},
            {'type': 'control.agent.cell-call-started', 'payload': {'flowName': 'wait', 'input': {}}},
            {'type': 'control.agent.cell-call-started', 'payload': {'flowName': 'ask', 'input': {}}},
        ]
        agent.assert_journal_seal(good, CONTAINER)
        for payload in [
            {'flowName': 'bash', 'input': {'command': 'cat tests/private'}},
            {'flowName': 'bash', 'input': {'container': 'another-task'}},
            {'flowName': 'web', 'input': {'url': 'https://web'}},
            {'flowName': 'read', 'input': {'path': '/host/tests'}},
            {'flowName': 'invented', 'input': {}},
        ]:
            with self.subTest(payload=payload), self.assertRaises(accounts.ModelRouteError):
                agent.assert_journal_seal([{'type': 'control.agent.cell-call-started', 'payload': payload}], CONTAINER)
        for count in [1, 2, -1, '1']:
            with self.subTest(count=count), self.assertRaises(accounts.ModelRouteError):
                agent.assert_journal_seal([{'type': 'control.agent.model-requested', 'payload': {'toolCount': count}}], CONTAINER)

    def test_cloud_admission_receipts_and_network_policy(self):
        image = {'ref': 'oci:tag', 'digest': 'sha256:' + 'a' * 64}
        for wrapped in (False, True):
            record = {'image': image, 'network': {'mode': 'none', 'allow': []}}
            env = cloud_environment({'data': record} if wrapped else record)
            seal = asyncio.run(agent.benchmark_network(env, 'docker', CONTAINER, True))
            self.assertEqual(seal, {**record, 'task_allows_internet': False})
            env._run.assert_awaited_once_with('workspace', 'view', CONTAINER, '--repo', 'acme/bench',
                                              '--format', 'json', timeout=120)
        for record in [{}, {'network': {'mode': 'none'}, 'image': {}},
                       {'network': {'mode': 'none'}, 'image': 'oci:tag'},
                       {'network': 'none', 'image': image},
                       {'network': {'mode': 'proxy', 'allow': []}, 'image': image},
                       {'network': {'mode': 'allowlist', 'allow': ['chatgpt.com']}, 'image': image}]:
            with self.subTest(record=record), self.assertRaises(accounts.ModelRouteError):
                asyncio.run(agent.benchmark_network(cloud_environment(record), 'docker', CONTAINER, True))
        record = {'image': image, 'network': {'mode': 'proxy'}}
        for kwargs in [{'internet': True}, {'requested': 'public'}, {'requested': types.SimpleNamespace(value='public')}]:
            seal = asyncio.run(agent.benchmark_network(cloud_environment(record, **kwargs), 'docker', CONTAINER, True))
            self.assertTrue(seal['task_allows_internet'])
        for kwargs in [{'internet': True}, {'requested': 'public'}]:
            with self.assertRaises(accounts.ModelRouteError):
                asyncio.run(agent.benchmark_network(cloud_environment({'image': image, 'network': {'mode': 'none'}}, **kwargs),
                                                     'docker', CONTAINER, True))
        for kwargs in [{'requested': 'allowlist', 'allow': ['example.com']}, {'allow': ['example.com']}]:
            env = cloud_environment(record, **kwargs)
            with self.assertRaises(accounts.ModelRouteError):
                asyncio.run(agent.benchmark_network(env, 'docker', CONTAINER, True))
            env._run.assert_not_awaited()
        for network in [{'mode': 'allowlist', 'allow': []}, {'mode': 'proxy', 'allow': ['example.com']}, {'mode': 'unknown'}]:
            with self.subTest(network=network), self.assertRaises(accounts.ModelRouteError):
                asyncio.run(agent.benchmark_network(cloud_environment({'image': image, 'network': network}, internet=True),
                                                     'docker', CONTAINER, True))

    def test_docker_reads_runtime_seal_and_refuses_network_for_default_task(self):
        with patch.object(agent.subprocess, 'run', return_value=types.SimpleNamespace(stdout='none\n')) as run:
            seal = asyncio.run(agent.benchmark_network(environment(), '/bin/docker', CONTAINER, False))
            self.assertEqual(seal, {'network': {'mode': 'none'}, 'task_allows_internet': False})
            run.assert_called_once_with(['/bin/docker', 'inspect', '--format', '{{.HostConfig.NetworkMode}}', CONTAINER],
                                        capture_output=True, text=True, timeout=60, check=True)
        with patch.object(agent.subprocess, 'run', return_value=types.SimpleNamespace(stdout='bridge\n')):
            with self.assertRaises(accounts.ModelRouteError):
                asyncio.run(agent.benchmark_network(environment(), 'docker', CONTAINER, False))
            seal = asyncio.run(agent.benchmark_network(environment(internet=True), 'docker', CONTAINER, False))
            self.assertTrue(seal['task_allows_internet'])
        with patch.object(agent.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'docker')):
            with self.assertRaises(subprocess.CalledProcessError):
                asyncio.run(agent.benchmark_network(environment(), 'docker', CONTAINER, False))


class WorkspaceNetworkTests(unittest.TestCase):
    def test_none_proxy_and_stock_codex_routing(self):
        self.assertEqual(plue_env.workspace_network(types.SimpleNamespace(allow_internet=False)), 'none')
        self.assertEqual(plue_env.workspace_network(types.SimpleNamespace(allow_internet=True)), 'proxy')
        self.assertEqual(plue_env.workspace_network(types.SimpleNamespace(allow_internet=True),
                                                    types.SimpleNamespace(network_mode='no-network')), 'none')
        self.assertEqual(plue_env.workspace_network(types.SimpleNamespace(allow_internet=False),
                                                    types.SimpleNamespace(network_mode='public')), 'proxy')
        for internet in (False, True):
            self.assertEqual(plue_env.workspace_network(types.SimpleNamespace(allow_internet=internet), stock_codex=True), 'proxy')
        for policy in (types.SimpleNamespace(network_mode='allowlist'), types.SimpleNamespace(network_mode='unknown'),
                       types.SimpleNamespace(network_mode='no-network', allowed_hosts=['example.com'])):
            with self.subTest(policy=policy), self.assertRaises(plue_env.PlueUnplaceable):
                plue_env.workspace_network(types.SimpleNamespace(allow_internet=False), policy)

    def test_harbor_marks_stock_codex_before_allocation(self):
        class Environment(plue_env._PlueOps):
            def __init__(self):
                self.calls = []
            def _plue_network(self):
                return plue_env.workspace_network(types.SimpleNamespace(allow_internet=False),
                                                  stock_codex=getattr(self, '_plue_stock_codex', False))
            async def reserve(self):
                self.calls.append(('reserve', self._plue_network()))
            async def start(self):
                self.calls.append(('start', self._plue_network()))
        class Trial:
            async def _start_agent_environment(self):
                await self.agent_environment.start()
        plue_env.install_untimed_reserve(Trial)
        for agent_name, mode in (('codex', 'proxy'), ('smithers', 'none')):
            trial = Trial()
            trial.agent = types.SimpleNamespace(name=lambda: agent_name)
            trial.agent_environment = Environment()
            asyncio.run(trial._start_agent_environment())
            self.assertEqual(trial.agent_environment.calls, [('reserve', mode), ('start', mode)])

    def test_capabilities_do_not_claim_filtered_egress(self):
        try:
            from harbor.environments.capabilities import EnvironmentCapabilities
        except ImportError:
            self.skipTest('Harbor is not installed')
        env = object.__new__(plue_env.PlueEnvironment)
        self.assertTrue(env.capabilities.disable_internet)
        self.assertFalse(env.capabilities.network_allowlist)
        self.assertFalse(env.capabilities.network_allowlist_hostnames)
        self.assertFalse(env.capabilities.network_allowlist_wildcard_hostnames)


class DriveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.subject = object.__new__(agent.SmithersAgent)
        self.subject.root = self.root
        self.subject.logs_dir = self.root
        self.env = {'CODEX_HOME': '/benchmark/account'}
        cli_env = patch.dict(agent.os.environ)
        cli_env.start()
        self.addCleanup(cli_env.stop)
        cli = self.root / agent.CLI_RELATIVE
        cli.parent.mkdir(parents=True)
        cli.write_text('// offline command-construction fixture')
        agent.os.environ['SMITHERS_CLI'] = str(cli)

    def receipt(self, code=0, stdout='', stderr=''):
        return types.SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)

    def test_configured_binary_and_js_paths_override_checkout(self):
        for filename, expected_node in (('remote-cli', False), ('remote-cli.mjs', True)):
            cli = self.root / filename
            cli.write_text('#!/bin/sh\nexit 0\n')
            cli.chmod(0o700 if not expected_node else 0o600)
            with patch.dict(agent.os.environ, {'SMITHERS_CLI': str(cli)}):
                expected = ['node', str(cli.resolve())] if expected_node else [str(cli.resolve())]
                self.assertEqual(self.subject._cli('flow', 'plan', 'benchmark'), expected + ['flow', 'plan', 'benchmark', '--format', 'json'])
                self.subject.auth_mode = 'api-key'
                with patch.object(agent, 'helper_binary', return_value=Path('/portable/helper')):
                    asyncio.run(self.subject.setup(environment()))
        with patch.dict(agent.os.environ, {'SMITHERS_CLI': 'remote-cli', 'PATH': str(self.root)}):
            self.assertEqual(self.subject._cli('flow', 'plan', 'benchmark')[0], str((self.root / 'remote-cli').resolve()))
        with patch.dict(agent.os.environ, {'SMITHERS_CLI': str(self.root / 'missing')}), self.assertRaisesRegex(RuntimeError, 'does not resolve'):
            self.subject._cli('flow', 'plan', 'benchmark')
        cli = self.root / 'nonexecutable'
        cli.write_text('binary-placeholder')
        with patch.dict(agent.os.environ, {'SMITHERS_CLI': str(cli)}), self.assertRaisesRegex(RuntimeError, 'not executable'):
            self.subject._cli('flow', 'plan', 'benchmark')

    def test_environment_paths_are_required_before_setup(self):
        with patch.dict(agent.os.environ):
            agent.os.environ.pop('SMITHERS_CLI', None)
            with self.assertRaisesRegex(RuntimeError, 'SMITHERS_CLI is required'):
                self.subject._cli('flow', 'plan', 'benchmark')
            with self.assertRaisesRegex(RuntimeError, 'SMITHERS_CLI is required'):
                asyncio.run(self.subject.setup(environment()))
        self.subject.root = None
        self.assertIsNone(self.subject.version())
        with self.assertRaisesRegex(RuntimeError, 'SMITHERS_ROOT is required'):
            asyncio.run(self.subject.setup(environment()))
        with patch.dict(agent.os.environ):
            agent.os.environ.pop('SMITHERS_CLI', None)
            with self.assertRaisesRegex(plue_env.PlueError, 'SMITHERS_CLI is required'):
                plue_env._PlueOps._cli()
        with self.assertRaisesRegex(RuntimeError, 'SMITHERS_CLI is required'):
            agent.shim_config({'PLUE_REPO': 'acme/bench', 'PATH': '/usr/bin'})
        self.assertEqual(agent.seat_of('openai/gpt-6.1-sol'), 'openai:gpt-6.1-sol')

    def test_supported_lifecycle_and_receipt_envelopes(self):
        approval = {'plan': 'plan-id', 'digest': 'approval-digest'}
        for plan in ({'approval': approval}, {'data': {'approval': approval}}):
            with self.subTest(plan=plan), patch.object(agent.subprocess, 'run', side_effect=[
                self.receipt(stdout=json.dumps(plan)), self.receipt(), self.receipt(7)]) as run:
                self.assertEqual(self.subject._drive(self.root, self.env, 17), (7, 'run'))
                calls = run.call_args_list
                serialized = json.dumps(approval)
                self.assertEqual([call.args[0] for call in calls], [
                    ['node', str((self.root / agent.CLI_RELATIVE).resolve()), 'flow', 'plan', agent.FLOW_NAME, '--format', 'json'],
                    ['node', str((self.root / agent.CLI_RELATIVE).resolve()), 'approvals', 'approve', serialized, '--scope', 'run', '--format', 'json'],
                    ['node', str((self.root / agent.CLI_RELATIVE).resolve()), 'flow', 'execute', serialized, '--format', 'json'],
                ])
                self.assertEqual([call.kwargs['timeout'] for call in calls], [300, 300, 17])
                self.assertTrue(all(call.kwargs['env'] is self.env and call.kwargs['cwd'] == self.root for call in calls))

    def test_plan_and_approval_failures_stop_execution(self):
        for responses, expected in [
            ([self.receipt(3, 'plan-failure', 'plan stderr')], (3, 'plan')),
            ([self.receipt(stdout='{"approval":{"digest":"x"}}'), self.receipt(5, 'approval-failure', 'approval stderr')], (5, 'approve')),
        ]:
            with self.subTest(expected=expected), patch.object(agent.subprocess, 'run', side_effect=responses) as run:
                self.assertEqual(self.subject._drive(self.root, self.env, 10), expected)
                self.assertEqual(run.call_count, len(responses))
        log = (self.root / 'smithers-run.log').read_text()
        for expected in ('plan-failure', 'plan stderr', 'approval-failure', 'approval stderr'):
            self.assertIn(expected, log)

    def test_malformed_plan_receipts_fail_without_execution(self):
        for stdout in ('not json', '{}', '{"data":{}}', 'null', '[]', '{"data":null}', '{"approval":null}', '{"approval":[]}', '{"approval":{}}', '{"approval":"invalid"}'):
            with self.subTest(stdout=stdout), patch.object(agent.subprocess, 'run', return_value=self.receipt(stdout=stdout)) as run:
                self.assertEqual(self.subject._drive(self.root, self.env, 10), (1, 'plan'))
                self.assertEqual(run.call_count, 1)

    def test_timeouts_keep_phase_and_do_not_continue(self):
        valid = self.receipt(stdout='{"approval":{"digest":"x"}}')
        for phase, responses in [('plan', [subprocess.TimeoutExpired('plan', 300)]),
                                 ('approve', [valid, subprocess.TimeoutExpired('approve', 300)]),
                                 ('run', [valid, self.receipt(), subprocess.TimeoutExpired('execute', 10)])]:
            with self.subTest(phase=phase), patch.object(agent.subprocess, 'run', side_effect=responses) as run:
                self.assertEqual(self.subject._drive(self.root, self.env, 10), (124, phase))
                self.assertEqual(run.call_count, len(responses))


class RunCleanupTests(unittest.TestCase):
    setUp = DriveTests.setUp

    def attempt(self, *, reject_seal=False):
        subject = self.subject
        subject.model_name = agent.DEFAULT_MODEL
        subject.seat = agent.seat_of(subject.model_name)
        subject.auth_mode = 'api-key'
        subject.docker = 'docker'
        subject._commit = False
        subject._plue = True
        subject._budget_sec = 20
        subject._agent_timeout_sec = None
        subject._account = None
        subject._requeues = []
        subject.container_of = lambda _: CONTAINER
        subject.container_cwd = lambda _: '/app'
        subject._drive = Mock(side_effect=OSError('executor unavailable'))
        created = []
        real_mkdtemp = agent.tempfile.mkdtemp

        def make_scratch(prefix):
            directory = real_mkdtemp(prefix=prefix, dir=self.root)
            created.append(Path(directory))
            return directory

        seal = Mock(side_effect=accounts.ModelRouteError('unsealed host')) if reject_seal else Mock(
            return_value={'asserted': True, 'web_tools': False, 'network_tools': []})
        with patch.object(agent, 'benchmark_network', AsyncMock(return_value={'network': {'mode': 'none'}})), \
             patch.object(agent, 'benchmark_tools', seal), patch.object(agent, 'helper_binary', return_value=None), \
             patch.object(agent, 'shim_config', return_value={}), patch.object(agent, 'shim_directory', side_effect=lambda p, _: p), \
             patch.object(agent, 'harness_revision', return_value='test-revision'), \
             patch.object(agent, 'subject_fingerprint', return_value=None), \
             patch.object(agent.tempfile, 'mkdtemp', side_effect=make_scratch):
            with self.assertRaises(accounts.ModelRouteError if reject_seal else OSError):
                asyncio.run(subject.run('fix the task', environment(), types.SimpleNamespace()))
        self.assertEqual(len(created), 2)
        self.assertTrue(all(not directory.exists() for directory in created), created)
        return json.loads((self.root / 'smithers-run.json').read_text())

    def test_seal_refusal_cleans_scratch_and_never_launches_model(self):
        receipt = self.attempt(reject_seal=True)
        self.subject._drive.assert_not_called()
        self.assertEqual(receipt['phase'], 'seal')
        self.assertFalse(receipt['benchmarkSeal']['asserted'])
        self.assertEqual(receipt['exception']['type'], 'ModelRouteError')
        self.assertFalse((self.root / 'workspace').exists())

    def test_executor_exception_keeps_attempt_and_failure_receipt(self):
        receipt = self.attempt()
        self.subject._drive.assert_called_once()
        self.assertEqual(receipt['phase'], 'drive')
        self.assertIsNone(receipt['exitStatus'])
        self.assertEqual(receipt['exception']['type'], 'OSError')
        self.assertTrue((self.root / 'workspace/flows' / agent.FLOW_NAME / 'flow.mdx').is_file())


if __name__ == '__main__':
    unittest.main(verbosity=2)
