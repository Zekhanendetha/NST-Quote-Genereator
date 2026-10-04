import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Check, ChevronDown, ChevronRight, ChevronUp, Download, FileText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateQuotePdf } from "@/lib/generateQuotePdf";
import { CURRENCIES, CATEGORY_LABELS, formatMoney, type BuilderMode, type ChargeType, type CompanyProfile, type CostAddonType, type LineCategory, type PriceMethod, type Quote, type QuoteLineItemInput, type QuotePayload, type SalesPricing, type TermsClause } from "@/lib/types";

const emptyItem = (): QuoteLineItemInput => ({ description: "", description_details: "", category: "service", charge_type: "daily", sales_pricing: "unit", uom: "day", quantity: 1, duration_days: 1, price_method: "sell_rate", sell_rate: 0, target_margin_percent: 0, cost_rate: 0, cost_addon_type: "none", cost_addon_percent: 0 });
const defaultTerms = (): TermsClause[] => [{ id: "price-basis", title: "Price Basis", content: "All prices are quoted in {{currency}} unless otherwise stated." }, { id: "payment-terms", title: "Payment Terms", content: "{{payment_terms}}" }, { id: "delivery-lead-time", title: "Delivery Lead Time", content: "{{lead_time}} after official release of the Purchase Order (PO)." }, { id: "scope-of-supply", title: "Scope of Supply", content: "As per quotation subject: “{{subject}}”." }, { id: "order-confirmation", title: "Order Confirmation", content: "The Purchase Order shall be deemed accepted only upon written confirmation by the Seller." }, { id: "change-to-order", title: "Change to Order", content: "Any changes to specifications, quantity, or delivery schedule after order confirmation may result in adjustments to price and delivery lead time." }];
const initialForm: QuotePayload = { builder_mode: "margin_calculator", overall_cost: 0, quote_number: "", release_date: "", client_name: "", client_company: "", client_email: "", client_location: "", customer_reference: "", delivery_point: "", company_name: "", company_address: "", company_email: "", company_phone: "", company_logo: "", prepared_by_name: "", prepared_by_title: "", prepared_by_email: "", prepared_by_phone: "", quote_title: "Commercial Quotation", subject: "", currency: "USD", usd_exchange_rate: 1, tax_enabled: false, tax_rate: 5, payment_terms: "30 days from invoice", lead_time: "To be confirmed", valid_days: 30, notes: "This quotation is subject to final scope confirmation and availability.", release_notes: "", terms_conditions: defaultTerms(), commission_amount: 0, line_items: [emptyItem()] };

const lineValue = (item: QuoteLineItemInput, rate: number) => item.category === "sales"
  ? (item.sales_pricing === "line_total" ? rate : item.quantity * rate)
  : item.quantity * rate * (item.charge_type === "daily" ? item.duration_days : 1);

const loadedLineCost = (item: QuoteLineItemInput) => {
  const baseCost = lineValue(item, item.cost_rate);
  return baseCost + baseCost * item.cost_addon_percent / 100;
};

const quotedBaseValue = (item: QuoteLineItemInput) => item.price_method === "margin"
  ? loadedLineCost(item) / (1 - item.target_margin_percent / 100)
  : lineValue(item, item.sell_rate);

const fetchQuote = (id: string) => apiGet<Quote>(`/quotes/${id}`);
const fetchCompanyProfile = () => apiGet<CompanyProfile>("/company-profile");

