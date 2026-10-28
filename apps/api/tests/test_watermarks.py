"""Corner watermarks: the site's "©" mark and the "AI-generated" label."""

import io

from PIL import Image

from app.services import media
from tests.test_media_library import MEDIA

PNG_SIZE = (600, 400)


def plain_png() -> bytes:
    """A flat grey picture: any drawn mark shows up as changed pixels."""
    buffer = io.BytesIO()
    Image.new("RGB", PNG_SIZE, (120, 120, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


def upload(api, **form) -> dict:
    r = api.post(MEDIA, files={"file": ("photo.png", plain_png(), "image/png")}, data=form)
    assert r.status_code == 201, r.text
    return r.json()


def pixels(client, url: str) -> Image.Image:
    r = client.get(url)
    assert r.status_code == 200, r.text
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def marked(image: Image.Image, corner: str) -> bool:
    """Is anything drawn in the bottom-left or bottom-right corner?"""
    w, h = image.size
    box = (0, h - 60, 200, h) if corner == "left" else (w - 250, h - 60, w, h)
    colours = {c for _, c in image.crop(box).getcolors(maxcolors=100_000)}
    return colours != {(120, 120, 120)}


def untouched_top(image: Image.Image) -> bool:
    w, h = image.size
    return {c for _, c in image.crop((0, 0, w, h // 2)).getcolors()} == {(120, 120, 120)}


def test_watermark_and_ai_label_in_the_corners(api, client):
    plain = upload(api)
    assert (plain["watermark"], plain["ai_generated"]) == (False, False)
    original_url = plain["url"]
    assert not marked(pixels(client, original_url), "right")

    # Switch the site's watermark on: the website now gets a marked copy.
    r = api.patch(f"{MEDIA}/{plain['id']}", json={"version": plain["version"], "watermark": True})
    image = r.json()
    assert image["watermark"] is True and image["url"] != original_url
    shown = pixels(client, image["url"])
    assert shown.size == PNG_SIZE
    assert marked(shown, "right") and not marked(shown, "left") and untouched_top(shown)
    # The unmarked original is no longer served.
    assert client.get(original_url).status_code == 404

    # Add the AI label: both corners, and the previous marked copy is gone.
    previous = image["url"]
    r = api.patch(
        f"{MEDIA}/{image['id']}", json={"version": image["version"], "ai_generated": True}
    )
    image = r.json()
    shown = pixels(client, image["url"])
    assert marked(shown, "right") and marked(shown, "left")
    assert client.get(previous).status_code == 404
    assert media.path_for(previous.rsplit("/", 1)[1]) is None  # the file itself was deleted

    # Both off: back to the untouched original, at its original address.
    r = api.patch(
        f"{MEDIA}/{image['id']}",
        json={"version": image["version"], "watermark": False, "ai_generated": False},
    )
    assert r.json()["url"] == original_url
    shown = pixels(client, original_url)
    assert not marked(shown, "right") and not marked(shown, "left")


def test_marks_chosen_at_upload(api, client):
    image = upload(api, ai_generated="true")
    shown = pixels(client, image["url"])
    assert marked(shown, "left") and not marked(shown, "right")


def test_bulk_watermark_on_and_off(api, client):
    a, b = upload(api), upload(api)
    r = api.post(
        f"{MEDIA}/bulk", json={"ids": [a["id"], b["id"]], "action": "watermark", "on": True}
    )
    assert r.json()["changed"] == 2
    for item in (a, b):
        image = api.get(f"{MEDIA}/{item['id']}").json()
        assert image["watermark"] and marked(pixels(client, image["url"]), "right")

    r = api.post(f"{MEDIA}/bulk", json={"ids": [a["id"]], "action": "watermark", "on": False})
    assert api.get(f"{MEDIA}/{a['id']}").json()["url"] == a["url"]
    # "on" must say which way.
    r = api.post(f"{MEDIA}/bulk", json={"ids": [a["id"]], "action": "ai_generated"})
    assert r.status_code == 422


def test_watermark_text_uses_the_site_name(api, client):
    """A longer site name makes a wider mark."""

    def mark_width(image: Image.Image) -> int:
        w, h = image.size
        strip = image.crop((0, h - 40, w, h - 10))
        xs = [
            x for x in range(w) if any(strip.getpixel((x, y)) != (120, 120, 120) for y in range(30))
        ]
        return max(xs) - min(xs)

    first = upload(api, watermark="true")
    short = mark_width(pixels(client, first["url"]))
    settings = api.get("/api/v1/admin/settings").json()
    r = api.patch(
        "/api/v1/admin/settings",
        json={"version": settings["version"], "site_name": "The Very Long Gin Cabinet Of Helsinki"},
    )
    assert r.status_code == 200, r.text
    second = upload(api, watermark="true")
    assert mark_width(pixels(client, second["url"])) > short
