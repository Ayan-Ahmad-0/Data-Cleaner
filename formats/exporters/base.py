"""Base utilities and helper functions for format exporters."""

from __future__ import annotations
import os
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Generator


@contextmanager
def atomic_output_file(target_path: Path) -> Generator[Path, None, None]:
    """
    Context manager that yields a temporary file path located in the target directory.
    Atomically replaces target_path upon successful completion.
    Cleans up the temporary file if an exception occurs.
    """
    target = Path(target_path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_file = target.parent / f".tmp_{uuid.uuid4().hex[:8]}_{target.name}"

    try:
        yield temp_file
        if temp_file.exists():
            # Replace target atomically
            temp_file.replace(target)
    except Exception:
        if temp_file.exists():
            try:
                temp_file.unlink()
            except OSError:
                pass
        raise
