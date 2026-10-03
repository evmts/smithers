"""Offline API-equivalent pricing checks against the committed model card."""
from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import pricing

MODEL = 'openai/gpt-6.1-sol'
AT = '2026-10-02T00:00:00Z'


class PricingTests(unittest.TestCase):
    def test_default_model_uses_the_committed_rate_card(self):
        # Parse the owning card independently so fixture rates cannot drift.
        source = pricing.TABLE.read_text()
        table = json.loads(re.search(r'export const modelPrices[^=]*=\s*(\{.*\})\s*$', source, re.S).group(1))
        row = table['gpt-6.1-sol']
        self.assertEqual((row['input'], row['cacheRead'], row['output']), (2, 0.2, 10))
        self.assertEqual(row['longContextFrom'], 272000)
        self.assertEqual((row['longContext']['input'], row['longContext']['cacheRead'], row['longContext']['output']),
                         (4, 0.4, 15))
        for name in ('gpt-6.1-sol', 'openai:gpt-6.1-sol', MODEL):
            self.assertEqual(pricing.rates(name), row)

    def test_cached_input_subtracted_reasoning_not_double_counted(self):
        usage = [{'input': 1000, 'cached': 800, 'output': 50, 'reasoning': 30}]
        estimate = pricing.estimate(MODEL, usage, AT)
        self.assertAlmostEqual(estimate['usd'], 0.00106)
        self.assertIn('API-equivalent', estimate['basis'])
        self.assertIn('subscription billing is not per token', estimate['basis'])
        self.assertEqual(estimate['source'], 'packages/smithers/agent/model/src/internal/prices.generated.ts')
        usage[0].pop('reasoning')
        self.assertEqual(pricing.estimate(MODEL, usage, AT), estimate)
        self.assertEqual(pricing.estimate(MODEL, [{'input': 0, 'cached': 0, 'output': 0}], AT)['usd'], 0)
        self.assertIsNone(pricing.estimate(MODEL, [], AT)['usd'])

    def test_long_context_boundary_is_inclusive_per_request(self):
        for prompt, expected in [(271999, 0.543908), (272000, 1.087775), (272001, 1.087779)]:
            with self.subTest(prompt=prompt):
                self.assertAlmostEqual(pricing.estimate(MODEL, [{'input': prompt, 'cached': 100, 'output': 9}], AT)['usd'], expected)
        usage = [{'input': 271999, 'cached': 0, 'output': 1}, {'input': 2, 'cached': 0, 'output': 1}]
        self.assertAlmostEqual(pricing.estimate(MODEL, usage, AT)['usd'], 0.544022)
        self.assertNotEqual(pricing.estimate(MODEL, usage, AT)['usd'],
                            pricing.estimate(MODEL, [{'input': 272001, 'cached': 0, 'output': 2}], AT)['usd'])

    def test_invalid_and_missing_counters_fail_closed(self):
        for usage in [None, "malformed", [], {}, {'input': 1, 'cached': 0}, {'input': None, 'cached': 0, 'output': 1},
                      {'input': 1, 'cached': False, 'output': 1}, {'input': -1, 'cached': 0, 'output': 1},
                      {'input': 1, 'cached': 0, 'output': 1.0}, {'input': 1, 'cached': 0, 'output': '1'}]:
            with self.subTest(usage=usage):
                result = pricing.estimate(MODEL, [usage], AT)
                self.assertIsNone(result['usd'])
                self.assertEqual(result['reason'], 'missing request token counts')
        self.assertEqual(pricing.estimate(MODEL, [{'input': 1, 'cached': 2, 'output': 0}], AT)['reason'],
                         'cached tokens exceed input')
        unknown = pricing.estimate('openai/missing-model', [{'input': 1, 'cached': 0, 'output': 1}], AT)
        self.assertEqual(unknown, {'usd': None, 'reason': 'unpriced model: openai/missing-model'})

    def test_context_size_selects_tier_for_incremental_session_counts(self):
        usage = [{"input": 1, "cached": 0, "output": 1, "context_input": 272000}]
        self.assertAlmostEqual(pricing.estimate(MODEL, usage, AT)["usd"], 0.000019)
        usage[0]["context_input"] = 271999
        self.assertAlmostEqual(pricing.estimate(MODEL, usage, AT)["usd"], 0.000012)
        for context in (None, "large", False, -1):
            usage[0]["context_input"] = context
            self.assertEqual(pricing.estimate(MODEL, usage, AT)["reason"], "invalid request context token count")
        for malformed in (None, {}, "malformed"):
            self.assertEqual(pricing.estimate(MODEL, malformed, AT)["reason"], "missing request token counts")

    def test_price_effective_date_inclusive_and_table_errors_visible(self):
        row = {'input': 2, 'cacheRead': 0.2, 'output': 10,
               'nextFrom': '2026-10-02T00:00:00Z',
               'next': {'input': 4, 'cacheRead': 0.4, 'output': 15}}
        with patch.object(pricing, 'rates', return_value=row):
            usage = [{'input': 100, 'cached': 0, 'output': 10}]
            self.assertAlmostEqual(pricing.estimate(MODEL, usage, '2026-10-01T23:59:59Z')['usd'], 0.0003)
            self.assertAlmostEqual(pricing.estimate(MODEL, usage, AT)['usd'], 0.00055)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.ts'
            path.write_text('export const modelPrices = not_a_json_card')
            with patch.object(pricing, 'TABLE', path), self.assertRaisesRegex(ValueError, 'not a JSON object'):
                pricing.estimate(MODEL, [], AT)


if __name__ == '__main__':
    unittest.main(verbosity=2)
