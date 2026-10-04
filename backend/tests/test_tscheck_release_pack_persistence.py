"""Criterion: Release pack saves persistent metadata.

Saving a quote preserves subject, customer reference, delivery point, lead time,
logo, custom quotation number/date, preparer identity, and release note when reopened.
"""

import uuid

TINY_PNG_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4"
    "nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
)


def test_release_pack_persists_metadata_on_reopen(client):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "quote_number": f"TSCHECK-REL-{suffix}",
        "release_date": "2026-11-01",
        "client_name": "Tscheck Contact",
        "client_company": f"Tscheck Release Co {suffix}",
        "client_email": "tscheck@example.com",
        "client_location": "Tscheck City",
        "customer_reference": f"RFQ-TSCHECK-{suffix}",
        "delivery_point": "Tscheck Warehouse",
        "company_name": "Tscheck Seller Co",
        "company_address": "123 Tscheck Ave",
        "company_email": "seller@tscheck.example",
        "company_phone": "+1 555 0100",
        "company_logo": TINY_PNG_DATA_URL,
        "prepared_by_name": "Tscheck Preparer",
        "prepared_by_title": "Tscheck Manager",
        "quote_title": "Commercial Quotation",
        "subject": f"Supply of Tscheck Equipment {suffix}",
        "currency": "USD",
        "tax_enabled": False,
        "tax_rate": 0,
        "payment_terms": "45 days after invoice",
        "lead_time": "6 weeks",
        "valid_days": 30,
        "notes": "Tscheck notes",
        "release_notes": f"Tscheck release note {suffix}",
        "commission_amount": 0,
        "line_items": [
            {
                "description": "Tscheck line item",
                "description_details": "spec",
                "category": "service",
                "charge_type": "daily",
                "sales_pricing": "unit",
                "uom": "day",
                "quantity": 2,
                "duration_days": 3,
                "price_method": "sell_rate",
                "sell_rate": 100,
                "target_margin_percent": 0,
                "cost_rate": 50,
                "cost_addon_percent": 0,
            }
        ],
    }

    create_resp = client.post("/quotes", json=payload)
    assert create_resp.status_code in (200, 201), create_resp.text
    created = create_resp.json()
    quote_id = created["id"]

    reopen_resp = client.get(f"/quotes/{quote_id}")
    assert reopen_resp.status_code == 200, reopen_resp.text
    reopened = reopen_resp.json()

    assert reopened["subject"] == payload["subject"]
    assert reopened["customer_reference"] == payload["customer_reference"]
    assert reopened["delivery_point"] == payload["delivery_point"]
    assert reopened["lead_time"] == payload["lead_time"]
    assert reopened["company_logo"] == TINY_PNG_DATA_URL
    assert reopened["quote_number"] == payload["quote_number"]
    assert reopened["release_date"] == payload["release_date"]
    assert reopened["prepared_by_name"] == payload["prepared_by_name"]
    assert reopened["prepared_by_title"] == payload["prepared_by_title"]
    assert reopened["release_notes"] == payload["release_notes"]
