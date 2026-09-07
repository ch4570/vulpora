#!/usr/bin/env python3
"""Offline regression tests for measurement integrity; no tokenizer or model is needed."""
import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('measure_skills', Path(__file__).with_name('measure-skills.py'))
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class MeasurementIntegrity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.write('install/manifest.txt', 'skill | demo | skills/demo | - | - | -\n')
        self.write('skills/demo/SKILL.md', '---\nname: demo\ndescription: >-\n  Explain the selected\n  fixture contract.\n---\n\nActual procedure, not directory metadata.\n')
        self.write('skills/demo/reference.md', 'Mandatory selected rule.\n')
        self.plan = {'scenarios': [{'id': 'focused', 'task': 'Read the fixture contract',
                      'baseline': ['skills/demo/SKILL.md'],
                      'candidate': ['skills/demo/SKILL.md', 'skills/demo/reference.md']}]}
        self.encode = lambda text: list(text.encode('utf-8'))

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def measure(self, plan='candidate'):
        return audit.measure(audit.Source(self.root), self.plan, plan, self.encode, 'fixture-tokenizer')

    def test_skill_directory_is_resolved_to_complete_entry(self):
        result = self.measure()
        row = result['skills'][0]
        expected = (self.root / 'skills/demo/SKILL.md').read_bytes()
        self.assertEqual(row['bytes'], len(expected))
        self.assertGreater(row['body_tokens'], 20)
        self.assertEqual(row['path'], 'skills/demo/SKILL.md')
        self.assertEqual(result['scenarios'][0]['tokens'], len(expected) + len(b'Mandatory selected rule.\n'))
        self.assertNotIn(str(self.root), str(result))

    def test_missing_selected_reference_is_never_silently_skipped(self):
        (self.root / 'skills/demo/reference.md').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing or unsafe source'):
            self.measure()

    def test_source_rejects_symlink_and_traversal(self):
        (self.root / 'skills/demo/reference.md').unlink()
        (self.root / 'skills/demo/reference.md').symlink_to(self.root / 'skills/demo/SKILL.md')
        with self.assertRaisesRegex(ValueError, 'Missing or unsafe source'):
            self.measure()
        for path in ('../outside.md', '/absolute.md', 'skills/../outside.md', './skills/demo/SKILL.md'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                audit.safe_path(path)

    def test_frontmatter_only_is_distinct_from_loaded_body(self):
        result = self.measure()
        expected = 'name: demo\ndescription: Explain the selected fixture contract.\n'
        self.assertEqual(result['skills'][0]['discovery_tokens'], len(self.encode(expected)))
        self.assertNotEqual(result['skills'][0]['tokens'], result['skills'][0]['discovery_tokens'])

    def test_duplicate_skill_or_reference_cannot_inflate_savings(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            audit.manifest_skills('skill | demo | skills/demo | - | - | -\n' * 2)
        self.plan['scenarios'][0]['candidate'].append('skills/demo/reference.md')
        with self.assertRaisesRegex(ValueError, 'unique'):
            self.measure()

    def test_extra_loaded_example_is_reported_as_regression(self):
        comparison = audit.compare(self.measure('baseline'), self.measure('candidate'))[0]
        self.assertGreater(comparison['delta_tokens'], 0)
        self.assertLess(comparison['reduction_percent'], 0)

    def test_comparison_requires_same_tokenizer_and_scenarios(self):
        before = self.measure('baseline')
        after = self.measure('candidate')
        for mutation in ('encoding', 'scenario'):
            candidate = copy.deepcopy(after)
            if mutation == 'encoding':
                candidate['tokenizer']['encoding'] = 'different'
            else:
                candidate['scenario_contract_sha256'] = 'different'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                audit.compare(before, candidate)

    def test_wrong_skill_name_cannot_be_counted_as_requested_asset(self):
        self.write('skills/demo/SKILL.md', '---\nname: another\ndescription: Wrong asset.\n---\nBody.\n')
        with self.assertRaisesRegex(ValueError, 'ID mismatch'):
            self.measure()

    def test_budget_gate_counts_references_and_reports_overflow(self):
        result = self.measure()
        entry_only = result['skills'][0]['tokens']
        self.plan['scenarios'][0]['max_tokens'] = entry_only
        checks = audit.check_budgets(result, self.plan)
        self.assertEqual(checks[0]['status'], 'OVER_BUDGET')
        self.assertGreater(checks[0]['tokens'], entry_only)


if __name__ == '__main__':
    unittest.main()