function Field({ label, testId, children, className = "" }: { label: string; testId: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="data-label mb-2 block text-slate-500">{label}</span><div data-testid={`${testId}-field`}>{children}</div></label>;
}

function TextInput({ value, onChange, testId, placeholder = "" }: { value: string; onChange: (value: string) => void; testId: string; placeholder?: string }) {
  return <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />;
}

type BuilderSection = "mode" | "parties" | "subject" | "commercial" | "internal" | "terms" | "release" | "identity";
const defaultSectionVisibility: Record<BuilderSection, boolean> = { mode: true, parties: true, subject: true, commercial: true, internal: true, terms: true, release: true, identity: true };

function SectionToggleButton({ section, open, onToggle }: { section: BuilderSection; open: boolean; onToggle: () => void }) {
  return <button type="button" data-testid={`${section}-section-toggle-button`} aria-expanded={open} onClick={onToggle} className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:border-orange-400 hover:text-orange-700">{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{open ? "Hide" : "Show"}</button>;
}

interface LineItemEditorProps {
  item: QuoteLineItemInput;
  index: number;
  currency: string;
  builderMode: BuilderMode;
  commissionPerLine: number;
  itemCount: number;
  isLast: boolean;
  onUpdate: (key: keyof QuoteLineItemInput, value: string | number) => void;
  onRemove: () => void;
  onAddNext: () => void;
}

function LineItemEditor({ item, index, currency, builderMode, commissionPerLine, itemCount, isLast, onUpdate, onRemove, onAddNext }: LineItemEditorProps) {
  const baseCost = lineValue(item, item.cost_rate);
  const costAddon = baseCost * item.cost_addon_percent / 100;
  const quotedLineTotal = (builderMode === "quote_only" ? lineValue(item, item.sell_rate) : quotedBaseValue(item)) + commissionPerLine;
  const sellingComplete = item.price_method === "sell_rate" || builderMode === "quote_only" ? item.sell_rate > 0 : item.target_margin_percent > 0;
  const lineReadyForQuickAdd = item.description.trim() && item.quantity > 0 && sellingComplete && (builderMode === "quote_only" || item.cost_rate > 0);
  const handleQuickAdd = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || event.shiftKey || target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "SELECT" || !isLast || !lineReadyForQuickAdd) return;
    event.preventDefault();
    onAddNext();
  };

  return (
    <div data-testid={`line-item-card-${index}`} onKeyDown={handleQuickAdd} className="border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-orange-200">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center bg-slate-900 font-mono text-xs text-white">{String(index + 1).padStart(2, "0")}</span><span data-testid={`line-item-label-${index}`} className="data-label text-slate-500">Pricing line</span></div>
        <button type="button" data-testid={`remove-line-item-button-${index}`} onClick={onRemove} disabled={itemCount === 1} className="p-1 text-slate-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Remove line item"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <Field label="Description · quick add" testId={`line-item-description-${index}`} className="md:col-span-5"><TextInput testId={`line-item-description-input-${index}`} value={item.description} onChange={(value) => onUpdate("description", value)} placeholder="e.g. Wellhead pressure control package" /></Field>
        <Field label="Category" testId={`line-item-category-${index}`} className="md:col-span-3"><select data-testid={`line-item-category-select-${index}`} value={item.category} onChange={(event) => onUpdate("category", event.target.value as LineCategory)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">{(Object.keys(CATEGORY_LABELS) as LineCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></Field>
        <Field label="UoM" testId={`line-item-uom-${index}`} className="md:col-span-2"><select data-testid={`line-item-uom-select-${index}`} value={item.uom} onChange={(event) => onUpdate("uom", event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"><option value="day">Day</option><option value="hour">Hour</option><option value="month">Month</option><option value="set">Set</option><option value="each">Each</option><option value="lump sum">Lump sum</option></select></Field>
        <Field label="Quantity" testId={`line-item-quantity-${index}`} className="md:col-span-2"><input data-testid={`line-item-quantity-input-${index}`} type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => onUpdate("quantity", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
      </div>

      <Field label="Detailed specification" testId={`line-item-details-${index}`} className="mt-4"><textarea data-testid={`line-item-details-input-${index}`} value={item.description_details} onChange={(event) => onUpdate("description_details", event.target.value)} rows={3} placeholder="Add model, pressure rating, material, certification, included accessories, exclusions, or other client-facing details…" className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 md:grid-cols-12">
        {item.category === "sales" ? <Field label="Sales pricing" testId={`line-item-sales-pricing-${index}`} className="md:col-span-6"><div className="flex border border-orange-200 bg-orange-50/60 p-1">{(["unit", "line_total"] as SalesPricing[]).map((pricing) => <button type="button" data-testid={`line-item-sales-pricing-${index}-${pricing}-button`} key={pricing} onClick={() => onUpdate("sales_pricing", pricing)} className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${item.sales_pricing === pricing ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-orange-100"}`}>{pricing === "unit" ? "Per unit" : "Line total"}</button>)}</div></Field> : <Field label="Charge basis" testId={`line-item-charge-${index}`} className="md:col-span-6"><div className="flex border border-slate-300 bg-white p-1">{(["daily", "lump_sum"] as ChargeType[]).map((chargeType) => <button type="button" data-testid={`line-item-charge-${index}-${chargeType}-button`} key={chargeType} onClick={() => onUpdate("charge_type", chargeType)} className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${item.charge_type === chargeType ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-orange-50"}`}>{chargeType === "daily" ? "Daily" : "Lump sum"}</button>)}</div></Field>}
        <Field label="Duration (days)" testId={`line-item-duration-${index}`} className="md:col-span-3"><input data-testid={`line-item-duration-input-${index}`} type="number" min="1" step="1" disabled={item.category === "sales" || item.charge_type !== "daily"} value={item.duration_days} onChange={(event) => onUpdate("duration_days", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none enabled:focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-400" /></Field>
      </div>

      <div className="mt-4 border border-slate-200 bg-white p-4">
        <p className="data-label mb-4 text-orange-600">Pricing calculation</p>
        {builderMode === "quote_only" ? <div className="grid grid-cols-1 gap-4 md:grid-cols-12"><Field label="Sell price" testId={`line-item-sell-rate-${index}`} className="md:col-span-4"><input data-testid={`line-item-sell-rate-input-${index}`} type="number" min="0" step="0.01" value={item.sell_rate} onChange={(event) => onUpdate("sell_rate", Number(event.target.value))} className="w-full border border-orange-300 bg-orange-50 px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <Field label="Sell rate / margin" testId={`line-item-price-method-${index}`} className="md:col-span-3"><div className="flex border border-slate-300 bg-slate-50 p-1">{(["sell_rate", "margin"] as PriceMethod[]).map((method) => <button type="button" data-testid={`line-item-price-method-${index}-${method}-button`} key={method} onClick={() => onUpdate("price_method", method)} className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${item.price_method === method ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-orange-50"}`}>{method === "sell_rate" ? "Sell rate" : "Margin %"}</button>)}</div><p data-testid={`line-item-price-method-note-${index}`} className="mt-2 text-[10px] leading-4 text-slate-500">please choose wether you will use your sell price / margin precentage</p></Field>
          {item.price_method === "sell_rate" ? <Field label="Sell rate" testId={`line-item-sell-rate-${index}`} className="md:col-span-3"><input data-testid={`line-item-sell-rate-input-${index}`} type="number" min="0" step="0.01" value={item.sell_rate} onChange={(event) => onUpdate("sell_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field> : <Field label="Target margin %" testId={`line-item-margin-${index}`} className="md:col-span-3"><input data-testid={`line-item-margin-input-${index}`} type="number" min="0" max="99.99" step="0.1" value={item.target_margin_percent} onChange={(event) => onUpdate("target_margin_percent", Number(event.target.value))} className="w-full border border-orange-300 bg-orange-50 px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>}
          <Field label="Cost" testId={`line-item-cost-rate-${index}`} className="md:col-span-3"><input data-testid={`line-item-cost-rate-input-${index}`} type="number" min="0" step="0.01" value={item.cost_rate} onChange={(event) => onUpdate("cost_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
          <Field label="Cost added value" testId={`line-item-cost-addon-${index}`} className="md:col-span-3"><select data-testid={`line-item-cost-addon-select-${index}`} value={item.cost_addon_type} onChange={(event) => { const type = event.target.value as CostAddonType; onUpdate("cost_addon_type", type); onUpdate("cost_addon_percent", type === "local_tax" ? 11 : type === "import_tax" ? 14 : 0); }} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"><option value="none">No cost add-on (0%)</option><option value="local_tax">Local Tax (11%)</option><option value="import_tax">Import Tax (14%) incl. landing cost</option><option value="custom">Customize Tax</option></select>{item.cost_addon_type === "custom" && <input data-testid={`line-item-cost-addon-input-${index}`} type="number" min="0" step="0.1" value={item.cost_addon_percent} onChange={(event) => onUpdate("cost_addon_percent", Number(event.target.value))} placeholder="Enter percentage" className="mt-2 w-full border border-orange-300 bg-orange-50 px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />}</Field>
        </div>}
      </div>

      {builderMode === "quote_only" ? <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-200 pt-3 text-xs"><div><span className="block text-slate-500">Item sell amount</span><span data-testid={`line-item-base-sell-${index}`} className="mt-1 block font-mono font-semibold">{formatMoney(lineValue(item, item.sell_rate), currency)}</span></div><div><span className="block text-slate-500">Commission share</span><span data-testid={`line-item-commission-${index}`} className="mt-1 block font-mono font-semibold text-orange-700">+ {formatMoney(commissionPerLine, currency)}</span></div><div className="text-right"><span className="block text-slate-500">Quoted line total</span><span data-testid={`line-item-total-${index}`} className="mt-1 block font-mono font-bold text-slate-900">{formatMoney(quotedLineTotal, currency)}</span></div></div> : <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs sm:grid-cols-4"><div><span className="block text-slate-500">Base cost</span><span data-testid={`line-item-base-cost-${index}`} className="mt-1 block font-mono font-semibold">{formatMoney(baseCost, currency)}</span></div><div><span className="block text-slate-500">Cost add-on</span><span data-testid={`line-item-cost-addon-amount-${index}`} className="mt-1 block font-mono font-semibold">{formatMoney(costAddon, currency)}</span></div><div><span className="block text-slate-500">Commission share</span><span data-testid={`line-item-commission-${index}`} className="mt-1 block font-mono font-semibold text-orange-700">+ {formatMoney(commissionPerLine, currency)}</span></div><div className="text-right"><span className="block text-slate-500">Quoted line total</span><span data-testid={`line-item-total-${index}`} className="mt-1 block font-mono font-bold text-slate-900">{formatMoney(quotedLineTotal, currency)}</span></div></div>}
      {isLast && <p data-testid={`line-item-enter-hint-${index}`} className="mt-3 text-right text-[10px] text-slate-400">{builderMode === "quote_only" ? "Complete Description, Quantity, and Sell Price — then press Enter to add the next item." : "Complete Description, Quantity, Sell Rate/Margin, and Cost — then press Enter to add the next item."}</p>}
    </div>
  );
}

function QuotationLineRow({ item, index, currency, builderMode, commissionPerLine }: { item: QuoteLineItemInput; index: number; currency: string; builderMode: BuilderMode; commissionPerLine: number }) {
  const lineTotal = (builderMode === "quote_only" ? lineValue(item, item.sell_rate) : quotedBaseValue(item)) + commissionPerLine;
  const billedUnits = item.category !== "sales" && item.charge_type === "daily" ? item.quantity * item.duration_days : item.quantity;
  const itemPrice = billedUnits ? lineTotal / billedUnits : lineTotal;
  const basis = item.category === "sales" ? (item.sales_pricing === "unit" ? "Per unit" : "Line total") : (item.charge_type === "daily" ? "Daily" : "Lump sum");

  return (
    <tr data-testid={`preview-line-item-${index}`} className="border-b border-slate-100 align-top">
      <td className="py-2.5 pr-5"><span data-testid={`preview-line-description-${index}`} className="font-semibold">{item.description || "—"}</span>{item.description_details && <span data-testid={`preview-line-details-${index}`} className="mt-1 block whitespace-pre-line text-[10px] leading-4 text-slate-500">{item.description_details}</span>}</td>
      <td data-testid={`preview-line-category-${index}`} className="py-2.5 pr-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">{CATEGORY_LABELS[item.category]}</span><span className="mt-1 block text-[9px] uppercase tracking-wider text-slate-400">{basis}</span></td>
      <td data-testid={`preview-line-quantity-${index}`} className="py-2.5 text-right font-mono text-[10px]">{item.quantity}</td>
      <td data-testid={`preview-line-uom-${index}`} className="py-2.5 text-right text-[10px]"><span className="uppercase">{item.uom}</span>{item.category !== "sales" && item.charge_type === "daily" && <span className="mt-1 block text-[9px] text-slate-400">{item.duration_days} day{item.duration_days === 1 ? "" : "s"}</span>}</td>
      <td data-testid={`preview-line-item-price-${index}`} className="py-2.5 pl-3 text-right font-mono text-[10px]">{formatMoney(itemPrice, currency)}</td>
      <td data-testid={`preview-line-amount-${index}`} className="py-2.5 pl-3 text-right font-mono text-xs font-semibold">{formatMoney(lineTotal, currency)}</td>
    </tr>
  );
}

function DocumentLogo({ logo, companyName, testId }: { logo: string; companyName: string; testId: string }) {
  return <div className="flex min-h-16 items-start justify-center border-b border-slate-100 pb-3">{logo && <img data-testid={testId} src={logo} alt={`${companyName} logo`} className="h-14 max-w-[240px] object-contain" />}</div>;
}

function DocumentHeader({ form, reference, releaseDate, prefix }: { form: QuotePayload; reference: string; releaseDate: string; prefix: string }) {
  return (
    <div className="document-page-header">
      <DocumentLogo logo={form.company_logo} companyName={form.company_name} testId={`${prefix}-company-logo`} />
      <div className="border-b-4 border-orange-600 py-4"><div className="flex items-start justify-between gap-6"><div className="min-w-0 flex-1"><p className="break-words data-label text-orange-600">{form.company_name || "Company Name"}</p><h2 data-testid={`${prefix}-quote-title`} className="mt-2 break-words font-heading text-2xl font-bold tracking-tight">{form.quote_title}</h2><p data-testid={`${prefix}-subject`} className="mt-1.5 max-w-md break-words text-xs leading-5 text-slate-600">{form.subject || "Quotation subject"}</p></div><div className="w-[170px] shrink-0 text-right"><p data-testid={`${prefix}-confidential`} className="data-label text-red-700">Confidential</p><p className="mt-1.5 data-label">Commercial offer</p><p data-testid={`${prefix}-quote-reference`} className="mt-1.5 break-words font-mono text-xs font-bold">{reference}</p><p data-testid={`${prefix}-release-date`} className="mt-1.5 text-[10px] text-slate-500">Release date: <span className="font-semibold text-slate-700">{releaseDate}</span></p><p className="mt-1 text-[10px] text-slate-500">Validity: {form.valid_days} days</p></div></div></div>
    </div>
  );
}

interface PageLineItem { item: QuoteLineItemInput; originalIndex: number }

const estimatedItemUnits = (item: QuoteLineItemInput) => Math.max(1, Math.ceil((item.description.length + item.description_details.length) / 82));

function takePageItems(items: PageLineItem[], capacity: number) {
  const pageItems: PageLineItem[] = [];
  let used = 0;
  while (items.length) {
    const units = estimatedItemUnits(items[0].item);
    if (pageItems.length && used + units > capacity) break;
    pageItems.push(items.shift() as PageLineItem);
    used += units;
  }
  return pageItems;
}

function paginateLineItems(items: QuoteLineItemInput[]) {
  const remaining = items.map((item, originalIndex) => ({ item, originalIndex }));
  const totalUnits = remaining.reduce((sum, entry) => sum + estimatedItemUnits(entry.item), 0);
  if (totalUnits <= 7) return [remaining];
  const pages: PageLineItem[][] = [takePageItems(remaining, Math.min(14, Math.max(1, totalUnits - 7)))];
  while (remaining.reduce((sum, entry) => sum + estimatedItemUnits(entry.item), 0) > 7) {
    const remainingUnits = remaining.reduce((sum, entry) => sum + estimatedItemUnits(entry.item), 0);
    pages.push(takePageItems(remaining, Math.min(14, Math.max(1, remainingUnits - 7))));
  }
  if (remaining.length) pages.push([...remaining]);
  return pages;
}

const estimatedTermUnits = (term: TermsClause) => Math.max(1, Math.ceil((term.title.length + term.content.length) / 220));

function paginateTerms(terms: TermsClause[]) {
  const pages: TermsClause[][] = [];
  let current: TermsClause[] = [];
  let used = 0;
  for (const term of terms) {
    const units = estimatedTermUnits(term);
    if (current.length && used + units > 8) { pages.push(current); current = []; used = 0; }
    current.push(term);
    used += units;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

const resolveTermContent = (content: string, form: QuotePayload) => content
  .replaceAll("{{currency}}", form.currency)
  .replaceAll("{{payment_terms}}", form.payment_terms)
  .replaceAll("{{lead_time}}", form.lead_time)
  .replaceAll("{{subject}}", form.subject);

function DocumentPageFooter({ pageNumber, pageCount }: { pageNumber: number; pageCount: number }) {
  return <div className="document-page-footer absolute inset-x-12 bottom-6 border-t border-slate-200 pt-2 text-center font-mono text-[9px] tracking-[0.12em] text-slate-400">CONFIDENTIAL · Page {pageNumber} of {pageCount}</div>;
}

function IntroductionDocumentPage({ form, reference, releaseDate, pageCount }: { form: QuotePayload; reference: string; releaseDate: string; pageCount: number }) {
  return (
    <section data-testid="print-preview" data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      <DocumentHeader form={form} reference={reference} releaseDate={releaseDate} prefix="preview" />
      <div className="mt-5"><p className="data-label text-orange-600">Quotation introduction</p><h3 className="mt-2 font-heading text-xl font-bold tracking-tight">Introduction &amp; Correspondence</h3></div>
      <div className="mt-5 grid grid-cols-2 gap-8 border-y border-slate-200 py-4 text-xs"><div className="min-w-0"><p data-testid="preview-supplier-name" className="font-semibold">{form.company_name}</p>{(form.company_address || form.company_email || form.company_phone) && <p className="mt-1 whitespace-pre-line break-words text-[10px] leading-4 text-slate-500">{form.company_address}{form.company_email && <><br />{form.company_email}</>}{form.company_phone && <><br />{form.company_phone}</>}</p>}</div><div className="min-w-0"><p className="data-label">Customer</p><p data-testid="preview-client-name" className="mt-1.5 break-words font-semibold">{form.client_company}</p><p className="mt-1 break-words text-[10px] leading-4 text-slate-500">Attn: {form.client_name}{form.client_location && <><br />{form.client_location}</>}{form.client_email && <><br />{form.client_email}</>}{form.customer_reference && <><br />Ref: {form.customer_reference}</>}{form.delivery_point && <><br />Delivery point: {form.delivery_point}</>}</p></div></div>
      <div className="mt-5 space-y-4 text-xs leading-5 text-slate-600">
        <p data-testid="preview-introduction"><strong className="text-slate-800">{form.company_name}</strong> is pleased to submit this quotation proposal regarding “{form.subject}” for your consideration and review. This proposal has been prepared based on the scope and requirements discussed and outlines our proposed solution, deliverables, and commercial terms for your evaluation.</p>
        <p data-testid="preview-correspondence-wording">For the purpose of ensuring the timely and efficient handling of this matter, please address and direct all correspondence, inquiries, and related communications concerning the subject referenced above to the responsible party identified below.</p>
      </div>
      <div data-testid="preview-preparer-contact" className="mt-5 grid grid-cols-[130px_1fr] border border-slate-200 text-xs"><div className="border-b border-r border-slate-200 bg-slate-50 px-4 py-2 data-label text-slate-500">Name</div><div className="border-b border-slate-200 px-4 py-2 font-semibold">{form.prepared_by_name}</div><div className="border-b border-r border-slate-200 bg-slate-50 px-4 py-2 data-label text-slate-500">Designation</div><div className="border-b border-slate-200 px-4 py-2">{form.prepared_by_title}</div><div className="border-b border-r border-slate-200 bg-slate-50 px-4 py-2 data-label text-slate-500">E-Mail</div><div className="border-b border-slate-200 px-4 py-2">{form.prepared_by_email}</div><div className="border-r border-slate-200 bg-slate-50 px-4 py-2 data-label text-slate-500">Phone</div><div className="px-4 py-2">{form.prepared_by_phone}</div></div>
      <p data-testid="preview-appreciation-wording" className="mt-5 text-xs leading-5 text-slate-600"><strong className="text-slate-800">{form.company_name}</strong> would like to express its sincere appreciation to <strong className="text-slate-800">{form.client_company}</strong> for the opportunity to submit this quotation. We value your consideration and look forward to the possibility of working with you. We would welcome your favorable response at your convenience.</p>
      <div data-testid="preview-signature-block" className="mt-6 w-[44%] border border-slate-300 p-3 text-xs"><p className="font-semibold text-slate-700">Best Regards,</p><p className="mt-1 font-heading text-sm font-bold">{form.company_name}</p><div className="h-10" aria-label="Signature space" /><p data-testid="preview-prepared-by-name" className="border-t border-slate-400 pt-2 font-semibold text-slate-900">{form.prepared_by_name}</p><p data-testid="preview-prepared-by-title" className="mt-1 text-[9px] text-slate-500">{form.prepared_by_title}</p></div>
      <DocumentPageFooter pageNumber={1} pageCount={pageCount} />
    </section>
  );
}

interface CommercialDocumentPageProps {
  form: QuotePayload;
  entries: PageLineItem[];
  pageIndex: number;
  commercialPageCount: number;
  totalPageCount: number;
  reference: string;
  releaseDate: string;
  totals: { subtotal: number; tax: number; total: number; commissionPerLine: number };
}

function CommercialDocumentPage({ form, entries, pageIndex, commercialPageCount, totalPageCount, reference, releaseDate, totals }: CommercialDocumentPageProps) {
  const firstPage = pageIndex === 0;
  const lastPage = pageIndex === commercialPageCount - 1;
  return (
    <section data-testid={`commercial-page-${pageIndex + 1}`} data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      <DocumentHeader form={form} reference={reference} releaseDate={releaseDate} prefix={`commercial-header-${pageIndex + 1}`} />
      <div className="mt-5"><p className="data-label text-orange-600">{firstPage ? "Commercial pricing" : "Commercial schedule · Continued"}</p><h3 className="mt-2 font-heading text-xl font-bold tracking-tight">Commercial Section{firstPage ? "" : ` · ${pageIndex + 1}`}</h3></div>
      <table className="mt-4 w-full table-fixed text-left text-xs"><thead><tr className="border-b border-slate-900"><th className="w-[32%] pb-2 data-label">Description</th><th className="w-[14%] pb-2 data-label">Type / basis</th><th className="w-[9%] pb-2 text-right data-label">Qty</th><th className="w-[11%] pb-2 text-right data-label">UoM</th><th className="w-[17%] pb-2 text-right data-label">Item price</th><th className="w-[17%] pb-2 text-right data-label">Line amount</th></tr></thead><tbody>{entries.map(({ item, originalIndex }) => <QuotationLineRow key={originalIndex} item={item} index={originalIndex} currency={form.currency} builderMode={form.builder_mode} commissionPerLine={totals.commissionPerLine} />)}</tbody></table>
      {lastPage && <>
        <div className="ml-auto mt-4 max-w-[260px] space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{formatMoney(totals.subtotal, form.currency)}</span></div><div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="font-mono">{formatMoney(totals.tax, form.currency)}</span></div><div className="flex justify-between border-t-2 border-slate-900 pt-2 text-sm font-bold"><span>TOTAL</span><span data-testid="preview-total" className="font-mono text-orange-700">{formatMoney(totals.total, form.currency)}</span></div></div>
        <div className="mt-6 grid grid-cols-2 gap-8 border-t border-slate-200 pt-4 text-[10px] text-slate-500"><p><span className="font-semibold text-slate-700">Payment:</span> {form.payment_terms}</p><p><span className="font-semibold text-slate-700">Delivery:</span> {form.lead_time}</p></div>
        {form.notes && <p data-testid="preview-notes" className="mt-3 whitespace-pre-line text-[10px] leading-4 text-slate-400">{form.notes}</p>}
        {form.release_notes && <div data-testid="preview-release-notes" className="mt-4 border-l-2 border-orange-500 bg-orange-50 px-3 py-2"><p className="data-label text-orange-700">Release note</p><p className="mt-1.5 whitespace-pre-line text-[10px] leading-4 text-slate-600">{form.release_notes}</p></div>}
      </>}
      <DocumentPageFooter pageNumber={pageIndex + 2} pageCount={totalPageCount} />
    </section>
  );
}

export default function QuoteBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuotePayload>(initialForm);
  const [isDownloading, setIsDownloading] = useState(false);
  const [missingFieldsOpen, setMissingFieldsOpen] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [sectionVisibility, setSectionVisibility] = useState(defaultSectionVisibility);
  const quoteQuery = useQuery({ queryKey: ["quote", id], queryFn: () => fetchQuote(id as string), enabled: Boolean(id), retry: false });
  const profileQuery = useQuery({ queryKey: ["company-profile"], queryFn: fetchCompanyProfile, retry: false });

  useEffect(() => {
    if (quoteQuery.data) {
      const saved = quoteQuery.data;
      setForm({ ...saved, line_items: saved.line_items.map(({ id: _id, line_total: _total, line_cost: _cost, base_total: _baseTotal, base_cost: _baseCost, cost_addon_amount: _addon, commission_allocation: _commission, ...item }) => item) });
    }
  }, [quoteQuery.data]);

  useEffect(() => {
    if (!id && profileQuery.data) {
      const profile = profileQuery.data;
      setForm((current) => ({ ...current, company_name: profile.company_name, company_address: profile.company_address, company_email: profile.company_email, company_phone: profile.company_phone, company_logo: profile.company_logo }));
    }
  }, [id, profileQuery.data]);

  const totals = useMemo(() => {
    const baseSubtotal = form.line_items.reduce((sum, item) => sum + (form.builder_mode === "quote_only" ? lineValue(item, item.sell_rate) : quotedBaseValue(item)), 0);
    const lineCost = form.line_items.reduce((sum, item) => sum + loadedLineCost(item), 0);
    const cost = form.builder_mode === "quote_only" ? form.overall_cost : lineCost;
    const commissionPerLine = form.line_items.length ? form.commission_amount / form.line_items.length : 0;
    const subtotal = baseSubtotal + form.commission_amount;
    const tax = form.tax_enabled ? subtotal * form.tax_rate / 100 : 0;
    const marginRevenue = form.builder_mode === "quote_only" ? baseSubtotal : subtotal;
    const profit = marginRevenue - cost;
    return { subtotal, baseSubtotal, cost, tax, total: subtotal + tax, profit, margin: marginRevenue ? profit / marginRevenue * 100 : 0, commissionPerLine };
  }, [form]);
  const commercialPages = useMemo(() => paginateLineItems(form.line_items), [form.line_items]);
  const termsPages = useMemo(() => paginateTerms(form.terms_conditions), [form.terms_conditions]);
  const documentPageCount = commercialPages.length + termsPages.length + 2;
  const documentReference = form.quote_number || quoteQuery.data?.quote_number || "DRAFT / PREVIEW";
  const documentReleaseDate = form.release_date || quoteQuery.data?.release_date || quoteQuery.data?.issue_date || "Select date";
  const missingReleaseFields = useMemo(() => {
    const missing: string[] = [];
    if (!id) missing.push("Save the quotation before release");
    if (!form.company_name.trim()) missing.push("Workspace legal company name");
    if (!form.client_name.trim()) missing.push("Customer contact name");
    if (!form.client_company.trim()) missing.push("Customer company name");
    if (!form.client_email.trim()) missing.push("Customer email address");
    if (!form.client_location.trim()) missing.push("Customer location");
    if (!form.customer_reference.trim()) missing.push("Customer reference number");
    if (!form.delivery_point.trim()) missing.push("Delivery point");
    if (!form.lead_time.trim()) missing.push("Delivery lead time");
    if (!form.subject.trim()) missing.push("Quotation subject");
    if (!form.quote_title.trim()) missing.push("Quotation title");
    if (!form.currency.trim()) missing.push("Currency");
    if (!form.release_date && !quoteQuery.data?.release_date && !quoteQuery.data?.issue_date) missing.push("Release date");
    if (!form.prepared_by_name.trim()) missing.push("Preparer name");
    if (!form.prepared_by_title.trim()) missing.push("Preparer designation");
    if (!form.prepared_by_email.trim()) missing.push("Preparer email address");
    if (!form.prepared_by_phone.trim()) missing.push("Preparer phone number");
    if (form.currency !== "USD" && !(form.usd_exchange_rate && form.usd_exchange_rate > 0)) missing.push(`USD conversion rate for ${form.currency}`);
    if (form.tax_enabled && !(form.tax_rate > 0)) missing.push("Sales tax rate");
    if (!form.payment_terms.trim()) missing.push("Payment terms");
    if (!(form.valid_days > 0)) missing.push("Quotation validity period");
    if (!form.line_items.length) missing.push("At least one commercial line item");
    form.line_items.forEach((item, index) => {
      if (!item.uom.trim()) missing.push(`Line ${index + 1}: unit of measure`);
    });
    return missing;
  }, [form, id, quoteQuery.data?.issue_date, quoteQuery.data?.release_date]);

  const updateForm = <K extends keyof QuotePayload>(key: K, value: QuotePayload[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleSection = (section: BuilderSection) => setSectionVisibility((current) => ({ ...current, [section]: !current[section] }));
  const setAllSections = (open: boolean) => setSectionVisibility(Object.fromEntries(Object.keys(defaultSectionVisibility).map((key) => [key, open])) as Record<BuilderSection, boolean>);
  const updateItem = (index: number, key: keyof QuoteLineItemInput, value: string | number) => setForm((current) => ({ ...current, line_items: current.line_items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const addItem = () => {
    const nextIndex = form.line_items.length;
    setForm((current) => ({ ...current, line_items: [...current.line_items, emptyItem()] }));
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-testid="line-item-description-input-${nextIndex}"]`)?.focus());
  };
  const removeItem = (index: number) => setForm((current) => ({ ...current, line_items: current.line_items.filter((_, itemIndex) => itemIndex !== index) }));
  const updateTerm = (index: number, key: "title" | "content", value: string) => setForm((current) => ({ ...current, terms_conditions: current.terms_conditions.map((term, termIndex) => termIndex === index ? { ...term, [key]: value } : term) }));
  const addTerm = () => setForm((current) => ({ ...current, terms_conditions: [...current.terms_conditions, { id: crypto.randomUUID(), title: "New Term", content: "Enter the quotation term or condition." }] }));
  const removeTerm = (index: number) => setForm((current) => ({ ...current, terms_conditions: current.terms_conditions.filter((_, termIndex) => termIndex !== index) }));
  const moveTerm = (index: number, direction: -1 | 1) => setForm((current) => { const next = [...current.terms_conditions]; const destination = index + direction; if (destination < 0 || destination >= next.length) return current; [next[index], next[destination]] = [next[destination], next[index]]; return { ...current, terms_conditions: next }; });
  const saveMutation = useMutation({
    mutationFn: () => id ? apiPut<Quote>(`/quotes/${id}`, form) : apiPost<Quote>("/quotes", form),
    onSuccess: (saved) => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); queryClient.setQueryData(["quote", saved.id], saved); toast.success("Quote saved to your release history"); navigate(`/quotes/${saved.id}`, { replace: true }); },
    onError: () => toast.error("Unable to save this quote. Check the required fields and try again."),
  });

  const canSave = form.client_name.trim() && form.client_company.trim() && form.company_name.trim() && (form.currency === "USD" || (form.usd_exchange_rate ?? 0) > 0) && form.line_items.length > 0 && form.line_items.every((item) => item.uom.trim());
  const canPrint = missingReleaseFields.length === 0;
  const downloadPdf = async () => { if (missingReleaseFields.length) { setMissingFieldsOpen(true); return; } const restoreHidden = !previewVisible; setIsDownloading(true); try { if (restoreHidden) { setPreviewVisible(true); await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))); } const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-page='true']")); const filename = await generateQuotePdf({ pages, quoteNumber: documentReference, subject: form.subject, companyName: form.company_name }); toast.success(`Downloaded ${filename}`); } catch { toast.error("Unable to generate the PDF. Please try again."); } finally { if (restoreHidden) setPreviewVisible(false); setIsDownloading(false); } };

  return (
    <div className="min-h-svh bg-[#f4f4f5] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl print:hidden"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8"><div className="flex items-center gap-4"><Link to="/" data-testid="builder-back-button" className="grid h-9 w-9 place-items-center border border-slate-200 text-slate-500 transition-colors hover:border-orange-500 hover:text-orange-600"><ArrowLeft size={16} /></Link><div><p className="data-label text-orange-600">NASAKTION / Quote Generator</p><h1 data-testid="builder-heading" className="mt-1 font-heading text-xl font-bold tracking-tight">{id ? "Edit quotation" : "New quotation"}</h1></div></div><div className="flex items-center gap-2"><span data-testid="builder-draft-status" className="hidden text-xs text-slate-500 sm:block">{id ? "Saved record" : "Unsaved draft"}</span>{id && quoteQuery.isLoading ? <Button disabled size="sm" className="rounded-none bg-slate-900 text-white"><Download size={15} /> Loading quote…</Button> : <Button data-testid="builder-download-pdf-button" onClick={downloadPdf} disabled={isDownloading} title={canPrint ? "Download the customer release PDF" : "Review missing release data"} size="sm" className="rounded-none bg-slate-900 text-white hover:bg-slate-800"><Download size={15} /> {isDownloading ? "Generating…" : "Download PDF"}</Button>}<Button data-testid="builder-save-button" onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} size="sm" className="rounded-none bg-orange-600 px-4 text-white hover:bg-orange-700"><Save size={15} /> {saveMutation.isPending ? "Saving…" : "Save quote"}</Button></div></div></header>

      <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
        <div className="mb-7 flex flex-col justify-between gap-3 text-xs text-slate-500 print:hidden sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Link to="/" className="hover:text-orange-600">Workspace</Link><ChevronRight size={14} /><span className="font-semibold text-slate-700">Quote builder</span></div><div className="flex items-center gap-2"><button type="button" data-testid="expand-all-sections-button" onClick={() => setAllSections(true)} className="border border-slate-200 bg-white px-3 py-2 font-bold uppercase tracking-wider text-slate-600 hover:border-orange-400 hover:text-orange-700">Expand all</button><button type="button" data-testid="collapse-all-sections-button" onClick={() => setAllSections(false)} className="border border-slate-200 bg-white px-3 py-2 font-bold uppercase tracking-wider text-slate-600 hover:border-orange-400 hover:text-orange-700">Collapse all</button></div></div>
        <section data-testid="builder-mode-selector" className="mb-7 border border-slate-200 bg-white p-4 print:hidden"><div className="flex items-center justify-between"><p className="data-label text-orange-600">Quotation builder type</p><SectionToggleButton section="mode" open={sectionVisibility.mode} onToggle={() => toggleSection("mode")} /></div><div data-testid="mode-section-content" className={`${sectionVisibility.mode ? "grid" : "hidden"} mt-3 grid-cols-1 gap-3 md:grid-cols-2`}><button type="button" data-testid="builder-mode-margin-calculator-button" aria-pressed={form.builder_mode === "margin_calculator"} onClick={() => updateForm("builder_mode", "margin_calculator")} className={`flex items-start gap-3 border-2 p-4 text-left transition-[border-color,background-color] ${form.builder_mode === "margin_calculator" ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center ${form.builder_mode === "margin_calculator" ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-500"}`}><Calculator size={17} /></span><span><strong className="block font-heading text-sm">Quote with Margin Calculator</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Per-line sell rate or margin, cost, tax add-ons, and detailed item profitability.</span></span></button><button type="button" data-testid="builder-mode-quote-only-button" aria-pressed={form.builder_mode === "quote_only"} onClick={() => updateForm("builder_mode", "quote_only")} className={`flex items-start gap-3 border-2 p-4 text-left transition-[border-color,background-color] ${form.builder_mode === "quote_only" ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center ${form.builder_mode === "quote_only" ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-500"}`}><FileText size={17} /></span><span><strong className="block font-heading text-sm">Quote Only</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Simple sell prices per line with one overall cost for portfolio-level margin.</span></span></button></div></section>
        {!id && !form.company_name && !profileQuery.isLoading && <div data-testid="builder-company-profile-warning" className="mb-6 flex flex-col justify-between gap-3 border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 sm:flex-row sm:items-center print:hidden"><span>Set your legal company identity in Workspace before saving this quotation.</span><Link to="/" className="font-bold underline underline-offset-4">Open Workspace</Link></div>}
        {quoteQuery.isError && <div data-testid="builder-load-error" className="mb-5 border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 print:hidden">This saved quote could not be loaded. Start a new working copy from the dashboard.</div>}
        <div data-testid="quote-builder-editor" className="grid grid-cols-1 gap-7 print:hidden lg:grid-cols-12">
          <div className="space-y-7 lg:col-span-8">
            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:border-0 print:p-0">
              <div className="mb-6 flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">01 / Parties</p><h2 data-testid="parties-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Customer Detail</h2><p className="mt-2 text-sm text-slate-500">Please fill up all required information</p></div><div className="flex items-center gap-2"><div className="hidden h-10 w-10 place-items-center bg-orange-50 text-orange-600 sm:grid"><FileText size={18} /></div><SectionToggleButton section="parties" open={sectionVisibility.parties} onToggle={() => toggleSection("parties")} /></div></div>
              <div data-testid="parties-section-content" className={`${sectionVisibility.parties ? "grid" : "hidden"} grid-cols-1 gap-5 md:grid-cols-2`}><Field label="Customer contact *" testId="client-name"><TextInput testId="client-name-input" value={form.client_name} onChange={(value) => updateForm("client_name", value)} placeholder="e.g. Ahmed Al-Mansoori" /></Field><Field label="Customer company *" testId="client-company"><TextInput testId="client-company-input" value={form.client_company} onChange={(value) => updateForm("client_company", value)} placeholder="e.g. Gulf Energy Services" /></Field><Field label="Customer email" testId="client-email"><TextInput testId="client-email-input" value={form.client_email} onChange={(value) => updateForm("client_email", value)} placeholder="procurement@client.com" /></Field><Field label="Customer location" testId="client-location"><TextInput testId="client-location-input" value={form.client_location} onChange={(value) => updateForm("client_location", value)} placeholder="Doha, Qatar" /></Field><Field label="Customer ref. no." testId="customer-reference"><TextInput testId="customer-reference-input" value={form.customer_reference} onChange={(value) => updateForm("customer_reference", value)} placeholder="RFQ / inquiry reference" /></Field><Field label="Delivery point" testId="delivery-point"><TextInput testId="delivery-point-input" value={form.delivery_point} onChange={(value) => updateForm("delivery_point", value)} placeholder="Site, warehouse, or port" /></Field><Field label="Delivery lead time" testId="lead-time" className="md:col-span-2"><TextInput testId="lead-time-input" value={form.lead_time} onChange={(value) => updateForm("lead_time", value)} placeholder="e.g. 8–10 weeks" /></Field></div>
            </section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:hidden"><div className="flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">02 / Subject</p><h2 data-testid="subject-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Quotation subject</h2><p className="mt-2 text-sm text-slate-500">This subject is reused in the proposal introduction and Terms &amp; Conditions.</p></div><SectionToggleButton section="subject" open={sectionVisibility.subject} onToggle={() => toggleSection("subject")} /></div><div data-testid="subject-section-content" className={sectionVisibility.subject ? "mt-5" : "hidden"}><Field label="Subject" testId="quote-subject"><textarea data-testid="quote-subject-input" value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} rows={3} placeholder="e.g. Supply of API 6A wellhead equipment and associated field services" className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div></section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:border-0 print:p-0"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">03 / Scope &amp; rates</p><h2 data-testid="line-items-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Commercial line items</h2><p className="mt-2 text-sm text-slate-500">Daily charges multiply by duration. Lump sum charges use one unit.</p></div><SectionToggleButton section="commercial" open={sectionVisibility.commercial} onToggle={() => toggleSection("commercial")} /></div>
              <div data-testid="commercial-section-content" className={sectionVisibility.commercial ? "block" : "hidden"}>
              <div className="space-y-4">{form.line_items.map((item, index) => <LineItemEditor key={index} item={item} index={index} currency={form.currency} builderMode={form.builder_mode} commissionPerLine={totals.commissionPerLine} itemCount={form.line_items.length} isLast={index === form.line_items.length - 1} onUpdate={(key, value) => updateItem(index, key, value)} onRemove={() => removeItem(index)} onAddNext={addItem} />)}</div>
              <Button data-testid="add-line-item-button" onClick={addItem} variant="outline" className="mt-4 w-full rounded-none border-dashed border-slate-300 py-6 text-slate-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"><Plus size={16} /> Add item</Button>
              {form.builder_mode === "quote_only" && <div data-testid="overall-cost-card" className="mt-4 border border-orange-200 bg-orange-50/60 p-4"><Field label="Overall cost" testId="overall-cost"><input data-testid="overall-cost-input" type="number" min="0" step="0.01" value={form.overall_cost} onChange={(event) => updateForm("overall_cost", Number(event.target.value))} placeholder="Enter total internal cost for the complete quotation" className="w-full border border-orange-300 bg-white px-3 py-2.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field><p className="mt-2 text-xs leading-5 text-slate-600">Overall margin uses item selling prices before commission and tax. Hidden per-line costing remains saved if you switch back.</p></div>}
              </div>
            </section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:hidden"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">04 / Internal view</p><h2 data-testid="margin-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Margin &amp; P&amp;L snapshot</h2></div><SectionToggleButton section="internal" open={sectionVisibility.internal} onToggle={() => toggleSection("internal")} /></div><div data-testid="internal-section-content" className={sectionVisibility.internal ? "block" : "hidden"}><div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 md:grid-cols-4"><div className="bg-white p-4"><p className="data-label">{form.builder_mode === "quote_only" ? "Item revenue" : "Revenue"}</p><p data-testid="pnl-revenue" className="mt-3 font-mono text-lg font-bold">{formatMoney(form.builder_mode === "quote_only" ? totals.baseSubtotal : totals.subtotal, form.currency)}</p></div><div className="bg-white p-4"><p className="data-label">{form.builder_mode === "quote_only" ? "Overall cost" : "Cost + add-ons"}</p><p data-testid="pnl-cost" className="mt-3 font-mono text-lg font-bold">{formatMoney(totals.cost, form.currency)}</p></div><div className="bg-orange-50 p-4"><p className="data-label text-orange-700">Gross profit</p><p data-testid="pnl-profit" className="mt-3 font-mono text-lg font-bold text-orange-700">{formatMoney(totals.profit, form.currency)}</p></div><div className="bg-orange-50 p-4"><p className="data-label text-orange-700">Margin</p><p data-testid="pnl-margin" className="mt-3 font-mono text-lg font-bold text-orange-700">{totals.margin.toFixed(1)}%</p></div></div><p data-testid="pnl-guidance" className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Calculator size={14} className="text-orange-600" /> {form.builder_mode === "quote_only" ? "Overall margin excludes quote commission and customer tax. Switching modes preserves hidden per-line cost data." : "Cost add-ons increase the internal cost base; commission is distributed into client-facing line prices."}</p></div></section>

            <section data-testid="terms-editor-section" className="border border-slate-200 bg-white p-6 lg:p-7 print:hidden"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">05 / Terms &amp; Conditions</p><h2 className="mt-2 font-heading text-2xl font-bold tracking-tight">Quotation T&amp;C editor</h2><p className="mt-2 text-sm leading-6 text-slate-500">Edit, reorder, remove, or add clauses for this quotation only. Supported live tokens: <span className="font-mono text-xs text-orange-700">{"{{currency}} {{payment_terms}} {{lead_time}} {{subject}}"}</span></p></div><SectionToggleButton section="terms" open={sectionVisibility.terms} onToggle={() => toggleSection("terms")} /></div><div data-testid="terms-section-content" className={sectionVisibility.terms ? "block" : "hidden"}><div className="space-y-4">{form.terms_conditions.map((term, index) => <div data-testid={`terms-editor-item-${index}`} key={term.id} className="border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center justify-between gap-3"><span className="grid h-6 w-6 place-items-center bg-slate-900 font-mono text-xs text-white">{String(index + 1).padStart(2, "0")}</span><div className="flex items-center gap-1"><button type="button" data-testid={`terms-move-up-${index}`} disabled={index === 0} onClick={() => moveTerm(index, -1)} className="grid h-7 w-7 place-items-center border border-slate-200 bg-white text-slate-500 hover:border-orange-400 hover:text-orange-700 disabled:opacity-30" aria-label={`Move ${term.title} up`}>↑</button><button type="button" data-testid={`terms-move-down-${index}`} disabled={index === form.terms_conditions.length - 1} onClick={() => moveTerm(index, 1)} className="grid h-7 w-7 place-items-center border border-slate-200 bg-white text-slate-500 hover:border-orange-400 hover:text-orange-700 disabled:opacity-30" aria-label={`Move ${term.title} down`}>↓</button><button type="button" data-testid={`terms-delete-${index}`} onClick={() => removeTerm(index)} className="grid h-7 w-7 place-items-center text-slate-400 hover:text-red-600" aria-label={`Delete ${term.title}`}><Trash2 size={14} /></button></div></div><div className="space-y-3"><Field label="Clause title" testId={`terms-title-${index}`}><TextInput testId={`terms-title-input-${index}`} value={term.title} onChange={(value) => updateTerm(index, "title", value)} /></Field><Field label="Clause content" testId={`terms-content-${index}`}><textarea data-testid={`terms-content-input-${index}`} value={term.content} onChange={(event) => updateTerm(index, "content", event.target.value)} rows={3} className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div></div>)}</div><Button data-testid="terms-add-clause-button" onClick={addTerm} variant="outline" className="mt-4 w-full rounded-none border-dashed border-slate-300 py-5 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"><Plus size={15} /> Add T&amp;C clause</Button></div></section>
          </div>

          <aside className="space-y-7 lg:col-span-4">
            <section className="border border-slate-200 bg-white p-6 print:hidden"><div className="flex items-start justify-between gap-3"><div><p className="data-label text-orange-600">Global settings</p><h2 data-testid="settings-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Release controls</h2></div><SectionToggleButton section="release" open={sectionVisibility.release} onToggle={() => toggleSection("release")} /></div><div data-testid="release-section-content" className={`${sectionVisibility.release ? "block" : "hidden"} mt-6 space-y-5`}><Field label="Quotation title" testId="quote-title"><TextInput testId="quote-title-input" value={form.quote_title} onChange={(value) => updateForm("quote_title", value)} /></Field><Field label="Currency" testId="currency"><select data-testid="currency-select" value={form.currency} onChange={(event) => { const currency = event.target.value; setForm((current) => ({ ...current, currency, usd_exchange_rate: currency === "USD" ? 1 : null })); }} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></Field>{form.currency !== "USD" && <div className="border border-orange-200 bg-orange-50/60 p-4"><Field label={`USD rate · 1 ${form.currency} equals`} testId="usd-exchange-rate"><input data-testid="usd-exchange-rate-input" type="number" min="0.00000001" step="any" value={form.usd_exchange_rate ?? ""} onChange={(event) => updateForm("usd_exchange_rate", event.target.value ? Number(event.target.value) : null)} placeholder="Enter USD value" className="w-full border border-orange-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field><p className="mt-2 text-xs leading-5 text-slate-600">Saved with this quotation so historical USD totals never change.</p></div>}<div className="border border-orange-200 bg-orange-50/60 p-4"><Field label="Quote commission" testId="commission"><input data-testid="commission-input" type="number" min="0" step="0.01" value={form.commission_amount} onChange={(event) => updateForm("commission_amount", Number(event.target.value))} className="w-full border border-orange-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field><p data-testid="commission-allocation-summary" className="mt-3 text-xs leading-5 text-slate-600">{formatMoney(form.commission_amount, form.currency)} ÷ {form.line_items.length} line{form.line_items.length === 1 ? "" : "s"} = <strong className="font-mono text-orange-700">{formatMoney(totals.commissionPerLine, form.currency)}</strong> added to each client price.</p></div><div className="border border-slate-200 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Apply sales tax</p><p className="mt-1 text-xs text-slate-500">Optional, shown separately</p></div><button type="button" data-testid="tax-toggle-button" aria-pressed={form.tax_enabled} onClick={() => updateForm("tax_enabled", !form.tax_enabled)} className={`relative h-6 w-11 transition-colors ${form.tax_enabled ? "bg-orange-600" : "bg-slate-300"}`}><span className={`absolute top-1 h-4 w-4 bg-white transition-transform ${form.tax_enabled ? "left-6" : "left-1"}`} /></button></div>{form.tax_enabled && <div className="mt-4"><label className="data-label mb-2 block">Tax rate (%)</label><input data-testid="tax-rate-input" type="number" min="0" max="100" step="0.1" value={form.tax_rate} onChange={(event) => updateForm("tax_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></div>}</div><Field label="Payment terms" testId="payment-terms"><TextInput testId="payment-terms-input" value={form.payment_terms} onChange={(value) => updateForm("payment_terms", value)} /></Field><Field label="Validity (days)" testId="valid-days"><input data-testid="valid-days-input" type="number" min="1" value={form.valid_days} onChange={(event) => updateForm("valid_days", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div></section>

            <section className="border border-slate-200 bg-white p-6 print:hidden">
              <div className="flex items-start justify-between gap-3"><div><p className="data-label text-orange-600">Document identity</p><h2 data-testid="company-section-heading" className="mt-2 font-heading text-xl font-bold tracking-tight">Quote-specific details</h2><p className="mt-2 text-sm text-slate-500">Company branding is managed once from Workspace.</p></div><SectionToggleButton section="identity" open={sectionVisibility.identity} onToggle={() => toggleSection("identity")} /></div>
              <div data-testid="identity-section-content" className={`${sectionVisibility.identity ? "block" : "hidden"} mt-5 space-y-4`}>
                <div className="grid grid-cols-2 gap-3"><Field label="Quotation number" testId="quote-number"><TextInput testId="quote-number-input" value={form.quote_number} onChange={(value) => updateForm("quote_number", value)} placeholder="Auto-generated if blank" /></Field><Field label="Release date" testId="release-date"><input data-testid="release-date-input" type="date" value={form.release_date} onChange={(event) => updateForm("release_date", event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div>
                <div className="grid grid-cols-2 gap-3"><Field label="Prepared by *" testId="prepared-by-name"><TextInput testId="prepared-by-name-input" value={form.prepared_by_name} onChange={(value) => updateForm("prepared_by_name", value)} placeholder="Full name" /></Field><Field label="Designation *" testId="prepared-by-title"><TextInput testId="prepared-by-title-input" value={form.prepared_by_title} onChange={(value) => updateForm("prepared_by_title", value)} placeholder="Commercial Manager" /></Field></div>
                <div className="grid grid-cols-2 gap-3"><Field label="Preparer email *" testId="prepared-by-email"><TextInput testId="prepared-by-email-input" value={form.prepared_by_email} onChange={(value) => updateForm("prepared_by_email", value)} placeholder="name@company.com" /></Field><Field label="Preparer phone *" testId="prepared-by-phone"><TextInput testId="prepared-by-phone-input" value={form.prepared_by_phone} onChange={(value) => updateForm("prepared_by_phone", value)} placeholder="+62 ..." /></Field></div>
                <Field label="Terms / exclusions" testId="quote-notes"><textarea data-testid="quote-notes-input" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} rows={3} className="w-full resize-none border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
                <Field label="Release note" testId="release-notes"><textarea data-testid="release-notes-input" value={form.release_notes} onChange={(event) => updateForm("release_notes", event.target.value)} rows={3} placeholder="Add a message, clarification, or release note for the customer…" className="w-full resize-none border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
              </div>
            </section>

            <section data-testid="quote-total-card" className="border border-slate-900 bg-slate-950 p-6 text-white print:hidden"><div className="flex items-center justify-between"><p className="data-label text-slate-400">Client-facing total</p><span className="grid h-8 w-8 place-items-center bg-orange-600"><CircleIcon /></span></div><p data-testid="quote-grand-total" className="mt-5 font-mono text-3xl font-bold tracking-tight">{formatMoney(totals.total, form.currency)}</p><div className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-xs"><div className="flex justify-between text-slate-400"><span>Subtotal</span><span data-testid="quote-subtotal" className="font-mono text-slate-200">{formatMoney(totals.subtotal, form.currency)}</span></div><div className="flex justify-between text-slate-400"><span>Tax {form.tax_enabled ? `(${form.tax_rate}%)` : "(not applied)"}</span><span data-testid="quote-tax" className="font-mono text-slate-200">{formatMoney(totals.tax, form.currency)}</span></div><div className="flex justify-between text-slate-400"><span>Gross profit</span><span data-testid="quote-profit" className="font-mono font-semibold text-orange-300">{formatMoney(totals.profit, form.currency)}</span></div></div></section>
          </aside>
        </div>

        <section data-testid="quote-preview-controls" className="mt-8 flex items-center justify-between border border-slate-200 bg-white p-4 print:hidden"><div><p className="data-label text-orange-600">Quote preview</p><p className="mt-1 text-sm text-slate-500">Review the customer-facing A4 release pages while you work.</p></div><Button data-testid="quote-preview-toggle-button" aria-expanded={previewVisible} onClick={() => setPreviewVisible((visible) => !visible)} variant="outline" className="rounded-none border-slate-300">{previewVisible ? "Hide Quote Preview" : "Show Quote Preview"}</Button></section>

        {previewVisible ? <>
        <IntroductionDocumentPage form={form} reference={documentReference} releaseDate={documentReleaseDate} pageCount={documentPageCount} />
        {commercialPages.map((entries, pageIndex) => <CommercialDocumentPage key={pageIndex} form={form} entries={entries} pageIndex={pageIndex} commercialPageCount={commercialPages.length} totalPageCount={documentPageCount} reference={documentReference} releaseDate={documentReleaseDate} totals={totals} />)}

        {termsPages.map((terms, termsPageIndex) => <section data-testid={termsPageIndex === 0 ? "terms-page" : `terms-page-${termsPageIndex + 1}`} data-pdf-page="true" key={termsPageIndex} className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <DocumentHeader form={form} reference={documentReference} releaseDate={documentReleaseDate} prefix={`terms-header-${termsPageIndex + 1}`} />
          <div className="mt-6"><p className="data-label text-orange-600">{termsPageIndex === 0 ? "Quotation appendix" : "Quotation appendix · Continued"}</p><h2 className="mt-2 font-heading text-2xl font-bold tracking-tight">Quotation Terms and Conditions{termsPageIndex === 0 ? "" : ` · ${termsPageIndex + 1}`}</h2></div>
          <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-xs">{terms.map((term) => <div data-testid={`terms-${term.id}`} key={term.id} className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="break-words data-label text-slate-500">{term.title}</p><p className="whitespace-pre-line break-words leading-5 text-slate-700">{resolveTermContent(term.content, form)}</p></div>)}</div>
          {termsPageIndex === termsPages.length - 1 && <p className="mt-6 text-[10px] leading-4 text-slate-400">These Terms and Conditions form an integral part of quotation {documentReference}.</p>}
          <DocumentPageFooter pageNumber={commercialPages.length + 2 + termsPageIndex} pageCount={documentPageCount} />
        </section>)}

        <section data-testid="acceptance-page" data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <DocumentHeader form={form} reference={documentReference} releaseDate={documentReleaseDate} prefix="acceptance-header" />
          <div className="mt-6"><p className="data-label text-orange-600">Formal acceptance</p><h2 className="mt-2 font-heading text-2xl font-bold tracking-tight">Customer Acceptance</h2></div>
          <p data-testid="acceptance-wording" className="mt-6 text-sm leading-6 text-slate-700">I hereby acknowledge and agree to the Terms and Conditions contained herein and certify that I am authorized to execute this Quotation. Accordingly, we consider this the only agreement between the Company and ourselves for the specific items outlined in this Quotation.</p>
          <div className="mt-6 border border-slate-200 p-4"><p className="data-label text-slate-500">For and on Behalf of</p><p data-testid="acceptance-customer-name" className="mt-2 font-heading text-xl font-bold text-slate-900">{form.client_company || "Customer Name"}</p></div>
          <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-8 text-xs"><div><p className="data-label text-slate-400">Name</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Designation</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Date</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Signature</p><div className="mt-7 border-b border-slate-500" /></div></div>
          <div className="mt-10 border-t border-slate-200 pt-4 text-[10px] text-slate-400"><p>Quotation reference: <span className="font-mono text-slate-600">{documentReference}</span></p><p className="mt-1">Release date: {documentReleaseDate}</p></div>
          <DocumentPageFooter pageNumber={documentPageCount} pageCount={documentPageCount} />
        </section>
        </> : <div data-testid="quote-preview-hidden-state" className="mx-auto mt-8 max-w-[800px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 print:hidden">Quote preview is hidden. Use “Show Quote Preview” above to review the A4 release pages.</div>}

        <Dialog open={missingFieldsOpen} onOpenChange={setMissingFieldsOpen}>
          <DialogContent data-testid="missing-release-data-dialog" className="max-w-lg rounded-none">
            <DialogHeader><DialogTitle>Please complete the required data prior to release</DialogTitle><DialogDescription>The following information is still missing from this quotation:</DialogDescription></DialogHeader>
            <ul data-testid="missing-release-data-list" className="max-h-[45vh] space-y-2 overflow-y-auto border-y border-slate-200 py-4">{missingReleaseFields.map((field) => <li data-testid={`missing-release-field-${field.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={field} className="flex items-start gap-3 text-sm text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-orange-600" />{field}</li>)}</ul>
            <DialogFooter><Button data-testid="missing-release-dialog-close-button" onClick={() => setMissingFieldsOpen(false)} className="rounded-none bg-slate-900 text-white hover:bg-slate-800">Return to quotation</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function CircleIcon() { return <Check size={15} />; }