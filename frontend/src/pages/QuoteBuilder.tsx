import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Check, ChevronRight, Download, FileText, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { generateQuotePdf } from "@/lib/generateQuotePdf";
import { CURRENCIES, CATEGORY_LABELS, formatMoney, type ChargeType, type CompanyProfile, type LineCategory, type PriceMethod, type Quote, type QuoteLineItemInput, type QuotePayload, type SalesPricing } from "@/lib/types";

const emptyItem = (): QuoteLineItemInput => ({ description: "", description_details: "", category: "service", charge_type: "daily", sales_pricing: "unit", uom: "day", quantity: 1, duration_days: 1, price_method: "sell_rate", sell_rate: 0, target_margin_percent: 0, cost_rate: 0, cost_addon_percent: 0 });
const initialForm: QuotePayload = { quote_number: "", release_date: "", client_name: "", client_company: "", client_email: "", client_location: "", customer_reference: "", delivery_point: "", company_name: "", company_address: "", company_email: "", company_phone: "", company_logo: "", prepared_by_name: "", prepared_by_title: "", quote_title: "Commercial Quotation", subject: "", currency: "USD", usd_exchange_rate: 1, tax_enabled: false, tax_rate: 5, payment_terms: "30 days from invoice", lead_time: "To be confirmed", valid_days: 30, notes: "This quotation is subject to final scope confirmation and availability.", release_notes: "", commission_amount: 0, line_items: [emptyItem()] };

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

interface LineItemEditorProps {
  item: QuoteLineItemInput;
  index: number;
  currency: string;
  commissionPerLine: number;
  itemCount: number;
  onUpdate: (key: keyof QuoteLineItemInput, value: string | number) => void;
  onRemove: () => void;
}

