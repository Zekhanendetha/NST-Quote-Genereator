from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.dates import today_iso
from models.quote import Quote, QuoteCreate, QuoteLineItem


router = APIRouter(prefix="/quotes", tags=["quotes"])


def build_quote(payload: QuoteCreate) -> Quote:
    items: list[QuoteLineItem] = []
    subtotal = 0.0
    total_cost = 0.0

    for item in payload.line_items:
        if item.category == "sales":
            line_total = item.sell_rate if item.sales_pricing == "line_total" else item.quantity * item.sell_rate
            line_cost = item.cost_rate if item.sales_pricing == "line_total" else item.quantity * item.cost_rate
        else:
            multiplier = item.duration_days if item.charge_type == "daily" else 1
            line_total = item.quantity * item.sell_rate * multiplier
            line_cost = item.quantity * item.cost_rate * multiplier
        line_total = round(line_total, 2)
        line_cost = round(line_cost, 2)
        subtotal += line_total
        total_cost += line_cost
        items.append(
            QuoteLineItem(
                **item.model_dump(),
                line_total=line_total,
                line_cost=line_cost,
            )
        )

    subtotal = round(subtotal, 2)
    total_cost = round(total_cost, 2)
    tax_amount = round(subtotal * payload.tax_rate / 100, 2) if payload.tax_enabled else 0
    grand_total = round(subtotal + tax_amount, 2)
    gross_profit = round(subtotal - total_cost, 2)
    margin_percent = round((gross_profit / subtotal) * 100, 1) if subtotal else 0

    return Quote(
        **payload.model_dump(exclude={"line_items"}),
        quote_number=f"Q-{datetime.now(timezone.utc).strftime('%Y')}-{datetime.now(timezone.utc).strftime('%m%d')}-{datetime.now(timezone.utc).strftime('%H%M%S')}",
        issue_date=today_iso(),
        created_at=datetime.now(timezone.utc),
        line_items=items,
        subtotal=subtotal,
        total_cost=total_cost,
        tax_amount=tax_amount,
        grand_total=grand_total,
        gross_profit=gross_profit,
        margin_percent=margin_percent,
    )


@router.get("", response_model=list[Quote])
async def list_quotes():
    documents = await db.quotes.find().sort("created_at", -1).to_list(1000)
    return [Quote(**document) for document in documents]


@router.post("", response_model=Quote)
async def create_quote(payload: QuoteCreate):
    quote = build_quote(payload)
    await db.quotes.insert_one(quote.model_dump())
    return quote


@router.put("/{quote_id}", response_model=Quote)
async def update_quote(quote_id: str, payload: QuoteCreate):
    existing = await db.quotes.find_one({"id": quote_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quote not found")
    quote = build_quote(payload)
    quote.id = quote_id
    quote.quote_number = existing.get("quote_number", quote.quote_number)
    quote.issue_date = existing.get("issue_date", quote.issue_date)
    quote.created_at = existing.get("created_at", quote.created_at)
    quote.status = existing.get("status", "draft")
    await db.quotes.replace_one({"id": quote_id}, quote.model_dump())
    return quote


@router.get("/{quote_id}", response_model=Quote)
async def get_quote(quote_id: str):
    document = await db.quotes.find_one({"id": quote_id})
    if not document:
        raise HTTPException(status_code=404, detail="Quote not found")
    return Quote(**document)


@router.delete("/{quote_id}", status_code=204)
async def delete_quote(quote_id: str):
    result = await db.quotes.delete_one({"id": quote_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")