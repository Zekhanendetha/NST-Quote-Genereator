from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


LineCategory = Literal["sales", "rental", "service"]
ChargeType = Literal["daily", "lump_sum"]
SalesPricing = Literal["unit", "line_total"]


class QuoteLineItemInput(BaseModel):
    description: str = Field(min_length=1)
    category: LineCategory
    charge_type: ChargeType
    sales_pricing: SalesPricing = "unit"
    uom: str = Field(min_length=1, max_length=40)
    quantity: float = Field(gt=0)
    duration_days: float = Field(default=1, gt=0)
    sell_rate: float = Field(ge=0)
    cost_rate: float = Field(ge=0)
    cost_addon_percent: float = Field(default=0, ge=0, le=1000)


class QuoteCreate(BaseModel):
    client_name: str = Field(min_length=1)
    client_company: str = Field(min_length=1)
    client_email: str = ""
    client_location: str = ""
    company_name: str = Field(min_length=1)
    company_address: str = ""
    company_email: str = ""
    company_phone: str = ""
    quote_title: str = "Commercial Quotation"
    currency: str = Field(default="USD", min_length=3, max_length=3)
    tax_enabled: bool = False
    tax_rate: float = Field(default=0, ge=0, le=100)
    payment_terms: str = "30 days from invoice"
    lead_time: str = "To be confirmed"
    valid_days: int = Field(default=30, ge=1, le=365)
    notes: str = ""
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
    status: Literal["draft", "issued"] = "draft"
    issue_date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    client_name: str
    client_company: str
    client_email: str
    client_location: str
    company_name: str
    company_address: str
    company_email: str
    company_phone: str
    quote_title: str
    currency: str
    tax_enabled: bool
    tax_rate: float
    payment_terms: str
    lead_time: str
    valid_days: int
    notes: str
    line_items: list[QuoteLineItem]
    subtotal: float
    total_cost: float
    tax_amount: float
    grand_total: float
    gross_profit: float
    margin_percent: float
    commission_amount: float = 0
    commission_per_line: float = 0