export type LineCategory = "sales" | "rental" | "service";
export type ChargeType = "daily" | "lump_sum";
export type SalesPricing = "unit" | "line_total";
export type PriceMethod = "sell_rate" | "margin";

export interface QuoteLineItemInput {
  description: string;
  description_details: string;
  category: LineCategory;
  charge_type: ChargeType;
  sales_pricing: SalesPricing;
  uom: string;
  quantity: number;
  duration_days: number;
  price_method: PriceMethod;
  sell_rate: number;
  target_margin_percent: number;
  cost_rate: number;
  cost_addon_percent: number;
}

export interface QuoteLineItem extends QuoteLineItemInput {
  id: string;
  line_total: number;
  line_cost: number;
  base_total: number;
  base_cost: number;
  cost_addon_amount: number;
  commission_allocation: number;
}

export interface QuotePayload {
  client_name: string;
  client_company: string;
  client_email: string;
  client_location: string;
  company_name: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  quote_title: string;
  currency: string;
  tax_enabled: boolean;
  tax_rate: number;
  payment_terms: string;
  lead_time: string;
  valid_days: number;
  notes: string;
  commission_amount: number;
  line_items: QuoteLineItemInput[];
}

export interface Quote extends QuotePayload {
  id: string;
  quote_number: string;
  status: "draft" | "issued";
  issue_date: string;
  created_at: string;
  line_items: QuoteLineItem[];
  subtotal: number;
  total_cost: number;
  tax_amount: number;
  grand_total: number;
  gross_profit: number;
  margin_percent: number;
  commission_per_line: number;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "NGN"];
export const CATEGORY_LABELS: Record<LineCategory, string> = {
  sales: "Sales",
  rental: "Rental",
  service: "Service",
};

export const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);