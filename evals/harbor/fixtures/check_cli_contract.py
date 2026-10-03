"""Offline argv checks sourced from the owning CLI declarations.

Default mode requires the benchmark's root-user contract. --syntax-only runs
parser tests separately while L1's workspace exec --user is pending; it is not
a passing benchmark gate.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cli_contract as contract


class CliContractTests(unittest.TestCase):
    def reject(self, argv: list[str], message: str) -> None:
        with self.assertRaisesRegex(ValueError, message):
            contract.validate(argv)

    def test_workspace_commands_from_source(self) -> None:
        cases = [
            ['workspace', 'create', '--repo', 'acme/bench', '--image', 'oci:tag', '--network', 'proxy', '--cpus', '8', '--memory', '32768',
             '--disk', '50', '--wait', '--wait-timeout=600', '--format', 'json'],
            ['workspace', 'exec', 'ws-1', '--command', 'echo --unknown; printf %s --format',
             '--env', 'A=1', '--env', 'B=2', '--timeout', '0', '--exec-id', 'durable-id', '--format=json'],
            ['workspace', 'cp', '/tmp/in', 'ws-1:/tmp/out', '--user', 'root', '-R', 'acme/bench', '--format', 'json'],
            ['workspace', 'view', 'ws-1', '--repo', 'acme/bench', '--format', 'json'],
            ['workspace', 'delete', 'ws-1', '--yes', '--no-verbose', '--format', 'json'],
            ['workspace', 'list', '--format', 'json'],
            ['workspace', 'view', '--', '--literal-workspace-id'],
            ['--format', 'json', '--quiet', 'workspace', 'view', 'ws-1'],
            ['--format=json', '--no-verbose', 'workspace', 'view', 'ws-1'],
        ]
        for argv in cases:
            with self.subTest(argv=argv):
                contract.validate(argv)
        options = contract.options('workspace create')
        self.assertEqual(options['--wait'].kind, 'boolean')
        self.assertEqual(options['--disk'].kind, 'number')
        self.assertEqual(options['--wait-timeout'].kind, 'number')
        self.assertNotIn('--waitTimeout', options)
        self.assertTrue(contract.options('workspace exec')['--env'].repeatable)
        self.assertIn('--seed-agent-auth', contract.options('workspace exec'))
        self.assertEqual(contract.global_options()['--format'].kind, 'string')

    def test_refuses_undeclared_and_malformed_flags(self) -> None:
        for argv in [
            ['workspace', 'create', '--disk-mb', '10240'],
            ['workspace', 'create', '--waitTimeout', '10'],
            ['workspace', 'exec', 'ws-1', '--command', 'true', '--made-up'],
            ['workspace', 'cp', 'a', 'b', '--image', 'oci:tag'],
            ['workspace', 'view', 'ws-1', '--wait'],
            ['workspace', 'list', '--global-imaginary=json'],
            ['workspace', 'delete', 'ws-1', '-x'],
            ['workspace', 'create', '--no-image'],
        ]:
            with self.subTest(argv=argv):
                self.reject(argv, 'Undeclared CLI flag')
        self.reject(['workspace', 'invented'], 'Undeclared CLI command')
        self.reject(['other', 'create'], 'workspace command')
        self.reject(['--imaginary', 'workspace', 'view', 'ws-1'], 'Undeclared global CLI flag')
        self.reject(['--format'], 'Missing value')
        self.reject(['--quiet=maybe', 'workspace', 'view', 'ws-1'], 'Invalid boolean')
        self.reject(['workspace', 'exec', 'ws-1'], 'Missing required CLI flags')
        self.reject(['workspace', 'create', '--disk'], 'Missing value')
        for value in ['big', 'nan', 'inf']:
            self.reject(['workspace', 'create', '--disk', value], 'Invalid number')
        self.reject(['workspace', 'create', '--wait=maybe'], 'Invalid boolean')
        self.reject(['workspace', 'create', '--no-wait=true'], 'Invalid boolean')
        self.reject(['workspace', 'view'], 'expects 1..1 arguments')
        self.reject(['workspace', 'create', 'unexpected'], 'expects 0..0 arguments')
        self.reject(['workspace', 'cp', 'a'], 'expects 2..2 arguments')
        contract.validate(['workspace', 'create', '--wait=false', '--disk=1.5'])
        contract.validate(['workspace', 'create', '--wait', 'false'])
        contract.validate(['workspace', 'exec', '--command', '--unknown'])

    def test_source_drift_is_not_hidden_by_fake(self) -> None:
        # Remove a real option from a source copy; the very same fake and argv
        # must stop returning success, without updating a fixture allowlist.
        source = contract.DEFINITIONS.read_text()
        start = source.index('  "workspace create":')
        head, tail = source[:start], source[start:]
        tail = tail.replace('"image": z.string()', '"replacementImage": z.string()', 1)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            definitions = root / 'Definitions.ts'
            definitions.write_text(head + tail)
            with patch.object(contract, 'DEFINITIONS', definitions):
                self.reject(['workspace', 'create', '--image', 'oci:tag'], 'Undeclared CLI flag')
                contract.validate(['workspace', 'create', '--replacement-image', 'oci:tag'])
            definitions.write_text(head + source[start:].replace('"network": z.string()', '"network": z.enum(["none", "proxy"])', 1))
            with patch.object(contract, 'DEFINITIONS', definitions):
                for mode in ('none', 'proxy'):
                    contract.validate(['workspace', 'create', '--network', mode])
                self.reject(['workspace', 'create', '--network', 'allowlist'], 'Invalid value for --network')
            # Malformed declarations fail closed.
            definitions.write_text(source.replace('"disk": z.coerce.number()', '"disk": unknown()', 1))
            with patch.object(contract, 'DEFINITIONS', definitions):
                self.reject(['workspace', 'create', '--disk', '50'], 'Unsupported CLI option')

    def test_fake_python_and_shell_cli_refuse_before_side_effects(self) -> None:
        for shebang, body in [
            ('#!/usr/bin/env python3', "from pathlib import Path\nPath(os.environ['MARKER']).write_text('accepted')\nprint('{}')\n"),
            ('#!/bin/sh', 'printf accepted > "$MARKER"\nprintf "{}"\n'),
        ]:
            with self.subTest(shebang=shebang), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                cli = root / 'smthrs'
                marker = root / 'marker'
                contract.write_fake_cli(cli, shebang + '\n' + body)
                cli.chmod(0o700)
                env = {'MARKER': str(marker)}  # no PATH or PYTHONPATH
                invalid = subprocess.run([str(cli), 'workspace', 'view', 'ws-1', '--bogus'], env=env,
                                         text=True, capture_output=True, timeout=10)
                self.assertEqual(invalid.returncode, 2, invalid)
                self.assertIn('Undeclared CLI flag', invalid.stderr)
                self.assertFalse(marker.exists())
                valid = subprocess.run([str(cli), 'workspace', 'view', 'ws-1', '--format', 'json'], env=env,
                                       text=True, capture_output=True, timeout=10)
                self.assertEqual(valid.returncode, 0, valid)
                self.assertEqual(valid.stdout, '{}\n' if 'python' in shebang else '{}')
                self.assertEqual(marker.read_text(), 'accepted')

    def test_no_fake_acceptance_of_undeclared_root_user(self) -> None:
        argv = ['workspace', 'exec', 'ws-1', '--user', 'root', '--command', 'true', '--format', 'json']
        if '--user' in contract.options('workspace exec'):
            contract.validate(argv)
        else:
            self.reject(argv, 'Undeclared CLI flag.*--user')


class BenchmarkDependencyTests(unittest.TestCase):
    def test_benchmark_create_cuts_allow_flag(self) -> None:
        self.assertNotIn('--allow', contract.options('workspace create'))
        self.reject_allow_flag()

    def reject_allow_flag(self) -> None:
        with self.assertRaisesRegex(ValueError, 'Undeclared CLI flag.*--allow'):
            contract.validate(['workspace', 'create', '--allow', 'example.com'])

    def test_benchmark_exec_requires_declared_root_user(self) -> None:
        # Keep this red until the owning CLI lane supplies the declaration.
        contract.validate(['workspace', 'exec', 'ws-1', '--user', 'root', '--command', 'true', '--timeout', '0',
                           '--format', 'json'])


if __name__ == '__main__':
    if '--syntax-only' in sys.argv:
        sys.argv.remove('--syntax-only')
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(CliContractTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        sys.exit(not result.wasSuccessful())
    unittest.main(verbosity=2)
