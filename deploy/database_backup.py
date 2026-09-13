#!/usr/bin/env python3
"""SQLite online snapshots and restore drills. Never overwrite an existing database."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time
from datetime import datetime, timezone
from uuid import uuid4


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def verify(path):
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)) as db:
        if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError('Database integrity check failed')
        if db.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise ValueError('Database foreign key check failed')
        return db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]


SIDECARS = ('-wal', '-shm', '-journal')


def reject_sidecars(target):
    for suffix in SIDECARS:
        sidecar = Path(str(target) + suffix)
        if sidecar.exists() or sidecar.is_symlink():
            raise ValueError('Target has SQLite sidecars; choose a clean, unused restore path')


def require_new_target(target):
    if target.exists() or target.is_symlink():
        raise ValueError('Target already exists; restoring over a live database is prohibited')
    reject_sidecars(target)


def content_digest(path):
    """Compare the logical schema and rows, not just the main file beside a possible WAL."""
    value = hashlib.sha256()
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)) as db:
        for statement in db.iterdump():
            value.update(statement.encode('utf-8'))
            value.update(b'\n')
    return value.hexdigest()


def snapshot(source, target):
    source, target = Path(source).resolve(), Path(target).absolute()
    if not source.is_file():
        raise ValueError('Source database does not exist')
    require_new_target(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    # Restore/validate in a private empty directory, isolated from existing SQLite sidecars.
    stage = Path(tempfile.mkdtemp(prefix='.ks-snapshot-', dir=target.parent))
    temporary = stage / 'snapshot.db'
    temporary.touch(mode=0o600, exist_ok=False)
    published = False
    validated = False
    try:
        deadline = time.monotonic() + 60

        def progress(*_):
            if time.monotonic() > deadline:
                raise TimeoutError('Backup exceeded 60 seconds')

        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=5)) as src:
            with closing(sqlite3.connect(temporary)) as dst:
                src.backup(dst, pages=256, progress=progress, sleep=0.1)
                dst.execute('PRAGMA journal_mode=DELETE')
        verify(temporary)
        expected = content_digest(temporary)
        with temporary.open('rb+') as stream:
            os.fsync(stream.fileno())
        # Atomic publication without replacing an existing target, even on a race.
        require_new_target(target)
        os.link(temporary, target)
        published = True
        reject_sidecars(target)
        verify(target)
        if content_digest(target) != expected:
            raise ValueError('Published database differs from the validated snapshot')
        reject_sidecars(target)
        validated = True
    finally:
        # Remove only our own failed publication; never delete pre-existing sidecars.
        if published and not validated and target.exists() and target.samefile(temporary):
            target.unlink()
        for suffix in ('', *SIDECARS):
            Path(str(temporary) + suffix).unlink(missing_ok=True)
        stage.rmdir()
    return target


def backup(source, directory, keep=7):
    if not 1 <= keep <= 365:
        raise ValueError('Retention must be between 1 and 365 snapshots')
    directory = Path(directory).resolve()
    name = 'snapshot-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex + '.db'
    result = snapshot(source, directory / name)
    candidates = sorted((p for p in directory.iterdir()
                         if not p.is_symlink() and p.is_file()
                         and re.fullmatch(r'snapshot-\d{8}T\d{6}Z-[a-f0-9]{32}\.db', p.name)),
                        key=lambda p: (p.stat().st_mtime_ns, p.name), reverse=True)
    for old in candidates[keep:]:
        if old != result and old.resolve() != Path(source).resolve():
            old.unlink()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    command = sub.add_parser('backup')
    command.add_argument('source', type=Path)
    command.add_argument('directory', type=Path)
    command.add_argument('--keep', type=int, default=7)
    command = sub.add_parser('restore')
    command.add_argument('source', type=Path)
    command.add_argument('target', type=Path, help='Must be a new path; stop service before manual switchover')
    command = sub.add_parser('verify')
    command.add_argument('source', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'backup':
            output = backup(args.source, args.directory, args.keep)
        elif args.command == 'restore':
            output = snapshot(args.source, args.target)
        else:
            output = args.source.resolve()
        tables = verify(output)
        print(json.dumps({'file': str(output), 'tables': tables, 'sha256': digest(output), 'verified': True}))
    except (OSError, sqlite3.Error, ValueError, TimeoutError):
        parser.exit(1, 'Database operation failed; source preserved. Check paths, permissions and database integrity.\n')


if __name__ == '__main__':
    main()
