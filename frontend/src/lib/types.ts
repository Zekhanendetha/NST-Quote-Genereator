export type LineCategory = "sales" | "rental" | "service";
export type ChargeType = "daily" | "lump_sum";
export type SalesPricing = "unit" | "line_total";
export type PriceMethod = "sell_rate" | "margin";
export type CostAddonType = "none" | "local_tax" | "import_tax" | "custom";
export type BuilderMode = "margin_calculator" | "quote_only";
export type ApprovalMode = "same_as_preparer" | "escalation";

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
  cost_addon_type: CostAddonType;
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

export interface TermsClause {
  id: string;
  title: string;
  content: string;
}

export interface QuotePayload {
  builder_mode: BuilderMode;
  overall_cost: number;
  quote_number: string;
  release_date: string;
  client_name: string;
  client_company: string;
  client_email: string;
  client_location: string;
  customer_reference: string;
  delivery_point: string;
  company_name: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  company_logo: string;
  prepared_by_name: string;
  prepared_by_title: string;
  prepared_by_email: string;
  prepared_by_phone: string;
  approval_mode: ApprovalMode;
  approval_name: string;
  approval_title: string;
  quote_title: string;
  subject: string;
  currency: string;
  usd_exchange_rate: number | null;
  tax_enabled: boolean;
  tax_rate: number;
  payment_terms: string;
  lead_time: string;
  valid_days: number;
  notes: string;
  release_notes: string;
  terms_conditions: TermsClause[];
  commission_amount: number;
  line_items: QuoteLineItemInput[];
}

export interface Quote extends QuotePayload {
  id: string;
  status: QuoteStatus;
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

export type QuoteStatus = "draft" | "issued" | "released" | "cancelled" | "executed" | "partial_executed";

export interface CompanyProfile {
  id: string;
  company_name: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  company_logo: string;
}

export const CURRENCIES = ["USD", "IDR", "EUR", "GBP", "AED", "SAR", "SGD", "MYR", "AUD", "CAD", "JPY", "CNY", "QAR", "KWD", "NGN"];
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