function LineItemEditor({ item, index, currency, commissionPerLine, itemCount, onUpdate, onRemove }: LineItemEditorProps) {
  const baseCost = lineValue(item, item.cost_rate);
  const costAddon = baseCost * item.cost_addon_percent / 100;
  const quotedLineTotal = quotedBaseValue(item) + commissionPerLine;

  return (
    <div data-testid={`line-item-card-${index}`} className="border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-orange-200">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center bg-slate-900 font-mono text-xs text-white">{String(index + 1).padStart(2, "0")}</span><span data-testid={`line-item-label-${index}`} className="data-label text-slate-500">Pricing line</span></div>
        <button type="button" data-testid={`remove-line-item-button-${index}`} onClick={onRemove} disabled={itemCount === 1} className="p-1 text-slate-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Remove line item"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <Field label="Description *" testId={`line-item-description-${index}`} className="md:col-span-5"><TextInput testId={`line-item-description-input-${index}`} value={item.description} onChange={(value) => onUpdate("description", value)} placeholder="e.g. Wellhead pressure control package" /></Field>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <Field label="Sell rate / margin" testId={`line-item-price-method-${index}`} className="md:col-span-3"><div className="flex border border-slate-300 bg-slate-50 p-1">{(["sell_rate", "margin"] as PriceMethod[]).map((method) => <button type="button" data-testid={`line-item-price-method-${index}-${method}-button`} key={method} onClick={() => onUpdate("price_method", method)} className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${item.price_method === method ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-orange-50"}`}>{method === "sell_rate" ? "Sell rate" : "Margin %"}</button>)}</div></Field>
          {item.price_method === "sell_rate" ? <Field label="Sell rate" testId={`line-item-sell-rate-${index}`} className="md:col-span-3"><input data-testid={`line-item-sell-rate-input-${index}`} type="number" min="0" step="0.01" value={item.sell_rate} onChange={(event) => onUpdate("sell_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field> : <Field label="Target margin %" testId={`line-item-margin-${index}`} className="md:col-span-3"><input data-testid={`line-item-margin-input-${index}`} type="number" min="0" max="99.99" step="0.1" value={item.target_margin_percent} onChange={(event) => onUpdate("target_margin_percent", Number(event.target.value))} className="w-full border border-orange-300 bg-orange-50 px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>}
          <Field label="Cost" testId={`line-item-cost-rate-${index}`} className="md:col-span-3"><input data-testid={`line-item-cost-rate-input-${index}`} type="number" min="0" step="0.01" value={item.cost_rate} onChange={(event) => onUpdate("cost_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
          <Field label="Cost added value %" testId={`line-item-cost-addon-${index}`} className="md:col-span-3"><input data-testid={`line-item-cost-addon-input-${index}`} type="number" min="0" step="0.1" value={item.cost_addon_percent} onChange={(event) => onUpdate("cost_addon_percent", Number(event.target.value))} placeholder="Gov tax / landing" className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs sm:grid-cols-4"><div><span className="block text-slate-500">Base cost</span><span data-testid={`line-item-base-cost-${index}`} className="mt-1 block font-mono font-semibold">{formatMoney(baseCost, currency)}</span></div><div><span className="block text-slate-500">Cost add-on</span><span data-testid={`line-item-cost-addon-amount-${index}`} className="mt-1 block font-mono font-semibold">{formatMoney(costAddon, currency)}</span></div><div><span className="block text-slate-500">Commission share</span><span data-testid={`line-item-commission-${index}`} className="mt-1 block font-mono font-semibold text-orange-700">+ {formatMoney(commissionPerLine, currency)}</span></div><div className="text-right"><span className="block text-slate-500">Quoted line total</span><span data-testid={`line-item-total-${index}`} className="mt-1 block font-mono font-bold text-slate-900">{formatMoney(quotedLineTotal, currency)}</span></div></div>
    </div>
  );
}

function QuotationLineRow({ item, index, currency, commissionPerLine }: { item: QuoteLineItemInput; index: number; currency: string; commissionPerLine: number }) {
  const lineTotal = quotedBaseValue(item) + commissionPerLine;
  const billedUnits = item.category !== "sales" && item.charge_type === "daily" ? item.quantity * item.duration_days : item.quantity;
  const itemPrice = billedUnits ? lineTotal / billedUnits : lineTotal;
  const basis = item.category === "sales" ? (item.sales_pricing === "unit" ? "Per unit" : "Line total") : (item.charge_type === "daily" ? "Daily" : "Lump sum");

  return (
    <tr data-testid={`preview-line-item-${index}`} className="border-b border-slate-100 align-top">
      <td className="py-2.5 pr-5"><span data-testid={`preview-line-description-${index}`} className="font-semibold">{item.description || "Scope description"}</span>{item.description_details && <span data-testid={`preview-line-details-${index}`} className="mt-1 block whitespace-pre-line text-[10px] leading-4 text-slate-500">{item.description_details}</span>}</td>
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
  if (totalUnits <= 5) return [remaining];
  const pages: PageLineItem[][] = [takePageItems(remaining, Math.min(8, Math.max(1, totalUnits - 5)))];
  while (remaining.reduce((sum, entry) => sum + estimatedItemUnits(entry.item), 0) > 7) {
    const remainingUnits = remaining.reduce((sum, entry) => sum + estimatedItemUnits(entry.item), 0);
    pages.push(takePageItems(remaining, Math.min(14, Math.max(1, remainingUnits - 7))));
  }
  if (remaining.length) pages.push([...remaining]);
  return pages;
}

function DocumentPageFooter({ pageNumber, pageCount }: { pageNumber: number; pageCount: number }) {
  return <div className="document-page-footer absolute inset-x-12 bottom-6 border-t border-slate-200 pt-2 text-center font-mono text-[9px] tracking-[0.12em] text-slate-400">CONFIDENTIAL · Page {pageNumber} of {pageCount}</div>;
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
    <section data-testid={firstPage ? "print-preview" : `commercial-page-${pageIndex + 1}`} data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      <DocumentHeader form={form} reference={reference} releaseDate={releaseDate} prefix={firstPage ? "preview" : `commercial-header-${pageIndex + 1}`} />
      {firstPage ? <>
        <div className="grid grid-cols-2 gap-8 border-b border-slate-200 py-4 text-xs"><div className="min-w-0"><p data-testid="preview-supplier-name" className="font-semibold">{form.company_name}</p>{(form.company_address || form.company_email || form.company_phone) && <p className="mt-1 whitespace-pre-line break-words text-[10px] leading-4 text-slate-500">{form.company_address}{form.company_email && <><br />{form.company_email}</>}{form.company_phone && <><br />{form.company_phone}</>}</p>}</div><div className="min-w-0"><p className="data-label">Customer</p><p data-testid="preview-client-name" className="mt-1.5 break-words font-semibold">{form.client_company}</p><p className="mt-1 break-words text-[10px] leading-4 text-slate-500">Attn: {form.client_name}{form.client_location && <><br />{form.client_location}</>}{form.client_email && <><br />{form.client_email}</>}{form.customer_reference && <><br />Ref: {form.customer_reference}</>}{form.delivery_point && <><br />Delivery point: {form.delivery_point}</>}</p></div></div>
        <p data-testid="preview-introduction" className="mt-4 text-xs leading-5 text-slate-600"><strong className="text-slate-800">{form.company_name}</strong> is pleased to submit this quotation proposal regarding “{form.subject}” for your consideration and review. This proposal has been prepared based on the scope and requirements discussed and outlines our proposed solution, deliverables, and commercial terms for your evaluation.</p>
      </> : <p className="mt-4 data-label text-orange-600">Commercial schedule · Continued</p>}
      <table className="mt-4 w-full table-fixed text-left text-xs"><thead><tr className="border-b border-slate-900"><th className="w-[32%] pb-2 data-label">Description</th><th className="w-[14%] pb-2 data-label">Type / basis</th><th className="w-[9%] pb-2 text-right data-label">Qty</th><th className="w-[11%] pb-2 text-right data-label">UoM</th><th className="w-[17%] pb-2 text-right data-label">Item price</th><th className="w-[17%] pb-2 text-right data-label">Line amount</th></tr></thead><tbody>{entries.map(({ item, originalIndex }) => <QuotationLineRow key={originalIndex} item={item} index={originalIndex} currency={form.currency} commissionPerLine={totals.commissionPerLine} />)}</tbody></table>
      {lastPage && <>
        <div className="ml-auto mt-4 max-w-[260px] space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{formatMoney(totals.subtotal, form.currency)}</span></div><div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="font-mono">{formatMoney(totals.tax, form.currency)}</span></div><div className="flex justify-between border-t-2 border-slate-900 pt-2 text-sm font-bold"><span>TOTAL</span><span data-testid="preview-total" className="font-mono text-orange-700">{formatMoney(totals.total, form.currency)}</span></div></div>
        <div className="mt-6 grid grid-cols-2 gap-8 border-t border-slate-200 pt-4 text-[10px] text-slate-500"><p><span className="font-semibold text-slate-700">Payment:</span> {form.payment_terms}</p><p><span className="font-semibold text-slate-700">Delivery:</span> {form.lead_time}</p></div>
        {form.notes && <p data-testid="preview-notes" className="mt-3 whitespace-pre-line text-[10px] leading-4 text-slate-400">{form.notes}</p>}
        {form.release_notes && <div data-testid="preview-release-notes" className="mt-4 border-l-2 border-orange-500 bg-orange-50 px-3 py-2"><p className="data-label text-orange-700">Release note</p><p className="mt-1.5 whitespace-pre-line text-[10px] leading-4 text-slate-600">{form.release_notes}</p></div>}
        <div data-testid="preview-signature-block" className="mt-5 w-[44%] border border-slate-300 p-3 text-xs"><p className="font-semibold text-slate-700">Best Regards,</p><p className="mt-1 font-heading text-sm font-bold">{form.company_name}</p><div className="h-9" aria-label="Signature space" /><p data-testid="preview-prepared-by-name" className="border-t border-slate-400 pt-2 font-semibold text-slate-900">{form.prepared_by_name}</p><p data-testid="preview-prepared-by-title" className="mt-1 text-[9px] text-slate-500">{form.prepared_by_title}</p></div>
      </>}
      <DocumentPageFooter pageNumber={pageIndex + 1} pageCount={totalPageCount} />
    </section>
  );
}

export default function QuoteBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuotePayload>(initialForm);
  const [isDownloading, setIsDownloading] = useState(false);
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
    const baseSubtotal = form.line_items.reduce((sum, item) => sum + quotedBaseValue(item), 0);
    const cost = form.line_items.reduce((sum, item) => sum + loadedLineCost(item), 0);
    const commissionPerLine = form.line_items.length ? form.commission_amount / form.line_items.length : 0;
    const subtotal = baseSubtotal + form.commission_amount;
    const tax = form.tax_enabled ? subtotal * form.tax_rate / 100 : 0;
    const profit = subtotal - cost;
    return { subtotal, baseSubtotal, cost, tax, total: subtotal + tax, profit, margin: subtotal ? profit / subtotal * 100 : 0, commissionPerLine };
  }, [form]);
  const commercialPages = useMemo(() => paginateLineItems(form.line_items), [form.line_items]);
  const documentPageCount = commercialPages.length + 2;
  const documentReference = form.quote_number || quoteQuery.data?.quote_number || "DRAFT / PREVIEW";
  const documentReleaseDate = form.release_date || quoteQuery.data?.release_date || quoteQuery.data?.issue_date || "Select date";

  const updateForm = <K extends keyof QuotePayload>(key: K, value: QuotePayload[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateItem = (index: number, key: keyof QuoteLineItemInput, value: string | number) => setForm((current) => ({ ...current, line_items: current.line_items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const addItem = () => setForm((current) => ({ ...current, line_items: [...current.line_items, emptyItem()] }));
  const removeItem = (index: number) => setForm((current) => ({ ...current, line_items: current.line_items.filter((_, itemIndex) => itemIndex !== index) }));
  const saveMutation = useMutation({
    mutationFn: () => id ? apiPut<Quote>(`/quotes/${id}`, form) : apiPost<Quote>("/quotes", form),
    onSuccess: (saved) => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); queryClient.setQueryData(["quote", saved.id], saved); toast.success("Quote saved to your release history"); navigate(`/quotes/${saved.id}`, { replace: true }); },
    onError: () => toast.error("Unable to save this quote. Check the required fields and try again."),
  });

  const canSave = form.client_name.trim() && form.client_company.trim() && form.company_name.trim() && (form.currency === "USD" || (form.usd_exchange_rate ?? 0) > 0) && form.line_items.length > 0 && form.line_items.every((item) => item.description.trim() && item.uom.trim());
  const canPrint = Boolean(canSave && form.subject.trim() && form.prepared_by_name.trim() && form.prepared_by_title.trim() && documentReference !== "DRAFT / PREVIEW" && documentReleaseDate !== "Select date");
  const printQuote = () => { if (!canPrint) { toast.error("Save the quotation and complete its subject, release date, preparer, and title before PDF release."); return; } const originalTitle = document.title; document.title = ""; window.print(); document.title = originalTitle; };
  const downloadPdf = async () => { if (!canPrint) { toast.error("Save the quotation and complete its release details before downloading PDF."); return; } setIsDownloading(true); try { const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-page='true']")); const filename = await generateQuotePdf({ pages, quoteNumber: documentReference, subject: form.subject, companyName: form.company_name }); toast.success(`Downloaded ${filename}`); } catch { toast.error("Unable to generate the PDF. Please try Print / PDF instead."); } finally { setIsDownloading(false); } };

  return (
    <div className="min-h-svh bg-[#f4f4f5] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl print:hidden"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8"><div className="flex items-center gap-4"><Link to="/" data-testid="builder-back-button" className="grid h-9 w-9 place-items-center border border-slate-200 text-slate-500 transition-colors hover:border-orange-500 hover:text-orange-600"><ArrowLeft size={16} /></Link><div><p className="data-label text-orange-600">NASAKTION / Quote Generator</p><h1 data-testid="builder-heading" className="mt-1 font-heading text-xl font-bold tracking-tight">{id ? "Edit quotation" : "New quotation"}</h1></div></div><div className="flex items-center gap-2"><span data-testid="builder-draft-status" className="hidden text-xs text-slate-500 sm:block">{id ? "Saved record" : "Unsaved draft"}</span>{id && quoteQuery.isLoading ? <Button disabled size="sm" className="rounded-none bg-slate-900 text-white"><Download size={15} /> Loading quote…</Button> : <Button data-testid="builder-download-pdf-button" onClick={downloadPdf} disabled={!canPrint || isDownloading} title={canPrint ? "Download the customer release PDF" : "Save and complete release details first"} size="sm" className="rounded-none bg-slate-900 text-white hover:bg-slate-800"><Download size={15} /> {isDownloading ? "Generating…" : "Download PDF"}</Button>}<Button data-testid="builder-preview-button" onClick={printQuote} disabled={!canPrint} title={canPrint ? "Print or save the customer release as PDF" : "Save and complete release details first"} variant="outline" size="sm" className="rounded-none border-slate-300"><Printer size={15} /> Print / PDF</Button><Button data-testid="builder-save-button" onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} size="sm" className="rounded-none bg-orange-600 px-4 text-white hover:bg-orange-700"><Save size={15} /> {saveMutation.isPending ? "Saving…" : "Save quote"}</Button></div></div></header>

      <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
        <div className="mb-7 flex items-center gap-2 text-xs text-slate-500 print:hidden"><Link to="/" className="hover:text-orange-600">Workspace</Link><ChevronRight size={14} /><span className="font-semibold text-slate-700">Quote builder</span></div>
        {!id && !form.company_name && !profileQuery.isLoading && <div data-testid="builder-company-profile-warning" className="mb-6 flex flex-col justify-between gap-3 border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 sm:flex-row sm:items-center print:hidden"><span>Set your legal company identity in Workspace before saving this quotation.</span><Link to="/" className="font-bold underline underline-offset-4">Open Workspace</Link></div>}
        {quoteQuery.isError && <div data-testid="builder-load-error" className="mb-5 border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 print:hidden">This saved quote could not be loaded. Start a new working copy from the dashboard.</div>}
        <div data-testid="quote-builder-editor" className="grid grid-cols-1 gap-7 print:hidden lg:grid-cols-12">
          <div className="space-y-7 lg:col-span-8">
            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:border-0 print:p-0">
              <div className="mb-6 flex items-start justify-between gap-4"><div><p className="data-label text-orange-600">01 / Parties</p><h2 data-testid="parties-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Who is this release for?</h2><p className="mt-2 text-sm text-slate-500">Use placeholders now, then tailor your company and client profile before printing.</p></div><div className="hidden h-10 w-10 place-items-center bg-orange-50 text-orange-600 sm:grid"><FileText size={18} /></div></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><Field label="Customer contact *" testId="client-name"><TextInput testId="client-name-input" value={form.client_name} onChange={(value) => updateForm("client_name", value)} placeholder="e.g. Ahmed Al-Mansoori" /></Field><Field label="Customer company *" testId="client-company"><TextInput testId="client-company-input" value={form.client_company} onChange={(value) => updateForm("client_company", value)} placeholder="e.g. Gulf Energy Services" /></Field><Field label="Customer email" testId="client-email"><TextInput testId="client-email-input" value={form.client_email} onChange={(value) => updateForm("client_email", value)} placeholder="procurement@client.com" /></Field><Field label="Customer location" testId="client-location"><TextInput testId="client-location-input" value={form.client_location} onChange={(value) => updateForm("client_location", value)} placeholder="Doha, Qatar" /></Field><Field label="Customer ref. no." testId="customer-reference"><TextInput testId="customer-reference-input" value={form.customer_reference} onChange={(value) => updateForm("customer_reference", value)} placeholder="RFQ / inquiry reference" /></Field><Field label="Delivery point" testId="delivery-point"><TextInput testId="delivery-point-input" value={form.delivery_point} onChange={(value) => updateForm("delivery_point", value)} placeholder="Site, warehouse, or port" /></Field><Field label="Delivery lead time" testId="lead-time" className="md:col-span-2"><TextInput testId="lead-time-input" value={form.lead_time} onChange={(value) => updateForm("lead_time", value)} placeholder="e.g. 8–10 weeks" /></Field></div>
            </section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:hidden"><p className="data-label text-orange-600">02 / Subject</p><h2 data-testid="subject-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Quotation subject</h2><p className="mt-2 text-sm text-slate-500">This subject is reused in the proposal introduction and Terms &amp; Conditions.</p><div className="mt-5"><Field label="Subject" testId="quote-subject"><textarea data-testid="quote-subject-input" value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} rows={3} placeholder="e.g. Supply of API 6A wellhead equipment and associated field services" className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div></section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:border-0 print:p-0"><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="data-label text-orange-600">03 / Scope &amp; rates</p><h2 data-testid="line-items-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Commercial line items</h2><p className="mt-2 text-sm text-slate-500">Daily charges multiply by duration. Lump sum charges use one unit.</p></div><Button data-testid="add-line-item-button" onClick={addItem} variant="outline" size="sm" className="w-fit rounded-none border-slate-300"><Plus size={15} /> Add line item</Button></div>
              <div className="space-y-4">{form.line_items.map((item, index) => <LineItemEditor key={index} item={item} index={index} currency={form.currency} commissionPerLine={totals.commissionPerLine} itemCount={form.line_items.length} onUpdate={(key, value) => updateItem(index, key, value)} onRemove={() => removeItem(index)} />)}</div>
            </section>

            <section className="border border-slate-200 bg-white p-6 lg:p-7 print:hidden"><div className="mb-5"><p className="data-label text-orange-600">04 / Internal view</p><h2 data-testid="margin-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Margin &amp; P&amp;L snapshot</h2></div><div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 md:grid-cols-4"><div className="bg-white p-4"><p className="data-label">Revenue</p><p data-testid="pnl-revenue" className="mt-3 font-mono text-lg font-bold">{formatMoney(totals.subtotal, form.currency)}</p></div><div className="bg-white p-4"><p className="data-label">Cost + add-ons</p><p data-testid="pnl-cost" className="mt-3 font-mono text-lg font-bold">{formatMoney(totals.cost, form.currency)}</p></div><div className="bg-orange-50 p-4"><p className="data-label text-orange-700">Gross profit</p><p data-testid="pnl-profit" className="mt-3 font-mono text-lg font-bold text-orange-700">{formatMoney(totals.profit, form.currency)}</p></div><div className="bg-orange-50 p-4"><p className="data-label text-orange-700">Margin</p><p data-testid="pnl-margin" className="mt-3 font-mono text-lg font-bold text-orange-700">{totals.margin.toFixed(1)}%</p></div></div><p data-testid="pnl-guidance" className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Calculator size={14} className="text-orange-600" /> Cost add-ons increase the internal cost base; commission is distributed into client-facing line prices.</p></section>
          </div>

          <aside className="space-y-7 lg:col-span-4">
            <section className="border border-slate-200 bg-white p-6 print:hidden"><p className="data-label text-orange-600">Global settings</p><h2 data-testid="settings-section-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Release controls</h2><div className="mt-6 space-y-5"><Field label="Quotation title" testId="quote-title"><TextInput testId="quote-title-input" value={form.quote_title} onChange={(value) => updateForm("quote_title", value)} /></Field><Field label="Currency" testId="currency"><select data-testid="currency-select" value={form.currency} onChange={(event) => { const currency = event.target.value; setForm((current) => ({ ...current, currency, usd_exchange_rate: currency === "USD" ? 1 : null })); }} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></Field>{form.currency !== "USD" && <div className="border border-orange-200 bg-orange-50/60 p-4"><Field label={`USD rate · 1 ${form.currency} equals`} testId="usd-exchange-rate"><input data-testid="usd-exchange-rate-input" type="number" min="0.00000001" step="any" value={form.usd_exchange_rate ?? ""} onChange={(event) => updateForm("usd_exchange_rate", event.target.value ? Number(event.target.value) : null)} placeholder="Enter USD value" className="w-full border border-orange-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field><p className="mt-2 text-xs leading-5 text-slate-600">Saved with this quotation so historical USD totals never change.</p></div>}<div className="border border-orange-200 bg-orange-50/60 p-4"><Field label="Quote commission" testId="commission"><input data-testid="commission-input" type="number" min="0" step="0.01" value={form.commission_amount} onChange={(event) => updateForm("commission_amount", Number(event.target.value))} className="w-full border border-orange-200 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field><p data-testid="commission-allocation-summary" className="mt-3 text-xs leading-5 text-slate-600">{formatMoney(form.commission_amount, form.currency)} ÷ {form.line_items.length} line{form.line_items.length === 1 ? "" : "s"} = <strong className="font-mono text-orange-700">{formatMoney(totals.commissionPerLine, form.currency)}</strong> added to each client price.</p></div><div className="border border-slate-200 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Apply sales tax</p><p className="mt-1 text-xs text-slate-500">Optional, shown separately</p></div><button type="button" data-testid="tax-toggle-button" aria-pressed={form.tax_enabled} onClick={() => updateForm("tax_enabled", !form.tax_enabled)} className={`relative h-6 w-11 transition-colors ${form.tax_enabled ? "bg-orange-600" : "bg-slate-300"}`}><span className={`absolute top-1 h-4 w-4 bg-white transition-transform ${form.tax_enabled ? "left-6" : "left-1"}`} /></button></div>{form.tax_enabled && <div className="mt-4"><label className="data-label mb-2 block">Tax rate (%)</label><input data-testid="tax-rate-input" type="number" min="0" max="100" step="0.1" value={form.tax_rate} onChange={(event) => updateForm("tax_rate", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></div>}</div><Field label="Payment terms" testId="payment-terms"><TextInput testId="payment-terms-input" value={form.payment_terms} onChange={(value) => updateForm("payment_terms", value)} /></Field><Field label="Validity (days)" testId="valid-days"><input data-testid="valid-days-input" type="number" min="1" value={form.valid_days} onChange={(event) => updateForm("valid_days", Number(event.target.value))} className="w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div></section>

            <section className="border border-slate-200 bg-white p-6 print:hidden">
              <p className="data-label text-orange-600">Document identity</p>
              <h2 data-testid="company-section-heading" className="mt-2 font-heading text-xl font-bold tracking-tight">Quote-specific details</h2>
              <p className="mt-2 text-sm text-slate-500">Company branding is managed once from Workspace.</p>
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3"><Field label="Quotation number" testId="quote-number"><TextInput testId="quote-number-input" value={form.quote_number} onChange={(value) => updateForm("quote_number", value)} placeholder="Auto-generated if blank" /></Field><Field label="Release date" testId="release-date"><input data-testid="release-date-input" type="date" value={form.release_date} onChange={(event) => updateForm("release_date", event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field></div>
                <div className="grid grid-cols-2 gap-3"><Field label="Prepared by" testId="prepared-by-name"><TextInput testId="prepared-by-name-input" value={form.prepared_by_name} onChange={(value) => updateForm("prepared_by_name", value)} placeholder="Full name" /></Field><Field label="Title" testId="prepared-by-title"><TextInput testId="prepared-by-title-input" value={form.prepared_by_title} onChange={(value) => updateForm("prepared_by_title", value)} placeholder="Commercial Manager" /></Field></div>
                <Field label="Terms / exclusions" testId="quote-notes"><textarea data-testid="quote-notes-input" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} rows={3} className="w-full resize-none border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
                <Field label="Release note" testId="release-notes"><textarea data-testid="release-notes-input" value={form.release_notes} onChange={(event) => updateForm("release_notes", event.target.value)} rows={3} placeholder="Add a message, clarification, or release note for the customer…" className="w-full resize-none border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></Field>
              </div>
            </section>

            <section data-testid="quote-total-card" className="border border-slate-900 bg-slate-950 p-6 text-white print:hidden"><div className="flex items-center justify-between"><p className="data-label text-slate-400">Client-facing total</p><span className="grid h-8 w-8 place-items-center bg-orange-600"><CircleIcon /></span></div><p data-testid="quote-grand-total" className="mt-5 font-mono text-3xl font-bold tracking-tight">{formatMoney(totals.total, form.currency)}</p><div className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-xs"><div className="flex justify-between text-slate-400"><span>Subtotal</span><span data-testid="quote-subtotal" className="font-mono text-slate-200">{formatMoney(totals.subtotal, form.currency)}</span></div><div className="flex justify-between text-slate-400"><span>Tax {form.tax_enabled ? `(${form.tax_rate}%)` : "(not applied)"}</span><span data-testid="quote-tax" className="font-mono text-slate-200">{formatMoney(totals.tax, form.currency)}</span></div><div className="flex justify-between text-slate-400"><span>Gross profit</span><span data-testid="quote-profit" className="font-mono font-semibold text-orange-300">{formatMoney(totals.profit, form.currency)}</span></div></div></section>
          </aside>
        </div>

        {commercialPages.map((entries, pageIndex) => <CommercialDocumentPage key={pageIndex} form={form} entries={entries} pageIndex={pageIndex} commercialPageCount={commercialPages.length} totalPageCount={documentPageCount} reference={documentReference} releaseDate={documentReleaseDate} totals={totals} />)}

        <section data-testid="terms-page" data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <DocumentHeader form={form} reference={documentReference} releaseDate={documentReleaseDate} prefix="terms-header" />
          <div className="mt-6"><p className="data-label text-orange-600">Quotation appendix</p><h2 className="mt-2 font-heading text-2xl font-bold tracking-tight">Quotation Terms and Conditions</h2></div>
          <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-xs">
            <div data-testid="terms-price-basis" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Price Basis</p><p className="leading-5 text-slate-700">All prices are quoted in <strong>{form.currency}</strong> unless otherwise stated.</p></div>
            <div data-testid="terms-payment" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Payment Terms</p><p className="whitespace-pre-line leading-5 text-slate-700">{form.payment_terms || "To be mutually agreed and stated in the Purchase Order."}</p></div>
            <div data-testid="terms-delivery" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Delivery Lead Time</p><p className="leading-5 text-slate-700">{form.lead_time || "To be confirmed"} after official release of the Purchase Order (PO).</p></div>
            <div data-testid="terms-scope" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Scope of Supply</p><p className="leading-5 text-slate-700">As per quotation subject: “{form.subject || "Subject to be confirmed"}”.</p></div>
            <div data-testid="terms-order-confirmation" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Order Confirmation</p><p className="leading-5 text-slate-700">The Purchase Order shall be deemed accepted only upon written confirmation by the Seller.</p></div>
            <div data-testid="terms-change-order" className="grid grid-cols-[150px_1fr] gap-5 py-3"><p className="data-label text-slate-500">Change to Order</p><p className="leading-5 text-slate-700">Any changes to specifications, quantity, or delivery schedule after order confirmation may result in adjustments to price and delivery lead time.</p></div>
          </div>
          <p className="mt-6 text-[10px] leading-4 text-slate-400">These Terms and Conditions form an integral part of quotation {documentReference}.</p>
          <DocumentPageFooter pageNumber={commercialPages.length + 1} pageCount={documentPageCount} />
        </section>

        <section data-testid="acceptance-page" data-pdf-page="true" className="quotation-page print-document relative mx-auto mt-8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <DocumentHeader form={form} reference={documentReference} releaseDate={documentReleaseDate} prefix="acceptance-header" />
          <div className="mt-6"><p className="data-label text-orange-600">Formal acceptance</p><h2 className="mt-2 font-heading text-2xl font-bold tracking-tight">Customer Acceptance</h2></div>
          <p data-testid="acceptance-wording" className="mt-6 text-sm leading-6 text-slate-700">I hereby acknowledge and agree to the Terms and Conditions contained herein and certify that I am authorized to execute this Quotation. Accordingly, we consider this the only agreement between the Company and ourselves for the specific items outlined in this Quotation.</p>
          <div className="mt-6 border border-slate-200 p-4"><p className="data-label text-slate-500">For and on Behalf of</p><p data-testid="acceptance-customer-name" className="mt-2 font-heading text-xl font-bold text-slate-900">{form.client_company || "Customer Name"}</p></div>
          <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-8 text-xs"><div><p className="data-label text-slate-400">Name</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Designation</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Date</p><div className="mt-7 border-b border-slate-500" /></div><div><p className="data-label text-slate-400">Signature</p><div className="mt-7 border-b border-slate-500" /></div></div>
          <div className="mt-10 border-t border-slate-200 pt-4 text-[10px] text-slate-400"><p>Quotation reference: <span className="font-mono text-slate-600">{documentReference}</span></p><p className="mt-1">Release date: {documentReleaseDate}</p></div>
          <DocumentPageFooter pageNumber={commercialPages.length + 2} pageCount={documentPageCount} />
        </section>
      </main>
    </div>
  );
}

function CircleIcon() { return <Check size={15} />; }