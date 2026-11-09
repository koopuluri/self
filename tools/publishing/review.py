#!/usr/bin/env python3
"""Local publication review and purge planning. Never deletes, uploads, pushes or deploys."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def git(root, *args):
    result = subprocess.run(['git', *args], cwd=root, capture_output=True)
    if result.returncode:
        return None
    return result.stdout

def source_paths(root):
    data = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z') or b''
    for relative in sorted(set(x.decode() for x in data.split(b'\0') if x)):
        file = root / relative
        if file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(root.resolve()):
            yield relative, file

def history(root):
    baseline = 'refs/remotes/origin/main'
    known = git(root, 'rev-parse', '--verify', baseline)
    revision = baseline + '..HEAD' if known else 'HEAD'
    commits = git(root, 'rev-list', revision)
    return {'baseline': known.decode().strip() if known else None, 'commits': commits.decode().splitlines() if commits else [], 'baseline_is_last_fetched': True}

def review(root):
    findings = []
    patterns = {
        'credential-like URL parameter': rb'[?&](?:access_token|refresh_token|token|password|secret|signature|api_key)=',
        'private-channel reference': rb'(?i)(?:confidential|do not (?:share|publish)|private conversation)',
    }
    for relative, file in source_paths(root):
        if file.stat().st_size > 4 * 1024 * 1024:
            continue
        content = file.read_bytes()
        for reason, pattern in patterns.items():
            if re.search(pattern, content):
                findings.append({'file': relative, 'reason': reason})
    return {'mode': 'review', 'history': history(root), 'findings': findings,
            'note': 'Advisory flags may occur in code or quotations. Review images/audio, metadata, source diff and outgoing historical versions. No content values are printed.'}

def purge_plan(root, relative):
    target = root / relative
    if relative.startswith('/') or not target.resolve().is_relative_to(root.resolve()):
        raise ValueError('Choose a workspace-relative path')
    aliases = {relative}
    mapping_path = root / '.ghost/reorg-paths.json'
    if mapping_path.exists():
        aliases.update(old for old, new in json.loads(mapping_path.read_text()).items() if new == relative)
    references = []
    for name, file in source_paths(root):
        if file.stat().st_size > 4 * 1024 * 1024:
            continue
        content = file.read_text(errors='replace')
        if any(alias in content or Path(alias).name in content for alias in aliases):
            references.append(name)
    commits = set()
    for alias in aliases:
        data = git(root, 'log', '--all', '--format=%H', '--', alias)
        if data:
            commits.update(data.decode().splitlines())
    manifest_path = root / '<3/assets/manifest.json'
    files = json.loads(manifest_path.read_text()).get('files', {}) if manifest_path.exists() else {}
    sha = None
    if target.is_file():
        digest = hashlib.sha256()
        with target.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024*1024), b''): digest.update(chunk)
        sha = digest.hexdigest()
    objects = {item['key'] for name, item in files.items() if name in aliases or item.get('sha256') == sha}
    return {'mode': 'purge-plan', 'target': relative, 'aliases': sorted(aliases), 'references': references, 'commits': sorted(commits), 'archive_objects': sorted(objects),
            'required_review': ['current and historical text/attachments', 'gateway manifest and any caches', 'Git refs and host-held history', 'all archived object versions and restore entries', 'derived training data and model artifacts if applicable'],
            'performed_deletions': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['review', 'purge-plan'])
    parser.add_argument('path', nargs='?')
    args = parser.parse_args()
    if args.command == 'purge-plan' and not args.path:
        parser.error('purge-plan requires a workspace-relative path')
    result = review(ROOT) if args.command == 'review' else purge_plan(ROOT, args.path)
    output = ROOT / '.ghost' / ('publication-review.json' if args.command == 'review' else 'purge-plan.json')
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'report': str(output), 'external_changes': False, 'findings': len(result.get('findings', []))}))
