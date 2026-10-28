"""Small corner watermarks on images (Media → an image → Watermark / AI-generated).

The uploaded file is never changed. When an image needs a mark, a *copy* is
made with the mark drawn on it, saved under its own random name
(``display_key``), and that copy is what the website shows. Switching the
marks off again simply drops the copy, so there's no loss of quality from
marking and unmarking.

* The site mark ("© The Gin Cabinet") goes in the bottom-right corner.
* The "AI-generated" label goes in the bottom-left corner.

Both are small (about 2.8% of the image's shorter side), white with a thin
dark outline so they read on light and dark photos alike.
"""

import io

from PIL import Image, ImageDraw, ImageFont

AI_LABEL = "AI-generated"

# Pillow's names for our three formats, by file extension.
_FORMATS = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}


def site_mark(site_name: str) -> str:
    return f"© {site_name.strip() or 'The Gin Cabinet'}"


def draw_marks(data: bytes, extension: str, *, mark: str | None, ai: bool) -> bytes:
    """Return the image with the chosen corner marks, in the same format."""
    image = Image.open(io.BytesIO(data))
    image.load()
    base = image.convert("RGBA")
    width, height = base.size

    size = max(11, round(min(width, height) * 0.028))  # text height in pixels
    margin = max(4, round(size * 0.7))
    outline = max(1, round(size / 12))
    font = ImageFont.load_default(size=size)  # Pillow's own scalable font

    # Draw on a transparent layer, then lay it over the photo.
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    style = {
        "font": font,
        "fill": (255, 255, 255, 215),  # white, slightly see-through
        "stroke_width": outline,
        "stroke_fill": (0, 0, 0, 120),  # a faint dark outline
    }
    if mark:
        # anchor "rs" = the text's right edge and baseline sit on this point.
        draw.text((width - margin, height - margin), mark, anchor="rs", **style)
    if ai:
        draw.text((margin, height - margin), AI_LABEL, anchor="ls", **style)
    marked = Image.alpha_composite(base, layer)

    output = io.BytesIO()
    if extension == "jpg":
        marked.convert("RGB").save(output, format="JPEG", quality=88, optimize=True)
    elif extension == "png":
        # Keep transparency if the original had it.
        (marked if image.mode in ("RGBA", "LA", "P") else marked.convert("RGB")).save(
            output, format="PNG", optimize=True
        )
    else:
        marked.save(output, format=_FORMATS["webp"], quality=88)
    return output.getvalue()
