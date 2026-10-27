"""Safe image uploads (spec §5 A09, §9 "Uploaded images").

Every upload goes through the same steps:

1. **Size check**: refuse files above ``GC_MAX_UPLOAD_MB``.
2. **Decode** with Pillow. We trust what the file *is*, not its name or the
   type the browser claims. Only JPEG, PNG and WebP are accepted; SVG never
   (it can contain scripts).
3. **Re-encode** into a brand-new file. This drops all metadata, including
   EXIF GPS coordinates that phones store in photos, and any hidden payload.
4. **Save under a random name** such as ``3f2a....jpg``: never the uploader's
   file name, which could contain path tricks like ``../../etc``.
"""

import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings
from app.errors import ApiError

# What Pillow calls each format → (MIME type, file extension).
ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}

# Refuse "decompression bombs": tiny files that unpack into gigantic images.
Image.MAX_IMAGE_PIXELS = 60_000_000


def media_dir() -> Path:
    path = Path(get_settings().media_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


class ProcessedImage:
    """The cleaned image, ready to store."""

    def __init__(self, data: bytes, mime: str, extension: str, width: int, height: int):
        self.data = data
        self.mime = mime
        self.extension = extension
        self.width = width
        self.height = height


def process_image(raw: bytes) -> ProcessedImage:
    """Validate and clean an uploaded image. Raises ApiError if it isn't acceptable."""
    settings = get_settings()
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise ApiError(413, "file_too_large", f"Images may be at most {settings.max_upload_mb} MB.")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()  # actually decode the pixels, which catches broken files
    except Image.DecompressionBombError as exc:
        raise ApiError(422, "image_too_large", "That image has too many pixels.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ApiError(422, "not_an_image", "That file is not a readable image.") from exc

    if image.format not in ALLOWED_FORMATS:
        raise ApiError(
            422,
            "unsupported_image_type",
            "Upload a JPEG, PNG or WebP image.",
            details={"allowed": sorted(mime for mime, _ in ALLOWED_FORMATS.values())},
        )
    mime, extension = ALLOWED_FORMATS[image.format]

    # Phones often save photos sideways plus an "orientation" tag. Turn the
    # pixels the right way up *before* the tag is thrown away with the metadata.
    image = ImageOps.exif_transpose(image)

    # Scale very large photos down (keeps the shape; never scales up).
    image.thumbnail((settings.max_image_side, settings.max_image_side))

    if extension == "jpg" and image.mode not in ("RGB", "L"):
        image = image.convert("RGB")  # JPEG can't store transparency

    output = io.BytesIO()
    # Saving without passing `exif=` writes a file with no EXIF data at all.
    if extension == "jpg":
        image.save(output, format="JPEG", quality=88, optimize=True)
    elif extension == "png":
        image.save(output, format="PNG", optimize=True)
    else:
        image.save(output, format="WEBP", quality=88)
    return ProcessedImage(output.getvalue(), mime, extension, image.width, image.height)


def store(processed: ProcessedImage) -> str:
    """Write the cleaned image to disk and return its random file name."""
    key = f"{uuid.uuid4().hex}.{processed.extension}"
    (media_dir() / key).write_bytes(processed.data)
    return key


def path_for(key: str) -> Path | None:
    """Find a stored file, refusing any name that isn't one of ours."""
    stem, _, extension = key.partition(".")
    valid_stem = len(stem) == 32 and all(c in "0123456789abcdef" for c in stem)
    if not valid_stem or extension not in {ext for _, ext in ALLOWED_FORMATS.values()}:
        return None
    path = media_dir() / key
    return path if path.is_file() else None
