"""Names and folders for the media library.

Folders are simply a path stored on each image, like ``Gins/Hernö``: a "/"
makes a subfolder. There is no separate folders table, so a folder exists as
long as something is filed in it, and moving or renaming is one UPDATE.
"""

import re
from pathlib import PurePosixPath

from app.errors import ApiError

MAX_DEPTH = 5
MAX_SEGMENT = 60


def clean_folder(path: str | None) -> str | None:
    """Tidy a folder path: trim each part, drop empty parts. "" means not filed.

    " Gins / Hernö/ " -> "Gins/Hernö".  Refuses "..", too many levels or very
    long names, so a path can't be used to confuse anything.
    """
    if path is None:
        return None
    parts = [" ".join(part.split()) for part in path.split("/")]
    parts = [part for part in parts if part]
    if not parts:
        return None
    if len(parts) > MAX_DEPTH:
        raise ApiError(422, "validation_error", f"Folders can be at most {MAX_DEPTH} levels deep.")
    for part in parts:
        if part in (".", "..") or len(part) > MAX_SEGMENT:
            raise ApiError(
                422, "validation_error", f"Folder names must be 1–{MAX_SEGMENT} characters."
            )
    return "/".join(parts)


def name_from_filename(filename: str | None) -> str | None:
    """'IMG_2041_herno-navy.JPG' -> 'IMG 2041 herno navy' (a starting point to edit)."""
    if not filename:
        return None
    stem = PurePosixPath(filename.replace("\\", "/")).name
    stem = stem.rsplit(".", 1)[0] if "." in stem else stem
    name = " ".join(re.sub(r"[_\-]+", " ", stem).split())
    return name[:160] or None
