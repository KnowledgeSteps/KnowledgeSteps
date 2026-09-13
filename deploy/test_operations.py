from contextlib import closing
import json
from pathlib import Path
import sqlite3
import shutil
import tempfile
import unittest
from unittest.mock import patch
import database_backup as dbtool
import release_artifact as release


class OperationsTest(unittest.TestCase):
    def test_refuses_each_orphan_sidecar_without_removing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE samples(value TEXT)')
            for suffix in dbtool.SIDECARS:
                with self.subTest(suffix=suffix):
                    target = root / ('restore' + suffix + '.db')
                    sidecar = Path(str(target) + suffix)
                    sidecar.write_bytes(b'preserve-existing-sidecar')
                    with self.assertRaises(ValueError):
                        dbtool.snapshot(source, target)
                    self.assertFalse(target.exists())
                    self.assertEqual(sidecar.read_bytes(), b'preserve-existing-sidecar')
            self.assertEqual(list(root.glob('.ks-snapshot-*')), [])

    def test_real_stale_wal_cannot_override_restored_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, other, target = root / 'good.db', root / 'other.db', root / 'restore.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE marker(value TEXT)')
                db.execute("INSERT INTO marker VALUES('EXPECTED_BACKUP')")
                db.commit()
            with closing(sqlite3.connect(other)) as writer:
                writer.execute('PRAGMA journal_mode=WAL')
                writer.execute('PRAGMA wal_autocheckpoint=0')
                writer.execute('CREATE TABLE marker(value TEXT)')
                writer.execute("INSERT INTO marker VALUES('STALE_WAL_DATA')")
                writer.commit()
                for suffix in ('-wal', '-shm'):
                    shutil.copyfile(str(other) + suffix, str(target) + suffix)
                with self.assertRaises(ValueError):
                    dbtool.snapshot(source, target)
                self.assertFalse(target.exists())
                self.assertTrue(Path(str(target) + '-wal').exists())
            clean = dbtool.snapshot(source, root / 'clean' / 'restored.db')
            with closing(sqlite3.connect(clean)) as db:
                self.assertEqual(db.execute('SELECT value FROM marker').fetchall(), [('EXPECTED_BACKUP',)])
            self.assertEqual(dbtool.content_digest(clean), dbtool.content_digest(source))

    def test_sidecar_appearing_at_publication_aborts_and_preserves_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root / 'source.db', root / 'restore.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE samples(value TEXT)')
            real_link = dbtool.os.link

            def concurrent_sidecar(src, dst):
                real_link(src, dst)
                Path(str(dst) + '-wal').write_bytes(b'concurrent-file')

            with patch.object(dbtool.os, 'link', side_effect=concurrent_sidecar):
                with self.assertRaises(ValueError):
                    dbtool.snapshot(source, target)
            self.assertFalse(target.exists())
            self.assertEqual(Path(str(target) + '-wal').read_bytes(), b'concurrent-file')
            self.assertEqual(list(root.glob('.ks-snapshot-*')), [])

    def test_changed_rows_after_publication_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root / 'source.db', root / 'restore.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE samples(value TEXT)')
            real_link = dbtool.os.link

            def changed_rows(src, dst):
                real_link(src, dst)
                with closing(sqlite3.connect(dst)) as db:
                    db.execute("INSERT INTO samples VALUES('unexpected-data')")
                    db.commit()

            with patch.object(dbtool.os, 'link', side_effect=changed_rows):
                with self.assertRaisesRegex(ValueError, 'differs'):
                    dbtool.snapshot(source, target)
            self.assertFalse(target.exists())
            with closing(sqlite3.connect(source)) as db:
                self.assertEqual(db.execute('SELECT * FROM samples').fetchall(), [])
            self.assertEqual(list(root.glob('.ks-snapshot-*')), [])

    def test_wal_snapshot_restore_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'live.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.execute('CREATE TABLE samples(id INTEGER PRIMARY KEY, value TEXT)')
                db.execute("INSERT INTO samples VALUES(1, 'committed-in-wal')")
                db.commit()
                first = dbtool.backup(source, root / 'backups', keep=1)
                restored = dbtool.snapshot(first, root / 'restored.db')
                with closing(sqlite3.connect(restored)) as restored_db:
                    self.assertEqual(restored_db.execute('SELECT * FROM samples').fetchall(), [(1, 'committed-in-wal')])
                (root / 'backups' / 'manual.db').write_bytes(b'keep')
                second = dbtool.backup(source, root / 'backups', keep=1)
                self.assertFalse(first.exists())
                self.assertTrue(second.exists())
                self.assertTrue((root / 'backups' / 'manual.db').exists())

    def test_refuses_existing_target_or_invalid_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE p(id INTEGER PRIMARY KEY)')
                db.execute('CREATE TABLE c(parent INTEGER REFERENCES p(id))')
                db.execute('INSERT INTO c VALUES(99)')
                db.commit()
            original = source.read_bytes()
            with self.assertRaises(ValueError):
                dbtool.snapshot(source, source)
            with self.assertRaises(ValueError):
                dbtool.snapshot(source, root / 'invalid.db')
            self.assertFalse((root / 'invalid.db').exists())
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(list(root.glob('.ks-snapshot-*')), [])

    def test_release_rejects_changed_missing_and_extra_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'frontend').mkdir()
            (root / 'frontend/index.html').write_text('<title>知阶</title>', encoding='utf-8')
            (root / 'app.jar').write_bytes(b'verified-jar')
            manifest = {'sourceCommit': 'abc', 'dirty': False, 'files': release.files(root)}
            (root / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            self.assertEqual(release.verify(root), manifest)
            (root / 'app.jar').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                release.verify(root)
            (root / 'app.jar').write_bytes(b'verified-jar')
            (root / 'unexpected.properties').write_text('not-in-release')
            with self.assertRaises(ValueError):
                release.verify(root)
            (root / 'unexpected.properties').unlink()
            (root / 'app.jar').unlink()
            with self.assertRaises(ValueError):
                release.verify(root)


if __name__ == '__main__':
    unittest.main()
