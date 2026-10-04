"""tscheck: Cost add-on rules persist through API with normalized effective percentages.

Saving local/import/custom/none normalizes stored effective percentages to 11/14/custom/0
and preserves type and calculated cost add-on amount (base cost 50 -> 5.50 / 7.00 / 4.00 / 0).
"""

import uuid

import pytest


def _line_item(suffix: str, cost_addon_type: str, cost_addon_percent: float = 0) -> dict:
    return {
        "description": f"tscheck-cost-addon-{suffix}-{uuid.uuid4().hex[:8]}",
        "category": "service",
        "charge_type": "lump_sum",
        "uom": "each",
        "quantity": 1,
        "duration_days": 1,
        "price_method": "sell_rate",
        "sell_rate": 100,
        "target_margin_percent": 0,
        "cost_rate": 50,
        "cost_addon_type": cost_addon_type,
        "cost_addon_percent": cost_addon_percent,
    }


def _base_payload(line_items: list[dict]) -> dict:
    unique = uuid.uuid4().hex[:8]
    return {
        "quote_number": f"TSCHECK-COSTADDON-{unique}",
        "client_name": "tscheck Client",
        "client_company": "tscheck Co",
        "company_name": "tscheck Supplier",
        "currency": "USD",
        "line_items": line_items,
    }


@pytest.mark.parametrize(
    "cost_addon_type, input_percent, expected_percent, expected_amount",
    [
        ("local_tax", 0, 11, 5.50),
        ("import_tax", 0, 14, 7.00),
        ("custom", 8, 8, 4.00),
        ("none", 0, 0, 0.00),
    ],
)
def test_cost_addon_persists_normalized(client, cost_addon_type, input_percent, expected_percent, expected_amount):
    payload = _base_payload([_line_item(cost_addon_type, cost_addon_type, input_percent)])

    response = client.post("/quotes", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    line = saved["line_items"][0]

    assert line["cost_addon_type"] == cost_addon_type
    assert line["cost_addon_percent"] == expected_percent
    assert line["cost_addon_amount"] == expected_amount
    assert line["base_cost"] == 50

    # Re-fetch to confirm the normalized values survive a reopen, not just the create response.
    reopened = client.get(f"/quotes/{saved['id']}")
    assert reopened.status_code == 200, reopened.text
    reopened_line = reopened.json()["line_items"][0]
    assert reopened_line["cost_addon_type"] == cost_addon_type
    assert reopened_line["cost_addon_percent"] == expected_percent
    assert reopened_line["cost_addon_amount"] == expected_amount
