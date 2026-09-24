import io
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch
import os

from django.test import SimpleTestCase

from config.media_archive import backup, restore


class MediaArchiveTest(SimpleTestCase):
    def test_backup_streams_to_non_seekable_output(self):
        class Output(io.BytesIO):
            def seek(self, *args, **kwargs):
                raise OSError("stream is not seekable")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "work.txt").write_text("hello")
            output = Output()
            backup(root, output)
            with zipfile.ZipFile(io.BytesIO(output.getvalue())) as archive:
                self.assertEqual(archive.read("work.txt"), b"hello")

    def test_round_trip_replaces_media_and_preserves_file_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "submissions").mkdir()
            (root / "submissions" / "work.pdf").write_bytes(b"%PDF-1.4\nwork")
            archive = io.BytesIO()
            backup(root, archive)
            (root / "submissions" / "work.pdf").write_bytes(b"changed")
            (root / "stale.txt").write_text("stale")
            restore(root, io.BytesIO(archive.getvalue()))
            self.assertEqual((root / "submissions" / "work.pdf").read_bytes(), b"%PDF-1.4\nwork")
            self.assertFalse((root / "stale.txt").exists())

    def test_rejects_traversal_without_touching_existing_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "existing.txt").write_text("keep")
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("../escape.txt", "bad")
            with self.assertRaises(ValueError):
                restore(root, io.BytesIO(archive.getvalue()))
            self.assertEqual((root / "existing.txt").read_text(), "keep")
            self.assertFalse((root.parent / "escape.txt").exists())

    def test_restore_rolls_back_when_replacement_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "first.txt").write_text("first")
            (root / "second.txt").write_text("second")
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("new.txt", "new")
            calls = 0
            real_replace = os.replace

            def failing_replace(source, destination):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated move failure")
                return real_replace(source, destination)

            with patch("config.media_archive.os.replace", side_effect=failing_replace):
                with self.assertRaises(OSError):
                    restore(root, io.BytesIO(archive.getvalue()))
            self.assertEqual((root / "first.txt").read_text(), "first")
            self.assertEqual((root / "second.txt").read_text(), "second")
            self.assertFalse((root / "new.txt").exists())
