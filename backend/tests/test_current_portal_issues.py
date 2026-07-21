"""Public-interface regressions for the 2026-07-22 portal issue set."""

import pytest


@pytest.mark.anyio
async def test_donor_search_matches_name_or_contact(client, seed):
    for payload in (
        {"name": "Ayesha Foundation", "contact": "+92 300 1111111"},
        {"name": "Bilal Trust", "contact": "bilal@example.test"},
    ):
        created = await client.post("/api/v1/finance/donors", json=payload)
        assert created.status_code == 200

    by_name = await client.get("/api/v1/finance/donors", params={"q": "ayesha"})
    assert by_name.status_code == 200
    assert [row["name"] for row in by_name.json()] == ["Ayesha Foundation"]

    by_contact = await client.get("/api/v1/finance/donors", params={"q": "EXAMPLE.TEST"})
    assert by_contact.status_code == 200
    assert [row["name"] for row in by_contact.json()] == ["Bilal Trust"]
