from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from lib.dates import today_iso
from models.quote import Quote, QuoteCreate, QuoteLineItem, QuoteStatusUpdate


router = APIRouter(prefix="/quotes", tags=["quotes"])


def base_line_value(item, rate: float) -> float:
    if item.category == "sales":
        return rate if item.sales_pricing == "line_total" else item.quantity * rate
    multiplier = item.duration_days if item.charge_type == "daily" else 1
    return item.quantity * rate * multiplier


def build_quote(payload: QuoteCreate) -> Quote:
    items: list[QuoteLineItem] = []
    subtotal = 0.0
    total_cost = 0.0
    commission_per_line = payload.commission_amount / len(payload.line_items) if payload.line_items else 0

    for index, item in enumerate(payload.line_items):
        commission_allocation = round(commission_per_line, 2)
        if index == len(payload.line_items) - 1:
            commission_allocation = round(payload.commission_amount - round(commission_per_line, 2) * (len(payload.line_items) - 1), 2)
        base_total = base_line_value(item, item.sell_rate)
        base_cost = base_line_value(item, item.cost_rate)
        cost_addon_amount = round(base_cost * item.cost_addon_percent / 100, 2)
        if item.price_method == "margin":
            base_total = (base_cost + cost_addon_amount) / (1 - item.target_margin_percent / 100)
        line_total = base_total + commission_allocation
        line_cost = base_cost + cost_addon_amount
        subtotal += line_total
        total_cost += line_cost
        line_total = round(line_total, 2)
        line_cost = round(line_cost, 2)
        items.append(
            QuoteLineItem(
                **item.model_dump(),
                line_total=line_total,
                line_cost=line_cost,
                base_total=round(base_total, 2),
                base_cost=round(base_cost, 2),
                cost_addon_amount=cost_addon_amount,
                commission_allocation=commission_allocation,
            )
        )

    subtotal = round(subtotal, 2)
    total_cost = round(total_cost, 2)
    tax_amount = round(subtotal * payload.tax_rate / 100, 2) if payload.tax_enabled else 0
    grand_total = round(subtotal + tax_amount, 2)
    gross_profit = round(subtotal - total_cost, 2)
    margin_percent = round((gross_profit / subtotal) * 100, 1) if subtotal else 0

    release_date = payload.release_date or today_iso()
    quote_number = payload.quote_number.strip() or f"Q-{datetime.now(timezone.utc).strftime('%Y')}-{datetime.now(timezone.utc).strftime('%m%d')}-{datetime.now(timezone.utc).strftime('%H%M%S')}"
    return Quote(
        **payload.model_dump(exclude={"line_items", "quote_number"}),
        quote_number=quote_number,
        issue_date=release_date,
        created_at=datetime.now(timezone.utc),
        line_items=items,
        subtotal=subtotal,
        total_cost=total_cost,
        tax_amount=tax_amount,
        grand_total=grand_total,
        gross_profit=gross_profit,
        margin_percent=margin_percent,
        commission_per_line=round(commission_per_line, 2),
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
    if not payload.quote_number.strip():
        quote.quote_number = existing.get("quote_number", quote.quote_number)
    if not payload.release_date:
        quote.release_date = existing.get("release_date") or existing.get("issue_date", quote.release_date)
        quote.issue_date = quote.release_date
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


@router.patch("/{quote_id}/status", response_model=Quote)
async def update_quote_status(quote_id: str, payload: QuoteStatusUpdate):
    result = await db.quotes.find_one_and_update(
        {"id": quote_id},
        {"$set": {"status": payload.status}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Quote not found")
    return Quote(**result)


@router.delete("/{quote_id}", status_code=204)
async def delete_quote(quote_id: str):
    result = await db.quotes.delete_one({"id": quote_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")