#!/usr/bin/env python3
"""Unit checks for Cloud admission/readback failures independently of CLI tests."""
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import plue


def record():
    return {'id': 'ws-1', 'image': {'ref': 'registry/task:latest', 'digest': 'sha256:' + 'a' * 64},
            'network': {'mode': 'none', 'allow': []}}


class ContractChecks(unittest.TestCase):
    def setUp(self):
        self.environ = patch.dict(os.environ, {'PLUE_REPO': 'acme/bench'}, clear=False)
        self.environ.start()
        self.addCleanup(self.environ.stop)
        self.bed = plue.Testbed('unit', image='registry/task:latest', workspace='ws-1')
        self.bed.exec = Mock(return_value=('', '', 0))

    def reply(self, data):
        self.bed._run = AsyncMock(return_value=SimpleNamespace(stdout=json.dumps(data).encode()))

    def test_raw_and_enveloped_receipts(self):
        for data in (record(), {'data': record()}):
            with self.subTest(data=data):
                self.reply(data)
                self.assertEqual(self.bed.view(), record())
                self.assertEqual(self.bed.network(), 'none')
                args = self.bed._run.call_args.args
                self.assertEqual(args[:3], ('workspace', 'view', 'ws-1'))
                self.assertIn('--repo', args)
                self.assertEqual(args[args.index('--format') + 1], 'json')

    def test_malformed_receipts_stop_before_guest_probe(self):
        changes = [
            {'id': 'different'}, {'image': None}, {'image': 'task'},
            {'image': {'ref': '', 'digest': 'sha256:' + 'a' * 64}},
            {'image': {'ref': 'task', 'digest': 'latest'}},
            {'image': {'ref': 'task', 'digest': None}}, {'network': None}, {'network': 'none'},
            {'network': {'mode': 'bogus', 'allow': []}},
            {'network': {'mode': 'none', 'allow': ''}}, {'network': {'mode': 'none', 'allow': [1]}},
            {'network': {'mode': 'none', 'allow': ['']}},
        ]
        for change in changes:
            with self.subTest(change=change):
                self.reply({**record(), **change})
                with self.assertRaises(plue.PlueError) as caught:
                    self.bed.network()
                self.assertEqual(caught.exception.code, 'workspace_contract')
                self.bed.exec.assert_not_called()

    def test_network_receipt_without_legacy_allow_field(self):
        self.reply({**record(), 'network': {'mode': 'none'}})
        self.bed.exec = lambda *args, **kwargs: ('', '', 0)
        self.assertEqual(self.bed.network(), 'none')

    def test_network_requires_both_platform_and_guest(self):
        for mode, allow, probe, expected in [
            ('none', [], '', 'none'), ('proxy', [], '', 'unsealed'),
            ('none', ['example.com'], '', 'unsealed'),
            ('none', [], 'open example.com/80\n', 'unsealed')
        ]:
            with self.subTest(mode=mode, allow=allow, probe=probe):
                self.reply({**record(), 'network': {'mode': mode, 'allow': allow}})
                self.bed.exec.return_value = (probe, '', 0)
                self.assertEqual(self.bed.network(), expected)
        self.reply(record())
        self.bed.exec.return_value = ('', 'probe interrupted', 124)
        with self.assertRaises(plue.PlueError) as caught:
            self.bed.network()
        self.assertEqual(caught.exception.code, 'network')

    def test_admission_records_resolved_image_and_cleans_failed_readback(self):
        self.bed._plue_create = AsyncMock()
        self.bed._plue_stop = AsyncMock()
        self.reply(record())
        self.bed.exec.return_value = ('boot-1\n', '', 0)
        with patch.object(plue.plue_env.SlotLedger, 'from_environment', return_value=None):
            result = self.bed.up(os.getpid())
        self.assertEqual(result['image'], record()['image'])
        self.assertEqual(result['network'], record()['network'])
        self.assertEqual(result['bootId'], 'boot-1')
        self.bed._plue_stop.assert_not_called()
        for change in ({'image': {'ref': 'other', 'digest': 'sha256:' + 'a' * 64}},
                       {'network': {'mode': 'proxy', 'allow': []}}, {'network': None}):
            with self.subTest(change=change):
                self.reply({**record(), **change})
                self.bed._plue_stop.reset_mock()
                self.bed.exec.reset_mock()
                with patch.object(plue.plue_env.SlotLedger, 'from_environment', return_value=None):
                    with self.assertRaises(plue.PlueError):
                        self.bed.up(os.getpid())
                self.bed._plue_stop.assert_awaited_once()
                self.bed.exec.assert_not_called()


if __name__ == '__main__':
    unittest.main()
