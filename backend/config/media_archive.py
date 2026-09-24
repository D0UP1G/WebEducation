"""Archive and restore the persistent media volume using a validated ZIP."""

import os
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


MEDIA_ROOT = Path(__file__).resolve().parent.parent / "media"


def backup(root, output):
    root = Path(root)
    if not root.is_dir():
        raise ValueError("Media directory does not exist")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise ValueError("Media must not contain symbolic links")
            if path.is_file():
                archive.write(path, path.relative_to(root).as_posix())


def _validated_members(archive):
    seen = set()
    members = []
    for info in archive.infolist():
        name = info.filename
        path = PurePosixPath(name)
        file_type = (info.external_attr >> 16) & 0o170000
        if (info.is_dir() or not name or not path.parts or name.startswith("/") or "\\" in name or
                "." in path.parts or ".." in path.parts or path.parts[0].startswith(".media-restore-") or
                file_type not in (0, stat.S_IFREG) or name in seen):
            raise ValueError("Unsafe media archive entry")
        seen.add(name)
        members.append((info, path))
    return members


def restore(root, source):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile() as temporary:
        shutil.copyfileobj(source, temporary)
        temporary.seek(0)
        with zipfile.ZipFile(temporary) as archive:
            members = _validated_members(archive)
            stage = Path(tempfile.mkdtemp(prefix=".media-restore-", dir=root))
            cleanup_stage = True
            try:
                incoming = stage / "incoming"
                previous = stage / "previous"
                incoming.mkdir()
                previous.mkdir()
                for info, path in members:
                    target = incoming.joinpath(*path.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(info) as input_file, target.open("wb") as output_file:
                        shutil.copyfileobj(input_file, output_file)
                old_entries = [path for path in root.iterdir() if path != stage]
                moved_old = []
                moved_new = []
                try:
                    for path in old_entries:
                        os.replace(path, previous / path.name)
                        moved_old.append(path.name)
                    for path in incoming.iterdir():
                        os.replace(path, root / path.name)
                        moved_new.append(path.name)
                except Exception:
                    try:
                        for name in moved_new:
                            path = root / name
                            if path.is_dir():
                                shutil.rmtree(path)
                            else:
                                path.unlink()
                        for name in moved_old:
                            os.replace(previous / name, root / name)
                    except Exception as rollback_error:
                        cleanup_stage = False
                        raise RuntimeError(f"Restore failed; previous media retained in {stage}") from rollback_error
                    raise
            finally:
                if cleanup_stage:
                    shutil.rmtree(stage)


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"backup", "restore"}:
        sys.exit("Usage: python -m config.media_archive backup|restore")
    if sys.argv[1] == "backup":
        backup(MEDIA_ROOT, sys.stdout.buffer)
    else:
        restore(MEDIA_ROOT, sys.stdin.buffer)
