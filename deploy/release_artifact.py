#!/usr/bin/env python3
"""Package already verified build outputs and validate their complete SHA-256 manifest."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def files(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError('Symlinks are not allowed in release artifacts')
        if path.is_file() and path != root / 'manifest.json':
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            result[path.relative_to(root).as_posix()] = digest.hexdigest()
    return result


def verify(root):
    root = Path(root).resolve()
    if (root / 'manifest.json').is_symlink():
        raise ValueError('Manifest cannot be a symlink')
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('files') != files(root):
        raise ValueError('Release files differ from the verified manifest')
    if not {'frontend/index.html', 'app.jar'} <= manifest['files'].keys():
        raise ValueError('Release is missing required artifacts')
    return manifest


def package(repo, output, allow_dirty=False):
    repo, output = Path(repo).resolve(), Path(output).resolve()
    sha = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = bool(subprocess.check_output(['git', '-C', str(repo), 'status', '--porcelain'], text=True).strip())
    if dirty and not allow_dirty:
        raise ValueError('Commit reviewed changes before release; --allow-dirty is for local review only')
    jars = list((repo / 'backend/target').glob('*.jar'))
    if len(jars) != 1 or not (repo / 'frontend/dist/index.html').is_file():
        raise ValueError('Build and verify frontend/dist and exactly one backend JAR first')
    output.mkdir(parents=True, exist_ok=False)
    shutil.copytree(repo / 'frontend/dist', output / 'frontend', symlinks=True)
    shutil.copy2(jars[0], output / 'app.jar')
    manifest = {'sourceCommit': sha, 'dirty': dirty, 'builtAt': datetime.now(timezone.utc).isoformat(), 'files': files(output)}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return verify(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['package', 'verify'])
    parser.add_argument('directory', type=Path)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--allow-dirty', action='store_true')
    args = parser.parse_args()
    try:
        manifest = package(args.repo, args.directory, args.allow_dirty) if args.command == 'package' else verify(args.directory)
        print(json.dumps({'sourceCommit': manifest['sourceCommit'], 'dirty': manifest['dirty'], 'files': len(manifest['files']), 'verified': True}))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Release validation failed: {error}\n')
