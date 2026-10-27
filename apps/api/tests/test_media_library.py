"""Media library: readable names, folders (with subfolders) and bulk changes."""

from tests.test_editorial import jpeg_with_gps

MEDIA = "/api/v1/admin/media"


def add(api, filename="IMG_2041_herno-navy.jpg", **form) -> dict:
    """Upload a photo; `form` may hold name, folder, alt or credit."""
    r = api.post(MEDIA, files={"file": (filename, jpeg_with_gps(), "image/jpeg")}, data=form)
    assert r.status_code == 201, r.text
    return r.json()


def names(api, **params) -> list[str]:
    return sorted(m["name"] for m in api.get(MEDIA, params=params).json()["items"])


def test_name_from_the_file_name_and_editable(api):
    image = add(api)
    assert image["name"] == "IMG 2041 herno navy"
    assert image["folder"] is None
    r = api.patch(
        f"{MEDIA}/{image['id']}",
        json={
            "version": image["version"],
            "name": " Hernö  Navy bottle ",
            "folder": " Gins / Hernö /",
        },
    )
    assert (r.json()["name"], r.json()["folder"]) == ("Hernö Navy bottle", "Gins/Hernö")
    # A name given at upload wins over the file name.
    assert add(api, name="Label close-up")["name"] == "Label close-up"


def test_folders_and_subfolders(api):
    add(api, "a.jpg", folder="Gins/Hernö")
    add(api, "b.jpg", folder="Gins")
    add(api, "c.jpg", folder="Cocktails")
    add(api, "d.jpg")  # not filed

    folders = api.get(f"{MEDIA}/folders").json()
    assert [(f["path"], f["count"]) for f in folders] == [
        ("Cocktails", 1),
        ("Gins", 1),
        ("Gins/Hernö", 1),
    ]
    assert names(api, folder="Gins") == ["b"]
    assert names(api, folder="Gins", subfolders=True) == ["a", "b"]
    assert names(api, folder="/") == ["d"]  # "/" = not in any folder

    # Renaming a folder moves its subfolders too.
    r = api.post(f"{MEDIA}/folders/rename", json={"from_path": "Gins", "to_path": "Bottles/Gin"})
    assert r.json()["changed"] == 2
    assert names(api, folder="Bottles/Gin/Hernö") == ["a"]
    r = api.post(f"{MEDIA}/folders/rename", json={"from_path": "Bottles", "to_path": "Bottles/x"})
    assert r.status_code == 422  # not into itself


def test_bad_folder_names(api):
    image = add(api)
    for bad in ("../secret", "a/b/c/d/e/f", "x" * 61):
        r = api.patch(f"{MEDIA}/{image['id']}", json={"version": image["version"], "folder": bad})
        assert r.status_code == 422, bad


def test_bulk_move_rename_credit_and_delete(api):
    from tests.test_catalogue import make_gin

    first, second, third = (add(api, f"{n}.jpg") for n in ("x", "y", "z"))
    ids = [first["id"], second["id"], third["id"]]

    r = api.post(f"{MEDIA}/bulk", json={"ids": ids, "action": "move", "folder": "Gins/Hernö"})
    assert r.json() == {"changed": 3, "skipped": []}
    r = api.post(
        f"{MEDIA}/bulk", json={"ids": ids, "action": "rename", "base_name": "Hernö bottle"}
    )
    assert names(api, folder="Gins/Hernö") == ["Hernö bottle 1", "Hernö bottle 2", "Hernö bottle 3"]
    api.post(f"{MEDIA}/bulk", json={"ids": ids, "action": "credit", "credit": "Anna"})
    assert {m["credit"] for m in api.get(MEDIA).json()["items"]} == {"Anna"}

    # Delete skips images still in use, and says where.
    make_gin(api, name="Uses a photo", image_ids=[first["id"]])
    r = api.post(f"{MEDIA}/bulk", json={"ids": ids, "action": "delete"})
    result = r.json()
    assert result["changed"] == 2
    assert [s["id"] for s in result["skipped"]] == [first["id"]]
    assert "Uses a photo" in result["skipped"][0]["reason"]
    assert names(api) == ["Hernö bottle 1"]


def test_bulk_needs_a_name_to_rename(api):
    image = add(api)
    r = api.post(f"{MEDIA}/bulk", json={"ids": [image["id"]], "action": "rename", "base_name": " "})
    assert r.status_code == 422
