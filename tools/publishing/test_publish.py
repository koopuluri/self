import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('publish', Path(__file__).with_name('publish.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q', '-b', 'main', self.temp.name], check=True)
        (self.root / '<3/assets').mkdir(parents=True)
        (self.root / '<3/products/personal-site').mkdir(parents=True)
        (self.root / '.gitignore').write_text('.ghost/\n<3/assets/*\n!<3/assets/manifest.json\n')
        self.config = {'assets': {'enabled': False, 'billing_policy': 'require_provider_hard_cap'},
                       'site': {'inputs': ['<3/products/personal-site/**']}}
        p.write_json(self.root / 'ghost.publish.json', self.config)
        (self.root / '<3/products/personal-site/index.js').write_text('hello')

    def tearDown(self):
        self.temp.cleanup()

    def prepare(self):
        with patch('builtins.print'):
            p.prepare(self.root, 'bring ghost together')
        return p.read_json(self.root / '.ghost/publish-plan.json')

    def test_approval_is_bound_to_exact_source(self):
        plan = self.prepare()
        p.validate(self.root, plan)
        (self.root / '<3/products/personal-site/index.js').write_text('changed')
        with self.assertRaisesRegex(RuntimeError, 'files changed'):
            p.validate(self.root, plan)

    def test_media_changes_invalidate_approval(self):
        image = self.root / '<3/assets/image.png'
        image.write_bytes(b'first')
        plan = self.prepare()
        image.write_bytes(b'second')
        with self.assertRaisesRegex(RuntimeError, 'media changed'):
            p.validate(self.root, plan)

    def test_unrelated_records_do_not_deploy_site(self):
        first = self.prepare()
        (self.root / 'note.md').write_text('new note')
        second = self.prepare()
        self.assertNotEqual(first['tree'], second['tree'])
        self.assertEqual(first['site_fingerprint'], second['site_fingerprint'])

    def test_declared_essay_inputs_trigger_deployment(self):
        self.config['site']['inputs'].append('<3/essays/essay.md')
        p.write_json(self.root / 'ghost.publish.json', self.config)
        first = self.prepare()
        (self.root / '<3/essays').mkdir()
        (self.root / '<3/essays/essay.md').write_text('essay')
        second = self.prepare()
        self.assertNotEqual(first['site_fingerprint'], second['site_fingerprint'])

    def test_prepare_does_not_commit_or_change_index(self):
        (self.root / 'note.md').write_text('staged note')
        p.git('add', 'note.md', cwd=self.root)
        before = p.git('write-tree', cwd=self.root)
        self.prepare()
        self.assertEqual(before, p.git('write-tree', cwd=self.root))
        self.assertIsNone(p.head(self.root))

    def test_private_media_is_not_in_git_tree(self):
        (self.root / '<3/assets/image.png').write_bytes(b'private')
        plan = self.prepare()
        listing = p.git('ls-tree', '-r', '--name-only', plan['tree'], cwd=self.root)
        self.assertIn('<3/assets/manifest.json', listing)
        self.assertNotIn('<3/assets/image.png', listing)

    def test_missing_local_asset_keeps_restore_record(self):
        f = self.root / '<3/assets/photo.png'
        f.write_bytes(b'image')
        first = p.assets(self.root)
        p.write_json(self.root / '<3/assets/manifest.json', first)
        f.unlink()
        self.assertEqual(first, p.assets(self.root))

    def test_asset_symlink_cannot_escape_ghost(self):
        (self.root / '<3/assets/link').symlink_to('/etc/hosts')
        with self.assertRaisesRegex(RuntimeError, 'unsafe path'):
            p.assets(self.root)

    def test_disabled_storage_blocks_publication_before_provider_calls(self):
        plan = self.prepare()
        with patch.object(p, 'Storage') as storage, patch.object(p, 'ensure_remote') as remote:
            with self.assertRaisesRegex(RuntimeError, 'R2 is disabled'):
                p.publish(self.root, plan['id'])
            storage.assert_not_called()
            remote.assert_not_called()
        self.assertIsNone(p.head(self.root))

    def test_wrong_approval_does_nothing(self):
        self.prepare()
        with self.assertRaisesRegex(RuntimeError, 'exact prepared plan'):
            p.publish(self.root, 'different')
        self.assertIsNone(p.head(self.root))

    def test_hard_cap_requirement_cannot_be_silently_downgraded(self):
        with self.assertRaisesRegex(RuntimeError, 'no verified'):
            p.require_storage({'enabled': True, 'billing_policy': 'require_provider_hard_cap'})

    def test_credentials_are_detected_without_disclosing_value(self):
        f = self.root / 'unsafe.txt'
        token = 'gh' + 'p_' + 'x' * 36
        f.write_text(token)
        with self.assertRaises(RuntimeError) as error:
            p.scan([f])
        self.assertNotIn(token, str(error.exception))

    def test_public_domains_block_storage(self):
        s = object.__new__(p.Storage)
        s.api = Mock(return_value={'enabled': True})
        with self.assertRaisesRegex(RuntimeError, 'public access'):
            s.verify_private()
        s.api = Mock(side_effect=[{'enabled': False}, {'domains': [{'domain': 'example.com'}]}])
        with self.assertRaisesRegex(RuntimeError, 'no custom domains'):
            s.verify_private()

    def test_duplicate_assets_upload_once(self):
        for name in ['a.png', 'b.png']:
            (self.root / '<3/assets' / name).write_bytes(b'same image')
        manifest = p.assets(self.root)
        item = next(iter(manifest['files'].values()))
        s = object.__new__(p.Storage)
        s.config = {'max_upload_bytes': 100, 'max_archive_bytes': 100, 'max_objects': 100}
        s.inventory = Mock(return_value={})
        s.call = Mock(side_effect=[{}, {'ContentLength': item['bytes'], 'Metadata': {'sha256': item['sha256']}}])
        self.assertEqual(s.upload(self.root, manifest), 1)
        self.assertEqual(s.call.call_count, 2)

    def test_storage_limit_stops_before_upload(self):
        (self.root / '<3/assets/a.png').write_bytes(b'large')
        s = object.__new__(p.Storage)
        s.config = {'max_upload_bytes': 1, 'max_archive_bytes': 100, 'max_objects': 100}
        s.inventory = Mock(return_value={})
        s.call = Mock()
        with self.assertRaisesRegex(RuntimeError, 'budget exceeded'):
            s.upload(self.root, p.assets(self.root))
        s.call.assert_not_called()

    def test_moved_asset_uploads_from_current_path_and_retains_history(self):
        original = self.root / 'clip.mov'
        original.write_bytes(b'original video')
        before = p.assets(self.root)
        p.write_json(self.root / '<3/assets/manifest.json', before)
        original.rename(self.root / '<3/assets/clip.mov')
        manifest = p.assets(self.root)
        self.assertIn('clip.mov', manifest['files'])
        self.assertEqual(manifest['files']['clip.mov'], manifest['files']['<3/assets/clip.mov'])
        # Reproduce a historical path sorting before its current location.
        manifest['files'] = {name: manifest['files'][name]
                             for name in ['clip.mov', '<3/assets/clip.mov']}
        item = manifest['files']['clip.mov']
        s = object.__new__(p.Storage)
        s.config = {'max_upload_bytes': 100, 'max_archive_bytes': 100, 'max_objects': 100}
        s.inventory = Mock(return_value={})
        s.call = Mock(side_effect=[{}, {'ContentLength': item['bytes'], 'Metadata': {'sha256': item['sha256']}}])
        self.assertEqual(s.upload(self.root, manifest), 1)
        self.assertEqual(s.call.call_args_list[0].kwargs['Body'].name,
                         str(self.root / '<3/assets/clip.mov'))
        self.assertIn('clip.mov', manifest['files'])


if __name__ == '__main__':
    unittest.main()
