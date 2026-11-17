"""Cocktail variations: recipes linked both ways, shown only when published."""

from tests.test_cocktails import create, publish

ADMIN = "/api/v1/admin/cocktails"
PUBLIC = "/api/v1/public/cocktails"


def titles(items) -> list[str]:
    return [i["title"] for i in items]


def test_variations_link_both_ways_and_show_only_when_published(api, client):
    negroni = create(api, title="Negroni")
    boulevardier = create(api, title="Boulevardier")
    sbagliato = create(api, title="Negroni Sbagliato")

    # Link from the Negroni; the Boulevardier sees it too.
    r = api.patch(
        f"{ADMIN}/{negroni['id']}",
        json={"version": negroni["version"], "variations": [boulevardier["id"], sbagliato["id"]]},
    )
    assert r.status_code == 200, r.text
    assert titles(r.json()["variations"]) == ["Boulevardier", "Negroni Sbagliato"]
    assert titles(api.get(f"{ADMIN}/{boulevardier['id']}").json()["variations"]) == ["Negroni"]

    # Visitors see only published variations; none at all while there are none.
    publish(api, api.get(f"{ADMIN}/{negroni['id']}").json())
    assert client.get(f"{PUBLIC}/negroni").json()["variations"] == []
    publish(api, api.get(f"{ADMIN}/{boulevardier['id']}").json())
    assert titles(client.get(f"{PUBLIC}/negroni").json()["variations"]) == ["Boulevardier"]
    assert titles(client.get(f"{PUBLIC}/boulevardier").json()["variations"]) == ["Negroni"]

    # Editing from the other side replaces that recipe's links only.
    current = api.get(f"{ADMIN}/{boulevardier['id']}").json()
    r = api.patch(
        f"{ADMIN}/{boulevardier['id']}", json={"version": current["version"], "variations": []}
    )
    assert r.json()["variations"] == []
    assert titles(api.get(f"{ADMIN}/{negroni['id']}").json()["variations"]) == ["Negroni Sbagliato"]


def test_variation_rules(api):
    negroni = create(api, title="Negroni")
    other = create(api, title="Boulevardier")
    v = negroni["version"]
    # Not itself, not twice, not unknown.
    r = api.patch(f"{ADMIN}/{negroni['id']}", json={"version": v, "variations": [negroni["id"]]})
    assert r.status_code == 422
    twice = [other["id"], other["id"]]
    r = api.patch(f"{ADMIN}/{negroni['id']}", json={"version": v, "variations": twice})
    assert r.status_code == 422
    unknown = ["00000000-0000-0000-0000-000000000000"]
    r = api.patch(f"{ADMIN}/{negroni['id']}", json={"version": v, "variations": unknown})
    assert r.status_code == 404
    # A new recipe can be linked when it's created.
    third = create(api, title="White Negroni", variations=[negroni["id"]])
    assert titles(third["variations"]) == ["Negroni"]
    assert titles(api.get(f"{ADMIN}/{negroni['id']}").json()["variations"]) == ["White Negroni"]
