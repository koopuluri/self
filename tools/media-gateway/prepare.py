#!/usr/bin/env python3
"""Create a local gateway release from current media. No network calls or uploads."""
import argparse
import hashlib
import json
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def prepare(root, output):
    files = {}
    for source in sorted((root / '<3/assets').rglob('*')):
        if source.is_symlink():
            raise ValueError('Media symlinks are not publishable')
        if not source.is_file() or source.name in {'README.md', 'manifest.json', '.DS_Store'}:
            continue
        digest = hashlib.sha256()
        with source.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        sha = digest.hexdigest()
        files[source.relative_to(root).as_posix()] = dict(key='sha256/' + sha, sha256=sha, bytes=source.stat().st_size, type=mimetypes.guess_type(source)[0] or 'application/octet-stream')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'version': 1, 'files': files}, indent=2, ensure_ascii=False) + '\n')
    return len(files)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.ghost/media-gateway/release.json')
    args = parser.parse_args()
    print(json.dumps({'media_files': prepare(ROOT, args.output), 'output': str(args.output), 'uploaded': False}))
