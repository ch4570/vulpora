#!/usr/bin/env python3
"""Offline regression tests for measurement integrity; no tokenizer or model is needed."""
import copy
import importlib.util
import json
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

    def covered_routes(self):
        entry = 'skills/demo/SKILL.md'
        self.write(entry, (self.root / entry).read_text() + '\nRead [required](reference.md) for focused work.\n')
        self.plan['scenarios'].append({'id': 'simple', 'task': 'Entry only',
            'baseline': [entry], 'candidate': [entry], 'max_tokens': 1000})
        self.plan['load_coverage'] = {'roots': {'focused': [entry], 'simple': [entry]},
            'rules': [{'source': entry, 'anchor': 'Read [required](reference.md)', 'routes': ['focused'],
                       'files': ['skills/demo/reference.md']}], 'link_sources': [entry],
            'link_targets': {entry: ['skills/demo/reference.md']}}

    def test_removing_a_required_reference_or_route_cannot_bypass_coverage(self):
        self.covered_routes()
        self.plan['scenarios'][0]['candidate'].pop()
        with self.assertRaisesRegex(ValueError, 'Load coverage paths differ'):
            self.measure()
        self.plan['scenarios'].pop()
        with self.assertRaisesRegex(ValueError, 'route inventory differs'):
            self.measure()

    def test_new_instruction_links_and_stale_evidence_anchors_fail_closed(self):
        self.covered_routes()
        entry = 'skills/demo/SKILL.md'
        original = (self.root / entry).read_text()
        self.write(entry, original + '\nRead [new](new-required.md).\n')
        with self.assertRaisesRegex(ValueError, 'Unclassified instruction link'):
            self.measure()
        self.write(entry, original.replace('reference.md', 'new-required.md'))
        with self.assertRaisesRegex(ValueError, 'source anchor changed'):
            self.measure()

    def test_reference_growth_affects_its_selected_route_only(self):
        self.covered_routes()
        before = self.measure()
        self.plan['scenarios'][0]['max_tokens'] = before['scenarios'][0]['tokens'] + 10
        self.write('skills/demo/reference.md', 'additional rule ' * 100)
        after = self.measure()
        self.assertEqual(before['scenarios'][1]['tokens'], after['scenarios'][1]['tokens'])
        checks = {row['id']: row['status'] for row in audit.check_budgets(after, self.plan)}
        self.assertEqual(checks, {'focused': 'OVER_BUDGET', 'simple': 'PASS'})

    def test_coverage_obligations_cannot_reuse_mutable_measurement_groups(self):
        self.covered_routes()
        self.plan['file_groups'] = {'entry': ['skills/demo/SKILL.md']}
        self.plan['load_coverage']['roots']['simple'] = ['@entry']
        with self.assertRaisesRegex(ValueError, 'independent of measured groups'):
            self.measure()

    def test_link_inventory_preserves_occurrences_and_plugin_root_paths(self):
        text = ('[topic](reference.md#details) [again](reference.md) '
                '`${CLAUDE_PLUGIN_ROOT}/agents/reviewer/SOUL.md` [web](https://example.org/page.md)')
        self.assertEqual(audit.instruction_links('skills/demo/SKILL.md', text), [
            'skills/demo/reference.md', 'skills/demo/reference.md', 'agents/reviewer/SOUL.md'])

    def test_load_groups_expand_without_hiding_duplicates_cycles_or_missing_groups(self):
        original = self.measure()['scenarios'][0]['tokens']
        self.plan['file_groups'] = {'entry': ['skills/demo/SKILL.md'],
            'selected': ['@entry', 'skills/demo/reference.md']}
        self.plan['scenarios'][0]['candidate'] = ['@selected']
        self.assertEqual(self.measure()['scenarios'][0]['tokens'], original)
        for entries in [['@missing'], ['@selected'], ['@entry', '@entry']]:
            self.plan['file_groups']['selected'] = entries
            with self.assertRaises(ValueError):
                self.measure()


class CurrentWorkflowCoverage(unittest.TestCase):
    def test_removing_a_mandatory_soul_from_shared_groups_fails(self):
        original = json.loads(Path(__file__).with_name('start-task-load-scenarios.json').read_text())
        source = audit.Source(Path(__file__).resolve().parents[2])
        for role in ['requirement-dialogue', 'task-splitter', 'task-orchestrator']:
            with self.subTest(role=role):
                contract = copy.deepcopy(original)
                contract['file_groups'][role].remove(f'agents/{role}/SOUL.md')
                with self.assertRaises(ValueError):
                    audit.validate_load_coverage(source, contract, 'candidate')

    def test_existing_targets_cannot_hide_changed_or_added_source_links(self):
        contract = json.loads(Path(__file__).with_name('start-task-load-scenarios.json').read_text())
        class ChangedSource(audit.Source):
            replacement = False
            def read(self, relative):
                text = super().read(relative)
                if relative == 'skills/start-task/SKILL.md':
                    if self.replacement:
                        return text.replace('[standard path](reference/kb/lightweight-path.md)',
                                            '[standard path](reference/kb/model-routing.md)')
                    return text + '\nRead [extra](reference/kb/model-routing.md).\n'
                return text
        source = ChangedSource(Path(__file__).resolve().parents[2])
        for replacement in [False, True]:
            with self.subTest(replacement=replacement):
                source.replacement = replacement
                with self.assertRaises(ValueError):
                    audit.validate_load_coverage(source, contract, 'candidate')

    def test_public_workflow_routes_have_source_backed_coverage(self):
        contract = json.loads(Path(__file__).with_name('start-task-load-scenarios.json').read_text())
        self.assertEqual({row['id'] for row in contract['scenarios']}, {
            'start-task-lightweight', 'start-task-standard-primary', 'start-task-standard-independent',
            'start-task-audit-ready', 'start-task-audit-question', 'start-task-audit-partial',
            'start-task-audit-execution-child', 'start-task-audit-conflict'})
        source = audit.Source(Path(__file__).resolve().parents[2])
        for plan in ['baseline', 'candidate']:
            audit.validate_load_coverage(source, contract, plan)
        broken = copy.deepcopy(contract)
        broken['file_groups']['task-splitter'].remove('agents/task-splitter/reference/kb/ownership-write-scopes.md')
        with self.assertRaisesRegex(ValueError, 'Load coverage paths differ'):
            audit.validate_load_coverage(source, broken, 'candidate')


if __name__ == '__main__':
    unittest.main()
