import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('files', Path(__file__).with_name('portfolio-files.py'))
files = importlib.util.module_from_spec(spec)
spec.loader.exec_module(files)
SHA = 'a' * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def archive(self, entries, link=None):
        archive = self.root / 'site.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            for name, data in entries.items():
                member = tarfile.TarInfo(name)
                content = data.encode()
                member.size = len(content)
                bundle.addfile(member, io.BytesIO(content))
            if link:
                member = tarfile.TarInfo('escape')
                member.type = tarfile.SYMTYPE
                member.linkname = link
                bundle.addfile(member)
        return archive

    def valid(self):
        return {'index.html': '<html>new</html>', 'static/js/main.js': 'app',
                'deployment.json': json.dumps({'commit': SHA})}

    def test_valid_release_is_readable_and_immutable(self):
        archive = self.archive(self.valid())
        target = self.root / 'releases' / SHA
        files.extract(archive, target, SHA)
        self.assertEqual((target / 'index.html').read_text(), '<html>new</html>')
        if os.name != 'nt':
            self.assertEqual(target.stat().st_mode & 0o777, 0o755)
        with self.assertRaises(ValueError):
            files.extract(archive, target, SHA)

    def test_traversal_and_links_are_rejected_before_extraction(self):
        for name in ('../escaped', '/escaped'):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    files.extract(self.archive({**self.valid(), name: 'bad'}), self.root / SHA, SHA)
                self.assertFalse((self.root / SHA).exists())
        with self.assertRaises(ValueError):
            files.extract(self.archive(self.valid(), link='/etc/passwd'), self.root / SHA, SHA)

    def test_wrong_commit_is_rejected(self):
        entries = self.valid()
        entries['deployment.json'] = json.dumps({'commit': 'b' * 40})
        with self.assertRaises(ValueError):
            files.extract(self.archive(entries), self.root / SHA, SHA)

    @unittest.skipUnless(os.name == 'posix', 'Linux renameat2 is tested by GitHub Actions')
    def test_initial_directory_swap_and_rollback(self):
        live = self.root / 'portfolio-web'
        live.mkdir()
        (live / 'index.html').write_text('old')
        files.extract(self.archive(self.valid()), self.root / '.portfolio-releases' / SHA, SHA)
        previous = files.activate(self.root, SHA)
        self.assertTrue(live.is_symlink())
        self.assertEqual((live / 'index.html').read_text(), '<html>new</html>')
        files.exchange(previous, live)
        self.assertFalse(live.is_symlink())
        self.assertEqual((live / 'index.html').read_text(), 'old')
        previous.unlink()

    @unittest.skipUnless(os.name == 'posix', 'Linux renameat2 is tested by GitHub Actions')
    def test_symlink_swap_and_rollback(self):
        releases = self.root / '.portfolio-releases'
        old = releases / ('b' * 40)
        old.mkdir(parents=True)
        (old / 'index.html').write_text('old')
        live = self.root / 'portfolio-web'
        live.symlink_to('.portfolio-releases/' + 'b' * 40)
        files.extract(self.archive(self.valid()), releases / SHA, SHA)
        previous = files.activate(self.root, SHA)
        self.assertEqual((previous / 'index.html').read_text(), 'old')
        files.exchange(previous, live)
        self.assertEqual((live / 'index.html').read_text(), 'old')
        previous.unlink()


if __name__ == '__main__':
    unittest.main()
