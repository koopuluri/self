import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("video_process", Path(__file__).with_name("process.py"))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.tool = self.root / "tools/video-process"
        self.tool.mkdir(parents=True)
        (self.tool / "Renderer.swift").write_text("renderer version one")
        (self.root / "<3/videos").mkdir(parents=True)
        self.doc = self.root / "<3/videos/film.md"
        self.doc.write_text("My original brief.\n")
        self.session = self.root / "session.jsonl"
        self.rows = [dict(type="session_meta", payload=dict(id="test-chat")),
                     dict(type="turn_context", payload=dict(model="configured-model"))]
        self.add_row("user", "Make the opening slower.\n\nKeep this paragraph.")
        self.add_row("assistant", "I’ll lengthen the opening.")
        self.root_patch = patch.object(p, "ROOT", self.root); self.root_patch.start(); self.addCleanup(self.root_patch.stop)
        self.tool_patch = patch.object(p, "TOOL", self.tool); self.tool_patch.start(); self.addCleanup(self.tool_patch.stop)
        (self.root / "<3/assets").mkdir()
        self.source = self.root / "<3/assets/source.mov"; self.source.write_bytes(b"unchanged media")
        self.draft = self.root / "draft.json"
        self.draft.write_text(json.dumps(dict(schema="ghost.video.v1", title="Test film", clips=[dict(source="<3/assets/source.mov", startFrame=0, frames=60)], audio=None, notes=[])))

    def add_row(self, role, text, channel=None):
        self.rows.append(dict(type="response_item", timestamp="2026-11-05T07:00:00Z", payload=dict(type="message", role=role, channel=channel, content=[dict(type="input_text" if role == "user" else "output_text", text=text)])))
        self.session.write_text("\n".join(json.dumps(row) for row in self.rows) + "\n")

    def record_all(self):
        _, through, messages = p.session_messages(self.session)
        return p.record(self.doc, self.session, dict(through=through, messages=[dict(line=m['line']) for m in messages]))

    def test_sync_preserves_redactions_and_only_appends_new_messages(self):
        p.initialize(self.doc)
        self.assertEqual(self.record_all(), 2)
        self.doc.write_text(self.doc.read_text().replace("Keep this paragraph.", "[redacted]"))
        before = self.doc.read_text()
        self.assertEqual(self.record_all(), 0)
        self.assertEqual(self.doc.read_text(), before)
        self.add_row("user", "Now make the title smaller.")
        self.assertEqual(self.record_all(), 1)
        text = self.doc.read_text()
        self.assertNotIn("Keep this paragraph.", text)
        self.assertEqual(text.count("Make the opening slower."), 1)
        self.assertIn("Now make the title smaller.", text)
        self.assertTrue(text.startswith("My original brief.\n"))

    def test_filters_internal_records_and_handles_model_changes(self):
        self.add_row("assistant", "private reasoning", "analysis")
        self.add_row("user", "# AGENTS.md instructions for /example\nnot conversation")
        self.rows.append(dict(type="turn_context", payload=dict(model="second-model")))
        self.add_row("assistant", "Second response.")
        p.initialize(self.doc); self.record_all()
        text = self.doc.read_text()
        self.assertNotIn("private reasoning", text)
        self.assertNotIn("not conversation", text)
        self.assertIn("`configured-model`", text)
        self.assertIn("`second-model`", text)

    def test_removed_metadata_stops_sync_without_restoring_content(self):
        p.initialize(self.doc); self.record_all()
        self.doc.write_text(p.CURSOR.sub("", self.doc.read_text()))
        before = self.doc.read_text()
        with self.assertRaisesRegex(ValueError, "markers missing"):
            self.record_all()
        self.assertEqual(before, self.doc.read_text())

    def test_checkpoint_freezes_engine_and_branch_parent(self):
        p.initialize(self.doc); self.record_all()
        first = p.checkpoint(self.doc, self.draft, "First cut", None)
        saved = first.read_bytes()
        first_recipe = p.verify(first)
        (self.tool / "Renderer.swift").write_text("renderer version two")
        self.add_row("user", "Try another direction."); self.record_all()
        second = p.checkpoint(self.doc, self.draft, "Alternative", str(first))
        second_recipe = p.verify(second)
        self.assertEqual(first.read_bytes(), saved)
        self.assertEqual(second_recipe["parent"], first_recipe["id"])
        self.assertNotEqual(second_recipe["renderer"]["sha256"], first_recipe["renderer"]["sha256"])
        text = self.doc.read_text()
        self.assertEqual(text.count(p.WORKING), 1)
        self.assertEqual(text.count("```ghost-video"), 2)
        self.assertIn("> [!note]- π: Alternative", text)
        self.source.write_bytes(b"changed media")
        with self.assertRaisesRegex(ValueError, "Source changed"):
            p.verify(first)

    def test_mutated_recipe_is_rejected(self):
        p.initialize(self.doc)
        artifact = p.checkpoint(self.doc, self.draft, "First", None)
        content = json.loads(artifact.read_text()); content["clips"][0]["frames"] = 100
        artifact.write_text(json.dumps(content))
        with self.assertRaisesRegex(ValueError, "recipe was modified"):
            p.verify(artifact)

    def test_atomic_update_refuses_concurrent_edit(self):
        before = self.doc.read_text()
        self.doc.write_text("An edit from the user.\n")
        with self.assertRaisesRegex(ValueError, "Document changed"):
            p.atomic_update(self.doc, before, "Agent update.")
        self.assertEqual(self.doc.read_text(), "An edit from the user.\n")

    def test_blanket_sync_cannot_capture_workflow_or_save_chat(self):
        p.initialize(self.doc)
        self.add_row("user", "save chat")
        self.add_row("user", "Move the doc and update the skill")
        before = self.doc.read_bytes()
        self.assertEqual(p.sync(self.doc, self.session), 0)
        self.assertEqual(self.doc.read_bytes(), before)

    def test_selective_record_omits_irrelevant_and_preserves_exact_excerpt(self):
        p.initialize(self.doc)
        self.add_row("user", "save chat")
        self.add_row("user", "Make the title larger. Also update the workflow skill.")
        through = len(self.rows)
        count = p.record(self.doc, self.session, dict(through=through, messages=[
            dict(line=3), dict(line=4), dict(line=through, excerpt="Make the title larger.")]))
        self.assertEqual(count, 3)
        text = self.doc.read_text()
        self.assertNotIn("save chat", text)
        self.assertNotIn("Also update", text)
        self.assertIn("Video-relevant excerpt", text)
        self.assertIn("Make the title larger.", text)
        self.assertEqual(p.pending(self.doc, self.session)['messages'], [])
        self.assertEqual(self.record_all(), 0)  # Reviewed omissions never reappear.

    def test_invalid_selection_does_not_advance_or_write(self):
        p.initialize(self.doc)
        before = self.doc.read_bytes()
        with self.assertRaisesRegex(ValueError, "exact nonempty"):
            p.record(self.doc, self.session, dict(through=4, messages=[dict(line=3, excerpt="Invented opinion")]))
        self.assertEqual(before, self.doc.read_bytes())
        self.add_row("assistant", "hidden", "analysis")
        with self.assertRaisesRegex(ValueError, "visible message"):
            p.record(self.doc, self.session, dict(through=5, messages=[dict(line=5)]))

    def test_empty_review_and_redacted_selection_stay_omitted(self):
        p.initialize(self.doc)
        self.assertEqual(p.record(self.doc, self.session, dict(through=4, messages=[])), 0)
        self.assertEqual(self.record_all(), 0)
        self.assertNotIn("Make the opening", self.doc.read_text())

    def test_new_checkpoints_require_organized_docs_and_media(self):
        outside = self.root / 'outside.md'; outside.write_text('brief')
        with self.assertRaisesRegex(ValueError, "<3/videos"):
            p.initialize(outside)
        unorganized = self.root / 'loose.mov'; unorganized.write_bytes(b'loose')
        draft = json.loads(self.draft.read_text()); draft['clips'][0]['source'] = 'loose.mov'
        self.draft.write_text(json.dumps(draft))
        p.initialize(self.doc)
        with self.assertRaisesRegex(ValueError, "<3/assets/"):
            p.checkpoint(self.doc, self.draft, 'Draft', None)

    def test_relocated_asset_preserves_old_recipe_and_runtime_hash_checks(self):
        p.initialize(self.doc)
        artifact = p.checkpoint(self.doc, self.draft, 'First', None)
        # Simulate a valid historical recipe predating the <3/assets/ constraint.
        legacy = self.root / 'source.mov'; legacy.write_bytes(self.source.read_bytes())
        r = json.loads(artifact.read_text()); r['clips'][0]['source'] = 'source.mov'; r.pop('id')
        r['id'] = p.digest(json.dumps(r, sort_keys=True, separators=(',', ':')).encode())[:20]
        artifact.write_text(json.dumps(r))
        before = artifact.read_bytes()
        self.assertEqual(p.move_asset('source.mov'), self.source)
        self.assertFalse(legacy.exists())
        self.assertEqual(p.verify(artifact)['id'], r['id'])
        runtime = json.loads(p.runtime_recipe(artifact).read_text())
        self.assertEqual(runtime['clips'][0]['source'], '<3/assets/source.mov')
        self.assertEqual(artifact.read_bytes(), before)
        self.draft.write_bytes(before)
        next_artifact = p.checkpoint(self.doc, self.draft, 'After organization', str(artifact))
        self.assertEqual(p.verify(next_artifact)['clips'][0]['source'], '<3/assets/source.mov')
        self.assertEqual(artifact.read_bytes(), before)
        self.source.write_bytes(b'corrupted')
        with self.assertRaisesRegex(ValueError, "Source changed"):
            p.runtime_recipe(artifact)

    def test_asset_collision_never_overwrites_and_repeat_is_idempotent(self):
        original = self.source.read_bytes()
        loose = self.root / 'source.mov'; loose.write_bytes(b'different video')
        destination = p.move_asset('source.mov')
        self.assertNotEqual(destination, self.source)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(destination.read_bytes(), b'different video')
        self.assertEqual(p.move_asset(destination), destination)


if __name__ == "__main__":
    unittest.main()
