#!/usr/bin/env python3
"""Prepare an exact publication; execute only after the user approves its message."""
from __future__ import annotations
import argparse
import base64
import contextlib
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MEDIA = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.mp3', '.wav', '.pdf', '.blend'}
SECRET_PATTERNS = [
    rb'gh[pousr]_[A-Za-z0-9]{30,}',
    rb'github_pat_[A-Za-z0-9_]{30,}',
    rb'pat[A-Za-z0-9]{14}\.[A-Fa-f0-9]{40,}',
    rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    rb'AKIA[A-Z0-9]{16}',
]


def run(*args, cwd=ROOT, env=None, check=True):
    runtime = ROOT / 'tools/publishing/node_modules/.bin'
    env = dict(os.environ if env is None else env)
    env['PATH'] = str(runtime) + os.pathsep + env.get('PATH', '')
    if args[0] == 'vercel':
        local = ROOT / 'tools/publishing/node_modules/.bin/vercel'
        if local.exists():
            args = (str(local), *args[1:])
    p = subprocess.run(args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode:
        # Do not echo credentials embedded in provider diagnostics or Git URLs.
        raise RuntimeError(f'{args[0]} {args[1] if len(args) > 1 else ""} failed (exit {p.returncode}); inspect the service locally')
    return p


def git(*args, **kw):
    return run('git', *args, **kw).stdout.decode().strip()


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    tmp.replace(path)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def load_credentials(root):
    path = root / '.ghost/r2.env'
    if not path.exists():
        return
    if path.stat().st_mode & 0o077:
        raise RuntimeError('private credential file must have owner-only permissions (chmod 600)')
    allowed = {'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        name, sep, value = line.partition('=')
        if not sep or name.strip() not in allowed:
            raise RuntimeError('unrecognized private credential setting')
        os.environ.setdefault(name.strip(), value.strip().strip('\"\''))


def inside(root, relative):
    p = root / relative
    if p.is_symlink() or not p.resolve().is_relative_to(root.resolve()):
        raise RuntimeError(f'unsafe path: {relative}')
    return p


def assets(root):
    previous = read_json(root / '<3/assets/manifest.json', {'files': {}})['files']
    result = dict(previous)  # Missing local media can be restored; never silently delete history.
    paths = list((root / '<3/assets').rglob('*'))
    paths += [p for p in root.iterdir() if p.suffix.lower() in MEDIA]
    for p in sorted(paths):
        if p.name in {'README.md', 'manifest.json', '.DS_Store'} or not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        inside(root, rel)
        sha = digest(p)
        result[rel] = {'sha256': sha, 'bytes': p.stat().st_size, 'key': f'sha256/{sha}'}
    return {'version': 1, 'visibility': 'private', 'files': dict(sorted(result.items()))}


def scan(paths):
    problems = []
    for p in paths:
        data = p.read_bytes()
        if any(re.search(pattern, data) for pattern in SECRET_PATTERNS):
            problems.append(str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else p.name)
    if problems:
        raise RuntimeError('credential patterns found; review these files without printing values: ' + ', '.join(problems))


def snapshot(root):
    """Use an independent index; preparation never alters the user's staging area."""
    state = root / '.ghost'
    state.mkdir(exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='index-', dir=state)
    os.close(fd)
    os.unlink(name)
    env = dict(os.environ, GIT_INDEX_FILE=name)
    try:
        git('read-tree', '--empty', cwd=root, env=env)
        # Check before writing any prospective source blobs to Git.
        tracked = run('git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', cwd=root).stdout
        files = [inside(root, s.decode()) for s in tracked.split(b'\0') if s]
        scan([p for p in files if p.is_file()])
        git('add', '-A', '.', cwd=root, env=env)
        tree = git('write-tree', cwd=root, env=env)
        entries = run('git', 'ls-tree', '-r', '-z', tree, cwd=root).stdout
        return tree, entries
    finally:
        Path(name).unlink(missing_ok=True)
        Path(name + '.lock').unlink(missing_ok=True)


def fingerprint(entries, patterns):
    selected = []
    for entry in entries.split(b'\0'):
        if not entry:
            continue
        _, path = entry.split(b'\t', 1)
        if any(fnmatch.fnmatchcase(path.decode(), pattern) for pattern in patterns):
            selected.append(entry)
    return hashlib.sha256(b'\0'.join(sorted(selected))).hexdigest()


def head(root):
    p = run('git', 'rev-parse', '--verify', 'HEAD', cwd=root, check=False)
    return p.stdout.decode().strip() if p.returncode == 0 else None


def prepare(root, message):
    if not message.strip() or message != message.lower() or '\n' in message or len(message) > 300:
        raise RuntimeError('use a short lowercase message, one or two informal sentences')
    config = read_json(root / 'ghost.publish.json')
    manifest = assets(root)
    write_json(root / '<3/assets/manifest.json', manifest)
    tree, entries = snapshot(root)
    fp = hashlib.sha256((fingerprint(entries, config['site']['inputs']) +
        json.dumps(config['site'], sort_keys=True)).encode()).hexdigest()
    plan = {'version': 1, 'base': head(root), 'tree': tree, 'message': message,
            'site_fingerprint': fp, 'assets': manifest, 'config': config}
    plan['id'] = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    write_json(root / '.ghost/publish-plan.json', plan)
    previous = read_json(root / '.ghost/published-site.json', {})
    print(json.dumps({'plan': plan['id'], 'message': message,
        'assets': len(manifest['files']), 'asset_bytes': sum(a['bytes'] for a in manifest['files'].values()),
        'site_changed': previous.get('fingerprint') != fp,
        'r2_enabled': config['assets']['enabled'], 'tree': tree}, indent=2))


def validate(root, plan):
    if assets(root) != plan['assets']:
        raise RuntimeError('media changed since preparation; prepare and approve a new snapshot')
    tree, _ = snapshot(root)
    if tree != plan['tree']:
        raise RuntimeError('files changed since preparation; prepare and approve a new snapshot')


def require_storage(config):
    if not config['enabled']:
        raise RuntimeError('R2 is disabled pending the storage budget decision; no publication was started')
    if config['billing_policy'] != 'private_guardrails_accepted':
        raise RuntimeError('R2 has no verified $20 provider hard cap; user must explicitly accept guardrails before enabling uploads')


class Storage:
    def __init__(self, config):
        require_storage(config)
        required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
        if any(not os.environ.get(k) for k in required):
            raise RuntimeError('missing private R2 credentials: configure the names listed in publishing/.env.example')
        import boto3
        from botocore.config import Config
        self.config = config
        self.account = os.environ['CLOUDFLARE_ACCOUNT_ID']
        self.bucket = config['bucket']
        self.calls = 0
        self.s3 = boto3.client('s3', endpoint_url=f'https://{self.account}.r2.cloudflarestorage.com',
            aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto',
            config=Config(retries={'mode': 'standard', 'total_max_attempts': 2}, connect_timeout=15, read_timeout=120))
        self.verify_private()

    def api(self, endpoint):
        req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{self.account}/r2/buckets/{self.bucket}/{endpoint}',
            headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.load(response)
        if not data.get('success'):
            raise RuntimeError('could not verify R2 privacy')
        return data['result']

    def verify_private(self):
        if self.api('domains/managed').get('enabled') is not False:
            raise RuntimeError('r2.dev public access must be disabled')
        domains = self.api('domains/custom').get('domains')
        if not isinstance(domains, list) or domains:
            raise RuntimeError('private archive must have no custom domains')

    def call(self, method, **kw):
        self.calls += 2  # Reserve both configured SDK attempts before the call.
        if self.calls > self.config['max_requests_per_run']:
            raise RuntimeError('local request budget reached; stopping')
        return getattr(self.s3, method)(Bucket=self.bucket, **kw)

    def inventory(self):
        result = {}
        token = None
        while True:
            page = self.call('list_objects_v2', **({'ContinuationToken': token} if token else {}))
            for item in page.get('Contents', []):
                result[item['Key']] = item['Size']
            if len(result) > self.config['max_objects']:
                raise RuntimeError('archive object limit reached')
            if not page.get('IsTruncated'):
                return result
            token = page['NextContinuationToken']

    def upload(self, root, manifest):
        remote = self.inventory()
        unique = {}
        for rel, item in manifest['files'].items():
            previous = unique.get(item['key'])
            # Retain historical restore records, but upload from a current path
            # when organization moved an asset before its first backup.
            if previous is None or (not inside(root, previous[0]).is_file()
                                    and inside(root, rel).is_file()):
                unique[item['key']] = (rel, item)
        missing = [(rel, a) for key, (rel, a) in unique.items() if key not in remote]
        size = sum(a['bytes'] for _, a in missing)
        if size > self.config['max_upload_bytes'] or size + sum(remote.values()) > self.config['max_archive_bytes']:
            raise RuntimeError('local storage/upload budget exceeded')
        if len(remote) + len(missing) > self.config['max_objects']:
            raise RuntimeError('archive object limit reached')
        for rel, item in missing:
            p = inside(root, rel)
            if not p.is_file() or digest(p) != item['sha256']:
                raise RuntimeError(f'missing or changed media: {rel}')
            if item['bytes'] > 5_000_000_000:
                raise RuntimeError(f'file exceeds single-upload limit: {rel}')
        # Verify existing immutable objects too; size alone does not establish identity.
        for key, (_, item) in unique.items():
            if key in remote:
                metadata = self.call('head_object', Key=key)
                if metadata['ContentLength'] != item['bytes'] or metadata.get('Metadata', {}).get('sha256') != item['sha256']:
                    raise RuntimeError(f'archive object failed verification: {key}')
        for rel, item in missing:
            local_path = inside(root, rel)
            sha = hashlib.sha256()
            md5 = hashlib.md5(usedforsecurity=False)
            with local_path.open('rb') as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b''):
                    sha.update(chunk)
                    md5.update(chunk)
            if sha.hexdigest() != item['sha256']:
                raise RuntimeError(f'media changed before upload: {rel}')
            with inside(root, rel).open('rb') as f:
                self.call('put_object', Key=item['key'], Body=f, ContentLength=item['bytes'],
                          Metadata={'sha256': item['sha256']}, ContentType='application/octet-stream',
                          ContentMD5=base64.b64encode(md5.digest()).decode())
            check = self.call('head_object', Key=item['key'])
            if check['ContentLength'] != item['bytes'] or check.get('Metadata', {}).get('sha256') != item['sha256']:
                raise RuntimeError(f'upload verification failed: {rel}')
        return len(missing)


def restore(root):
    config = read_json(root / 'ghost.publish.json')['assets']
    storage = Storage(config)
    manifest = read_json(root / '<3/assets/manifest.json')
    restored = 0
    for rel, item in manifest['files'].items():
        destination = '<3/' + rel if rel.startswith('assets/') else rel
        p = inside(root, destination)
        if p.exists():
            if digest(p) != item['sha256']:
                raise RuntimeError(f'local edits preserved; refusing to overwrite {rel}')
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix='.restore-', dir=p.parent)
        os.close(fd)
        try:
            response = storage.call('get_object', Key=item['key'])
            with open(temp, 'wb') as f, contextlib.closing(response['Body']) as body:
                for chunk in iter(lambda: body.read(1024 * 1024), b''):
                    f.write(chunk)
            if digest(Path(temp)) != item['sha256']:
                raise RuntimeError(f'restored checksum mismatch: {rel}')
            # Atomic create; never overwrite a file appearing during the download.
            os.link(temp, p)
            restored += 1
        finally:
            Path(temp).unlink(missing_ok=True)
    print(json.dumps({'restored': restored}))


