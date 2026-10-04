from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


LineCategory = Literal["sales", "rental", "service"]
ChargeType = Literal["daily", "lump_sum"]
SalesPricing = Literal["unit", "line_total"]
PriceMethod = Literal["sell_rate", "margin"]
CostAddonType = Literal["none", "local_tax", "import_tax", "custom"]


class QuoteLineItemInput(BaseModel):
    description: str = ""
    description_details: str = ""
    category: LineCategory
    charge_type: ChargeType
    sales_pricing: SalesPricing = "unit"
    uom: str = Field(min_length=1, max_length=40)
    quantity: float = Field(gt=0)
    duration_days: float = Field(default=1, gt=0)
    price_method: PriceMethod = "sell_rate"
    sell_rate: float = Field(ge=0)
    target_margin_percent: float = Field(default=0, ge=0, lt=100)
    cost_rate: float = Field(ge=0)
    cost_addon_type: CostAddonType = "custom"
    cost_addon_percent: float = Field(default=0, ge=0, le=1000)


class QuoteCreate(BaseModel):
    quote_number: str = Field(default="", max_length=80)
    release_date: str = Field(default="", max_length=10)
    client_name: str = Field(min_length=1)
    client_company: str = Field(min_length=1)
    client_email: str = ""
    client_location: str = ""
    customer_reference: str = ""
    delivery_point: str = ""
    company_name: str = Field(min_length=1)
    company_address: str = ""
    company_email: str = ""
    company_phone: str = ""
    company_logo: str = Field(default="", max_length=1_500_000)
    prepared_by_name: str = ""
    prepared_by_title: str = ""
    prepared_by_email: str = ""
    prepared_by_phone: str = ""
    quote_title: str = "Commercial Quotation"
    subject: str = ""
    currency: str = Field(default="USD", min_length=3, max_length=3)
    usd_exchange_rate: float | None = Field(default=None, gt=0)
    tax_enabled: bool = False
    tax_rate: float = Field(default=0, ge=0, le=100)
    payment_terms: str = "30 days from invoice"
    lead_time: str = "To be confirmed"
    valid_days: int = Field(default=30, ge=1, le=365)
    notes: str = ""
    release_notes: str = ""
    commission_amount: float = Field(default=0, ge=0)
    line_items: list[QuoteLineItemInput] = Field(min_length=1)


class QuoteLineItem(QuoteLineItemInput):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_total: float
    line_cost: float
    base_total: float = 0
    base_cost: float = 0
    cost_addon_amount: float = 0
    commission_allocation: float = 0


class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quote_number: str
    status: Literal["draft", "issued", "released", "cancelled", "executed", "partial_executed"] = "draft"
    issue_date: str
    release_date: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    client_name: str
    client_company: str
    client_email: str
    client_location: str
    customer_reference: str = ""
    delivery_point: str = ""
    company_name: str
    company_address: str
    company_email: str
    company_phone: str
    company_logo: str = ""
    prepared_by_name: str = ""
    prepared_by_title: str = ""
    prepared_by_email: str = ""
    prepared_by_phone: str = ""
    quote_title: str
    subject: str = ""
    currency: str
    usd_exchange_rate: float | None = None
    tax_enabled: bool
    tax_rate: float
    payment_terms: str
    lead_time: str
    valid_days: int
    notes: str
    release_notes: str = ""
    line_items: list[QuoteLineItem]
    subtotal: float
    total_cost: float
    tax_amount: float
    grand_total: float
    gross_profit: float
    margin_percent: float
    commission_amount: float = 0
    commission_per_line: float = 0


class QuoteStatusUpdate(BaseModel):
    status: Literal["draft", "issued", "released", "cancelled", "executed", "partial_executed"]