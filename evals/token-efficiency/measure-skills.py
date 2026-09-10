#!/usr/bin/env python3
"""Measure exact o200k_base source tokens without invoking a model or installing tooling."""
import argparse
import hashlib
import importlib.metadata
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCENARIOS = Path(__file__).with_name('load-scenarios.json')
SCHEMA = 'vulpora.skill-token-inventory/v1'


def safe_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or str(path) != value:
        raise ValueError('Expected a normalized repository-relative path: ' + value)
    return value


class Source:
    def __init__(self, root, revision=None):
        self.root = root.resolve()
        self.revision = revision
        if revision:
            self.revision = subprocess.check_output(
                ['git', 'rev-parse', '--verify', revision + '^{commit}'], cwd=self.root, text=True).strip()

    def read(self, relative):
        safe_path(relative)
        if self.revision:
            return subprocess.check_output(['git', 'show', self.revision + ':' + relative], cwd=self.root).decode('utf-8')
        path = self.root / relative
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(self.root):
            raise ValueError('Missing or unsafe source file: ' + relative)
        return path.read_bytes().decode('utf-8')


def count_file(source, relative, encode):
    text = source.read(relative)
    raw = text.encode('utf-8')
    return {'path': relative, 'bytes': len(raw), 'tokens': len(encode(text)),
            'sha256': hashlib.sha256(raw).hexdigest()}


def manifest_skills(text):
    result = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        row = [part.strip() for part in line.split('|')]
        if row[0] == 'skill':
            if len(row) != 6 or any(item['id'] == row[1] for item in result):
                raise ValueError('Malformed or duplicate skill manifest row')
            result.append({'id': row[1], 'path': safe_path(row[2] + '/SKILL.md')})
    if not result:
        raise ValueError('No skills in manifest')
    return sorted(result, key=lambda item: item['id'])


def split_skill(text):
    match = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not match:
        raise ValueError('Missing skill frontmatter')
    front = match.group(1)
    name = re.search(r'^name:[ \t]*(\S+)[ \t]*$', front, re.M)
    desc = re.search(r'^description:[ \t]*(?:[>|]-?[ \t]*\n((?:[ \t]+.*(?:\n|$))+)|([^\n]+))', front, re.M)
    if not name or not desc:
        raise ValueError('Missing skill name or description')
    description = ' '.join((desc.group(1) or desc.group(2)).split())
    return name.group(1).strip('"\''), description, match.group(0), text[match.end():]


def expand_paths(contract, entries, active=()):
    paths = []
    for entry in entries:
        if entry.startswith('@'):
            name = entry[1:]
            if name in active or name not in contract.get('file_groups', {}):
                raise ValueError('Missing or cyclic load group: ' + name)
            paths.extend(expand_paths(contract, contract['file_groups'][name], (*active, name)))
        else:
            paths.append(safe_path(entry))
    return paths


def instruction_links(filename, text):
    """Collect local Markdown links and canonical plugin-root bundle paths in source order."""
    paths = []
    pattern = r'\]\(([^)]+)\)|\$\{CLAUDE_PLUGIN_ROOT\}/([^`\s]+\.md)'
    for match in re.finditer(pattern, text):
        if match.group(2):
            paths.append(safe_path(match.group(2)))
            continue
        target = match.group(1).split('#')[0]
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or not target.endswith('.md'):
            continue
        paths.append(safe_path(posixpath.normpath(posixpath.join(posixpath.dirname(filename), target))))
    return paths


def validate_load_coverage(source, contract, plan):
    """Bind declared route inventories to source anchors without reading scripts as model context."""
    coverage = contract.get('load_coverage')
    if coverage is None:
        return  # Historical contracts remain reproducible without retroactive edits.
    scenarios = {row['id']: row for row in contract['scenarios']}
    roots = coverage['roots']
    if set(roots) != set(scenarios):
        raise ValueError('Load coverage route inventory differs')
    # Expected obligations must not shrink when a measured group loses a file.
    for entries in [*roots.values(), *(rule['files'] for rule in coverage['rules'])]:
        if any(entry.startswith('@') for entry in entries):
            raise ValueError('Load coverage obligations must be independent of measured groups')
    required = {key: {safe_path(path) for path in value} for key, value in roots.items()}
    for rule in coverage['rules']:
        if not rule['anchor'] or rule['anchor'] not in source.read(rule['source']):
            raise ValueError('Load coverage source anchor changed: ' + rule['source'])
        if not rule['routes'] or not set(rule['routes']).issubset(scenarios):
            raise ValueError('Load coverage rule has an unknown route')
        for route in rule['routes']:
            required[route].update([rule['source'], *rule['files']])
    for route, files in required.items():
        for filename in files:
            safe_path(filename)
        if set(expand_paths(contract, scenarios[route][plan])) != files:
            raise ValueError('Load coverage paths differ: ' + route)
    # New local instruction links in the main routing surfaces need an explicit
    # classification, even if all old declared token budgets still fit.
    declared = set().union(*required.values())
    if set(coverage['link_targets']) != set(coverage['link_sources']):
        raise ValueError('Load coverage link source inventory differs')
    for filename in coverage['link_sources']:
        excluded = coverage.get('excluded_links', {}).get(filename, {})
        if any(not reason for reason in excluded.values()):
            raise ValueError('Excluded load links need a reason')
        links = instruction_links(filename, source.read(filename))
        for relative in links:
            if relative not in declared and relative not in excluded:
                raise ValueError('Unclassified instruction link: ' + relative)
        # Preserve occurrences and order: a target already used on another route
        # cannot silently replace or add an instruction on this source surface.
        if links != coverage['link_targets'][filename]:
            raise ValueError('Load coverage source links changed: ' + filename)


