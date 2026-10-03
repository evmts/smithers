#!/usr/bin/env python3
"""Adversarial seal receipts and remote admission, without network/model calls."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RIG = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RIG / 'lib'))
from importlib import import_module
seal_module = import_module('codex-seal')


def completed(command="curl --noproxy '*' --max-time 5 https://example.com", code=7,
              output='curl: (7) Operation not permitted', kind='command_execution'):
    return {'type': 'item.completed', 'item': {'type': kind, 'command': command,
                                            'exit_code': code, 'aggregated_output': output}}


def transcript(*events):
    return '\n'.join(json.dumps(event) for event in events)


class SealChecks(unittest.TestCase):
    guest = completed("docker exec guest-1 bash -lc 'exit 0'", 0, '')

    def test_actual_denial_and_guest_receipt(self):
        for command in ("curl --noproxy '*' --max-time 5 https://example.com",
                        '''/bin/bash -lc "curl --noproxy '*' --max-time 5 https://example.com"''',
                        '''/bin/zsh -lc "curl --noproxy '*' --max-time 5 https://example.com"''',
                        '''zsh -c "curl --noproxy '*' --max-time 5 https://example.com"'''):
            result = seal_module.seal(transcript(completed(command), self.guest), 'guest-1')
            self.assertTrue(result['sealed'])
            self.assertEqual(result['sealed_by'], 'codex-sandbox')
            self.assertTrue(result['sandbox_probe']['denied'])
            self.assertEqual(result['sandbox_probe']['source'], 'codex-shell-tool')
            self.assertIsNone(result['reason'])

    def test_missing_denial_or_unsupported_guest_is_unsealed(self):
        for events, reason in [([], 'sandbox_denial_unproven'), ([self.guest], 'sandbox_denial_unproven'),
                               ([completed()], 'guest_verification_unavailable'),
                               ([completed(), completed("docker exec guest-1 bash -lc 'exit 0'", False, '')],
                                'guest_verification_unavailable'),
                               ([completed(), completed("docker exec other bash -lc 'exit 0'", 0, '')],
                                'guest_verification_unavailable')]:
            result = seal_module.seal(transcript(*events), 'guest-1')
            self.assertFalse(result['sealed'])
            self.assertEqual(result['reason'], reason)

    def test_host_denial_cannot_seal_a_guest_with_egress(self):
        for network in ('bridge', 'unsealed', 'proxy', '', None):
            result = seal_module.seal(transcript(completed(), self.guest), 'guest-1', network)
            self.assertFalse(result['sealed'])
            self.assertEqual(result['reason'], 'guest_network_unsealed')
            self.assertTrue(result['sandbox_probe']['denied'])

    def test_generic_errors_echoes_and_incomplete_events_cannot_prove_denial(self):
        refused = [completed(output='curl: (6) Could not resolve host'),
                   completed(output='curl: (7) Failed to connect'),
                   completed(code=0), completed(code=True), completed(code=None), completed(output=None),
                   completed(kind='agent_message'), completed(command='echo "Permission denied"'),
                   completed(command="curl --noproxy '*' --max-time 5 https://example.com; echo 'Operation not permitted'"),
                   completed(command="curl --proxy http://127.0.0.1:1 https://example.com"),
                   {'type': 'item.started', 'item': completed()['item']},
                   {'type': 'item.completed', 'item': None}, ['item.completed'], None]
        for event in refused:
            with self.subTest(event=event):
                result = seal_module.seal('not JSON\n' + transcript(event, self.guest), 'guest-1')
                self.assertFalse(result['sealed'])
        result = seal_module.seal(transcript(completed(), self.guest, completed(code=0, output='page')), 'guest-1')
        self.assertFalse(result['sealed'], 'a successful later curl disproves the denial')
        result = seal_module.seal(transcript(completed(code=0, output='page'), self.guest, completed()), 'guest-1')
        self.assertFalse(result['sealed'], 'a successful earlier curl also disproves the denial')
        self.assertEqual(result['reason'], 'shell-tool network probe connected')
        result = seal_module.seal(transcript(completed(code=0, output=None), self.guest, completed()), 'guest-1')
        self.assertFalse(result['sealed'], 'successful receipts without output still disprove confinement')
        self.assertEqual(seal_module.argv_of("unterminated '"), [])

    def test_remote_admission_precedes_model_or_docker(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, 'SWB_ARTIFACT_ROOT': tmp}
            env.pop('BENCH_REMOTE_HOST', None)
            for runner in ('run-instance.sh', 'run-instance-codex.sh', 'fullbench-dryrun.sh',
                           'codex-backfill-dryrun.sh', 'network-dryrun.sh', 'bootstrap.sh',
                           'readonly-liveness.sh'):
                reply = subprocess.run(['bash', str(RIG / runner), 'fixture__instance-1'], env=env,
                                       text=True, capture_output=True, timeout=10)
                self.assertEqual(reply.returncode, 2, reply)
                self.assertIn('authorized remote host', reply.stderr)
            helper = f'source "{RIG}/lib/remote.sh"; swb_remote_required'
            for marker, directory, expected in [('1', tmp, 0), ('0', tmp, 2), ('1', '', 2), ('1', 'relative', 2)]:
                reply = subprocess.run(['bash', '-c', helper], env={**env, 'BENCH_REMOTE_HOST': marker,
                                       'SWB_ARTIFACT_ROOT': directory}, capture_output=True, text=True)
                self.assertEqual(reply.returncode, expected, reply)


if __name__ == '__main__':
    unittest.main()
