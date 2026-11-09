#!/usr/bin/env python3
"""Export a verified checkpoint with its archived native compositor to HEVC MP4."""
import argparse
import subprocess

from process import ROOT, TOOL, digest, inside, verify, runtime_recipe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recipe')
    parser.add_argument('output', help='New MP4 path inside Ghost; copy to a requested destination after verification.')
    args = parser.parse_args()
    recipe, output = inside(args.recipe), inside(args.output)
    record = verify(recipe)
    if output.exists():
        raise ValueError('Export destination already exists')
    source = inside(record['renderer']['source']).read_text()
    marker = '@main struct Main {'
    if source.count(marker) != 1:
        raise ValueError('Archived renderer has an unsupported entry point')
    # Preserve all archived composition code, replacing only preview/probe dispatch.
    source = source.split(marker)[0] + (TOOL / 'Export.swift').read_text()
    folder = ROOT / '.ghost/video-process/exporters' / digest(source.encode())
    folder.mkdir(parents=True, exist_ok=True)
    swift, executable = folder / 'Export.swift', folder / 'GhostExport'
    swift.write_text(source)
    if not executable.exists():
        result = subprocess.run(['swiftc', '-swift-version', '5', '-parse-as-library', '-O',
                                 '-module-cache-path', str(ROOT / '.ghost/video-process/module-cache'),
                                 str(swift), '-o', str(executable)], capture_output=True, text=True)
        (folder / 'build.log').write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(result.stderr[-4000:])
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(executable), str(runtime_recipe(recipe)), str(ROOT), str(output)], check=True)


if __name__ == '__main__':
    main()