def ensure_remote(root, config):
    expected = f'https://github.com/{config["repository"]}.git'
    remote = config['remote']
    existing = run('git', 'remote', 'get-url', remote, cwd=root, check=False)
    if existing.returncode == 0:
        if existing.stdout.decode().strip() not in {expected, f'git@github.com:{config["repository"]}.git'}:
            raise RuntimeError('Git remote differs from the approved destination')
        return
    check = run('gh', 'repo', 'view', config['repository'], '--json', 'nameWithOwner', cwd=root, check=False)
    if check.returncode != 0:
        # Creation errors stop the flow; no force pushing or guessing another owner.
        run('gh', 'repo', 'create', config['repository'], '--' + config['visibility'], cwd=root)
    git('remote', 'add', remote, expected, cwd=root)


def publish(root, approval):
    plan = read_json(root / '.ghost/publish-plan.json')
    if not plan or approval != plan['id']:
        raise RuntimeError('approval must identify the exact prepared plan')
    state_path = root / '.ghost' / ('release-' + plan['id'] + '.json')
    journal = read_json(state_path, {})
    if journal.get('complete'):
        print(json.dumps(journal, indent=2)); return
    if journal.get('deployment_started') and not journal.get('site_url'):
        raise RuntimeError('previous deployment outcome is uncertain; inspect Vercel and reconcile the release receipt before retrying')
    validate(root, plan)
    expected_head = journal.get('commit', plan['base'])
    if head(root) != expected_head:
        raise RuntimeError('Git history changed; prepare a new publication')
    config = plan['config']
    if config.get('media', {}).get('status') == 'local-only-pending-cloudflare-setup':
        raise RuntimeError('external setup is deferred: complete and verify the GitHub/media plan before publication')
    require_storage(config['assets'])  # Fail before any publication, including Git.
    if git('branch', '--show-current', cwd=root) != config['git']['branch']:
        raise RuntimeError('current branch differs from the approved publishing branch')
    if not git('config', 'user.name', cwd=root) or not git('config', 'user.email', cwd=root):
        raise RuntimeError('configure your Git author name and email first')
    run('gh', 'auth', 'status', cwd=root)
    storage = Storage(config['assets'])
    site = config['site']
    scope = ['--scope', site['scope']] if site.get('scope') else []
    previous = read_json(root / '.ghost/published-site.json', {})
    site_changed = previous.get('fingerprint') != plan['site_fingerprint']
    site_path = inside(root, site['directory'])
    if site_changed and not journal.get('site_url'):
        # Link/pull configure local state; neither deploys nor changes the live site.
        run('vercel', 'link', '--yes', '--project', site['project'], *scope, cwd=site_path)
        linked = read_json(site_path / '.vercel/project.json', {})
        if linked.get('projectId') != site['project_id']:
            raise RuntimeError('linked Vercel project differs from the approved destination')
        run('vercel', 'pull', '--yes', '--environment=production', *scope, cwd=site_path)
        run('npm', 'ci', '--no-fund', '--no-audit', cwd=site_path)
        run('vercel', 'build', '--prod', cwd=site_path)
        validate(root, plan)
    journal['assets_uploaded'] = storage.upload(root, plan['assets'])
    write_json(state_path, journal)
    validate(root, plan)
    ensure_remote(root, config['git'])
    if not journal.get('commit'):
        if plan['base'] and git('rev-parse', 'HEAD^{tree}', cwd=root) == plan['tree']:
            journal['commit'] = plan['base']
        else:
            git('add', '-A', '.', cwd=root)
            if git('write-tree', cwd=root) != plan['tree']:
                raise RuntimeError('staged snapshot changed; stopping before commit')
            git('commit', '-m', plan['message'], cwd=root)
            journal['commit'] = head(root)
        write_json(state_path, journal)
    if git('rev-parse', journal['commit'] + '^{tree}', cwd=root) != plan['tree']:
        raise RuntimeError('committed files differ from the approved snapshot; refusing to push')
    git('push', config['git']['remote'], f'{journal["commit"]}:refs/heads/{config["git"]["branch"]}', cwd=root)
    journal['pushed'] = True
    write_json(state_path, journal)
    if site_changed and not journal.get('site_url'):
        journal['deployment_started'] = True
        write_json(state_path, journal)
        result = run('vercel', 'deploy', '--prebuilt', '--prod', '--yes', *scope, cwd=site_path)
        urls = re.findall(r'https://[^\s]+\.vercel\.app', result.stdout.decode())
        if not urls:
            raise RuntimeError('deployment result ambiguous; inspect Vercel before retrying')
        journal['site_url'] = urls[-1]
        write_json(state_path, journal)
    if journal.get('site_url'):
        run('vercel', 'inspect', journal['site_url'], '--wait', *scope, cwd=site_path)
        write_json(root / '.ghost/published-site.json', {'fingerprint': plan['site_fingerprint'],
            'commit': journal['commit'], 'url': journal['site_url']})
    journal['site_status'] = 'deployed' if journal.get('site_url') else 'unchanged; skipped'
    journal['complete'] = True
    journal['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    write_json(state_path, journal)
    print(json.dumps(journal, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('prepare').add_argument('--message', required=True)
    sub.add_parser('publish').add_argument('--approved-plan', required=True)
    sub.add_parser('restore')
    args = parser.parse_args()
    try:
        if args.command != 'prepare':
            load_credentials(ROOT)
        if args.command == 'prepare': prepare(ROOT, args.message)
        elif args.command == 'publish':
            # A second publisher must not race commits, uploads, or release receipts.
            import fcntl
            (ROOT / '.ghost').mkdir(exist_ok=True)
            with (ROOT / '.ghost/publish.lock').open('w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                publish(ROOT, args.approved_plan)
        else: restore(ROOT)
    except Exception as exc:
        # SDK/HTTP exception bodies can contain request signatures; redact them.
        print(str(exc) if isinstance(exc, RuntimeError) else f'{type(exc).__name__}: stopped; no further publication steps ran', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