def measure(source, scenario_contract, plan, encode, tokenizer_version):
    validate_load_coverage(source, scenario_contract, plan)
    rows = []
    for item in manifest_skills(source.read('install/manifest.txt')):
        text = source.read(item['path'])
        name, description, front, body = split_skill(text)
        if name != item['id']:
            raise ValueError('Skill ID mismatch: ' + item['id'])
        discovery = 'name: ' + name + '\ndescription: ' + description + '\n'
        rows.append({**item, **count_file(source, item['path'], encode),
                     'body_tokens': len(encode(body)), 'frontmatter_tokens': len(encode(front)),
                     'discovery_tokens': len(encode(discovery)), 'description_tokens': len(encode(description)),
                     'description_chars': len(description), 'lines': len(text.splitlines())})
    scenarios = []
    seen = set()
    for scenario in scenario_contract['scenarios']:
        if scenario['id'] in seen:
            raise ValueError('Duplicate scenario ID: ' + scenario['id'])
        seen.add(scenario['id'])
        paths = expand_paths(scenario_contract, scenario[plan])
        if len(paths) != len(set(paths)) or not paths:
            raise ValueError('Scenario paths must be non-empty and unique: ' + scenario['id'])
        files = [count_file(source, path, encode) for path in paths]
        scenarios.append({'id': scenario['id'], 'task': scenario['task'], 'files': files,
                          'tokens': sum(row['tokens'] for row in files)})
    return {'schema': SCHEMA, 'source_revision': source.revision or 'working-tree', 'plan': plan,
            'tokenizer': {'package': 'tiktoken', 'version': tokenizer_version, 'encoding': 'o200k_base'},
            'measurement': 'Exact encoding-specific source counts; not provider billing or observed runtime loads.',
            'discovery_serialization': 'name: ID\ndescription: NORMALIZED_DESCRIPTION\n',
            'scenario_contract_sha256': hashlib.sha256(json.dumps(scenario_contract, sort_keys=True,
                separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(),
            'totals': {key: sum(row[key] for row in rows) for key in
                       ('tokens', 'body_tokens', 'frontmatter_tokens', 'discovery_tokens', 'description_tokens')},
            'skills': rows, 'scenarios': scenarios}


def compare(baseline, candidate):
    if baseline.get('schema') != SCHEMA or baseline['tokenizer'] != candidate['tokenizer']:
        raise ValueError('Baseline schema/tokenizer identity differs')
    if baseline['scenario_contract_sha256'] != candidate['scenario_contract_sha256']:
        raise ValueError('Baseline scenario definitions differ')
    before = {row['id']: row for row in baseline['scenarios']}
    if set(before) != {row['id'] for row in candidate['scenarios']}:
        raise ValueError('Baseline scenario inventory differs')
    result = []
    for row in candidate['scenarios']:
        old = before[row['id']]['tokens']
        delta = row['tokens'] - old
        result.append({'id': row['id'], 'before_tokens': old, 'after_tokens': row['tokens'],
                       'delta_tokens': delta, 'reduction_percent': round(-100 * delta / old, 2) if old else None})
    return result


def check_budgets(result, contract):
    checks = []
    discovery_limit = contract.get('max_discovery_tokens')
    if discovery_limit is not None:
        checks.append({'id': 'metadata-discovery', 'tokens': result['totals']['discovery_tokens'],
                       'max_tokens': discovery_limit})
    limits = {item['id']: item.get('max_tokens') for item in contract['scenarios']}
    for row in result['scenarios']:
        if limits[row['id']] is not None:
            checks.append({'id': row['id'], 'tokens': row['tokens'], 'max_tokens': limits[row['id']]})
    for check in checks:
        if type(check['max_tokens']) is not int or check['max_tokens'] < 1:
            raise ValueError('Token budget must be a positive integer: ' + check['id'])
        check['status'] = 'PASS' if check['tokens'] <= check['max_tokens'] else 'OVER_BUDGET'
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--revision', help='Read source bytes from an existing Git revision; never checks it out')
    parser.add_argument('--plan', choices=('baseline', 'candidate'), default='candidate')
    parser.add_argument('--scenarios', type=Path, default=DEFAULT_SCENARIOS)
    parser.add_argument('--baseline', type=Path, help='Compare against a captured portable baseline')
    parser.add_argument('--output', type=Path, help='Write JSON here; default is stdout')
    parser.add_argument('--check', action='store_true', help='Fail when a candidate exceeds a declared source-token budget')
    args = parser.parse_args()
    try:
        import tiktoken
    except ImportError:
        parser.exit(2, 'Optional audit dependency missing: install tiktoken==0.14.0 in an isolated environment. No automatic install is performed.\n')
    try:
        encoding = tiktoken.get_encoding('o200k_base')
        encode = lambda text: encoding.encode(text, disallowed_special=())
        contract = json.loads(args.scenarios.read_text())
        if contract.get('schema') != 'vulpora.skill-load-scenarios/v1':
            raise ValueError('Unsupported scenario schema')
        if args.check and args.plan != 'candidate':
            raise ValueError('--check applies only to the candidate load plan')
        result = measure(Source(args.root, args.revision), contract, args.plan, encode,
                         importlib.metadata.version('tiktoken'))
        if args.baseline:
            result['comparison'] = compare(json.loads(args.baseline.read_text()), result)
        if args.check:
            result['budget_checks'] = check_budgets(result, contract)
        rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered)
            print('Wrote ' + str(args.output))
        else:
            print(rendered, end='')
        if args.check and any(item['status'] != 'PASS' for item in result['budget_checks']):
            return 1
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, 'token_audit_error: ' + str(error) + '\n')


if __name__ == '__main__':
    sys.exit(main())
