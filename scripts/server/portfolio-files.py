"""Validate static archives and change a directory entry atomically on Linux."""
import ctypes
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile


def extract(archive, destination, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected a full Git commit SHA')
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Immutable release already exists')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=destination.parent))
    staging.chmod(0o755)
    try:
        with tarfile.open(archive, 'r:gz') as bundle:
            members = bundle.getmembers()
            if sum(member.size for member in members) > 512 * 1024 * 1024:
                raise ValueError('Archive exceeds the 512 MiB unpacked limit')
            for member in members:
                target = (staging / member.name).resolve()
                if not target.is_relative_to(staging) or not (member.isfile() or member.isdir()):
                    raise ValueError('Archive contains an unsafe path or link')
            # Extract manually: no ownership, permission, link, or device metadata.
            for member in members:
                target = staging / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    target.chmod(0o755)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.extractfile(member) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o644)
        if not (staging / 'index.html').is_file() or not (staging / 'static').is_dir():
            raise ValueError('Expected a CRA production build')
        manifest = json.loads((staging / 'deployment.json').read_text())
        if manifest.get('commit') != commit:
            raise ValueError('Commit marker does not match the requested release')
        os.rename(staging, destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def exchange(first, second):
    # RENAME_EXCHANGE swaps even a nonempty directory and symlink in one syscall.
    # Unlike mv-old / ln-new, readers never see a missing portfolio directory.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(first), -100, os.fsencode(second), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def activate(root, commit):
    root = Path(root).resolve()
    live = root / 'portfolio-web'
    release = root / '.portfolio-releases' / commit
    if not release.is_dir() or not live.exists():
        raise ValueError('Both the new release and existing portfolio must exist')
    temporary = root / f'.portfolio-swap-{os.getpid()}'
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Unexpected swap path already exists')
    temporary.symlink_to(f'.portfolio-releases/{commit}')
    try:
        exchange(temporary, live)
    except BaseException:
        temporary.unlink()
        raise
    return temporary  # Previous directory/link stays here for immediate rollback.


if __name__ == '__main__':
    operation, *args = sys.argv[1:]
    if operation == 'extract':
        extract(*args)
    elif operation == 'activate':
        print(activate(*args))
    elif operation == 'exchange':
        exchange(*args)
    else:
        raise ValueError('Unknown operation')
