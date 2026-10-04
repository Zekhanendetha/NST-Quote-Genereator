import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, BarChart3, BookOpen, Building2, CircleDollarSign, FilePlus2, ImagePlus, Save, Search, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPut } from "@/lib/api";
import { CATEGORY_LABELS, formatMoney, type CompanyProfile, type Quote, type QuoteStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const fetchQuotes = () => apiGet<Quote[]>("/quotes");
const fetchCompanyProfile = () => apiGet<CompanyProfile>("/company-profile");
const emptyProfile: CompanyProfile = { id: "workspace-company-profile", company_name: "", company_address: "", company_email: "", company_phone: "", company_logo: "" };
type MetricKey = "revenue" | "cost" | "profit" | "margin";
const STATUS_LABELS: Record<QuoteStatus, string> = { draft: "Released", issued: "Issued", released: "Released", cancelled: "Cancelled", executed: "Executed", partial_executed: "Partially executed" };

const quoteUsdRate = (quote: Quote) => quote.currency === "USD" ? 1 : quote.usd_exchange_rate;
const toUsd = (quote: Quote, amount: number) => { const rate = quoteUsdRate(quote); return rate && rate > 0 ? amount * rate : null; };
const METRIC_TITLES: Record<MetricKey, string> = { revenue: "Quoted Revenue Detail", cost: "Total Cost Detail", profit: "Gross Profit Detail", margin: "Average Margin Detail" };
const metricQuoteValue = (quote: Quote, metric: MetricKey) => metric === "margin" ? `${quote.margin_percent.toFixed(1)}%` : (() => { const amount = metric === "revenue" ? quote.grand_total : metric === "cost" ? quote.total_cost : quote.gross_profit; const usd = toUsd(quote, amount); return usd === null ? "FX needed" : formatMoney(usd, "USD"); })();

function MetricCard({ label, value, detail, accent = false, icon: Icon, onClick }: { label: string; value: string; detail: string; accent?: boolean; icon: typeof TrendingUp; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-testid={`dashboard-metric-${label.toLowerCase().replaceAll(" ", "-")}`} className={`group w-full border border-slate-200 p-5 text-left transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md ${accent ? "bg-orange-50" : "bg-white"}`}>
      <div className="flex items-start justify-between">
        <p className="data-label">{label}</p>
        <Icon size={17} className={accent ? "text-orange-600" : "text-slate-400"} aria-hidden="true" />
      </div>
      <p className="mt-5 font-mono text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{detail}</span><span className="font-semibold text-orange-700 opacity-0 transition-opacity group-hover:opacity-100">View detail →</span></p>
    </button>
  );
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [quotePendingDelete, setQuotePendingDelete] = useState<Quote | null>(null);
  const queryClient = useQueryClient();
  const quotesQuery = useQuery({ queryKey: ["quotes"], queryFn: fetchQuotes, retry: false });
  const profileQuery = useQuery({ queryKey: ["company-profile"], queryFn: fetchCompanyProfile, retry: false });
  useEffect(() => { if (profileQuery.data) setProfile(profileQuery.data); }, [profileQuery.data]);
  const profileMutation = useMutation({
    mutationFn: () => apiPut<CompanyProfile>("/company-profile", profile),
    onSuccess: (saved) => { setProfile(saved); queryClient.setQueryData(["company-profile"], saved); toast.success("Workspace identity saved"); },
    onError: () => toast.error("Unable to save the Workspace identity."),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) => apiPatch<Quote>(`/quotes/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast.success("Quotation status updated"); },
    onError: () => toast.error("Unable to update quotation status."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/quotes/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); setQuotePendingDelete(null); toast.success("Quotation permanently deleted"); },
    onError: () => toast.error("Unable to delete this quotation."),
  });
  const uploadWorkspaceLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose a PNG, JPG, or WebP image."); return; }
    if (file.size > 1_000_000) { toast.error("Logo must be smaller than 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, company_logo: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };
  const quotes = quotesQuery.data ?? [];
  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => `${quote.quote_number} ${quote.subject} ${quote.client_company} ${quote.client_name}`.toLowerCase().includes(search.toLowerCase())),
    [quotes, search],
  );
  const totals = useMemo(() => {
    let revenue = 0;
    let subtotal = 0;
    let cost = 0;
    let profit = 0;
    let missingFx = 0;
    for (const quote of quotes) {
      const revenueUsd = toUsd(quote, quote.grand_total);
      const subtotalUsd = toUsd(quote, quote.subtotal);
      const costUsd = toUsd(quote, quote.total_cost);
      const profitUsd = toUsd(quote, quote.gross_profit);
      if (revenueUsd === null || subtotalUsd === null || costUsd === null || profitUsd === null) { missingFx += 1; continue; }
      revenue += revenueUsd;
      subtotal += subtotalUsd;
      cost += costUsd;
      profit += profitUsd;
    }
    return { revenue, cost, profit, margin: subtotal ? profit / subtotal * 100 : 0, missingFx };
  }, [quotes]);
  const fxDetail = totals.missingFx ? `${totals.missingFx} quote${totals.missingFx === 1 ? "" : "s"} need USD rate` : "All quotations converted to USD";

  return (
    <div className="min-h-svh bg-[#f4f4f5] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" data-testid="app-logo-link" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center bg-orange-600 text-white"><Activity size={19} /></span>
            <span><span className="block font-heading text-lg font-bold tracking-tight">Quote Generator</span><span className="block text-[10px] font-medium text-orange-700">Generated by Zekha Anendetha - Version 1</span></span>
          </Link>
          <span data-testid="dashboard-status" className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-2 w-2 bg-emerald-500" /> Workspace ready</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8 lg:py-10">
        <div className="mb-9 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="data-label text-orange-600">Commercial release / overview</p>
            <h1 data-testid="dashboard-heading" className="mt-3 max-w-3xl font-heading text-4xl font-bold tracking-[-0.055em] text-slate-950 sm:text-5xl">{profile.company_name.trim() || "Your Company"} Quote Generator</h1>
            <p data-testid="dashboard-subheading" className="mt-4 max-w-xl text-base leading-7 text-slate-600">1st Release</p>
            <Link to="/quotes/new" data-testid="dashboard-new-quote-button" className={buttonVariants({ size: "sm" }) + " mt-5 rounded-none bg-orange-600 px-5 text-white hover:bg-orange-700"}><FilePlus2 size={16} /> New quote</Link>
          </div>
          <div className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><BookOpen size={15} className="text-orange-600" /> {quotes.length} saved {quotes.length === 1 ? "quote" : "quotes"}</div>
        </div>

        <section aria-label="Business performance" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Quoted revenue" value={formatMoney(totals.revenue, "USD")} detail={fxDetail} icon={CircleDollarSign} onClick={() => setSelectedMetric("revenue")} />
          <MetricCard label="Total cost" value={formatMoney(totals.cost, "USD")} detail={fxDetail} icon={BarChart3} onClick={() => setSelectedMetric("cost")} />
          <MetricCard label="Gross profit" value={formatMoney(totals.profit, "USD")} detail="USD profit before overhead allocation" accent icon={TrendingUp} onClick={() => setSelectedMetric("profit")} />
          <MetricCard label="Average margin" value={`${totals.margin.toFixed(1)}%`} detail="Weighted by USD-converted revenue" icon={ArrowUpRight} onClick={() => setSelectedMetric("margin")} />
        </section>

        <section data-testid="workspace-company-identity" className="mt-10 border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 md:flex-row md:items-center lg:px-6"><div><p className="data-label text-orange-600">Workspace / Permanent identity</p><h2 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight"><Building2 size={20} className="text-orange-600" /> Company profile</h2><p className="mt-2 text-sm text-slate-500">Saved once for NASAKTION and copied into every new quotation.</p></div><Button data-testid="workspace-company-save-button" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending || !profile.company_name.trim()} size="sm" className="w-fit rounded-none bg-orange-600 text-white hover:bg-orange-700"><Save size={15} /> {profileMutation.isPending ? "Saving…" : "Save identity"}</Button></div>
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[220px_1fr] lg:p-6">
            <div className="border border-dashed border-slate-300 bg-slate-50 p-4"><p className="data-label mb-3 text-slate-500">Company logo</p>{profile.company_logo ? <div><img data-testid="workspace-company-logo-preview" src={profile.company_logo} alt="Workspace company logo" className="h-20 w-full object-contain" /><button type="button" data-testid="workspace-company-logo-remove-button" onClick={() => setProfile((current) => ({ ...current, company_logo: "" }))} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-600"><Trash2 size={14} /> Remove logo</button></div> : <label data-testid="workspace-company-logo-upload-label" className="flex cursor-pointer flex-col items-center gap-3 py-4 text-center text-sm text-slate-600 hover:text-orange-700"><span className="grid h-10 w-10 place-items-center border border-slate-200 bg-white"><ImagePlus size={18} /></span><span>Upload logo<br /><span className="text-xs text-slate-400">PNG, JPG or WebP · max 1 MB</span></span><input data-testid="workspace-company-logo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadWorkspaceLogo} className="sr-only" /></label>}</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="block"><span className="data-label mb-2 block text-slate-500">Legal company name *</span><input data-testid="workspace-company-name-input" value={profile.company_name} onChange={(event) => setProfile((current) => ({ ...current, company_name: event.target.value }))} placeholder="Enter legal company name" className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label><label className="block"><span className="data-label mb-2 block text-slate-500">Company email</span><input data-testid="workspace-company-email-input" value={profile.company_email} onChange={(event) => setProfile((current) => ({ ...current, company_email: event.target.value }))} placeholder="commercial@company.com" className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label><label className="block md:col-span-2"><span className="data-label mb-2 block text-slate-500">Address / registration</span><textarea data-testid="workspace-company-address-input" value={profile.company_address} onChange={(event) => setProfile((current) => ({ ...current, company_address: event.target.value }))} rows={2} placeholder="Enter registered address and company details" className="w-full resize-none border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label><label className="block"><span className="data-label mb-2 block text-slate-500">Company phone</span><input data-testid="workspace-company-phone-input" value={profile.company_phone} onChange={(event) => setProfile((current) => ({ ...current, company_phone: event.target.value }))} placeholder="+62 ..." className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label></div>
          </div>
        </section>

        <section className="mt-10 border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 md:flex-row md:items-center lg:px-6">
            <div><p className="data-label text-orange-600">Quote database</p><h2 data-testid="quote-history-heading" className="mt-2 font-heading text-2xl font-bold tracking-tight">Release history</h2></div>
            <label className="flex min-w-[260px] items-center gap-2 border border-slate-200 px-3 py-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100"><Search size={16} className="text-slate-400" /><span className="sr-only">Search saved quotes</span><input data-testid="quote-history-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quote, company or contact" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
          </div>
          {quotesQuery.isError && <div data-testid="quote-history-error" className="m-6 border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">History is temporarily unavailable. You can still open a new quote and continue working.</div>}
          {!quotesQuery.isError && filteredQuotes.length === 0 && <div data-testid="quote-history-empty" className="grid min-h-[230px] place-items-center px-6 py-12 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center border border-orange-200 bg-orange-50 text-orange-600"><FilePlus2 size={20} /></div><h3 className="mt-4 font-heading text-lg font-semibold">No releases in the database yet</h3><p className="mt-2 text-sm text-slate-500">Start with one quote and your commercial history will appear here.</p><Link to="/quotes/new" data-testid="quote-history-empty-new-button" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-5 rounded-none border-slate-300"}>Create first quote</Link></div></div>}
          {filteredQuotes.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[1440px] text-left"><thead><tr className="border-b border-slate-200 bg-slate-50/80"><th className="px-5 py-3 data-label">Reference</th><th data-testid="quote-history-subject-header" className="px-5 py-3 data-label">Subject</th><th className="px-5 py-3 data-label">Customer</th><th className="px-5 py-3 data-label">Prepared by</th><th className="px-5 py-3 data-label">Scope</th><th data-testid="quote-history-cost-header" className="px-5 py-3 data-label">Cost</th><th className="px-5 py-3 data-label">USD value</th><th className="px-5 py-3 data-label">Margin</th><th className="px-5 py-3 data-label">Execution status</th><th className="px-5 py-3 data-label">Actions</th></tr></thead><tbody>{filteredQuotes.map((quote, index) => { const usdValue = toUsd(quote, quote.grand_total); return <tr data-testid={`quote-history-row-${quote.id}`} key={quote.id} className="group border-b border-slate-100 transition-colors hover:bg-orange-50/40" style={{ animationDelay: `${index * 50}ms` }}><td className="px-5 py-4"><Link to={`/quotes/${quote.id}`} data-testid={`quote-history-reference-${quote.id}`} className="font-mono text-sm font-bold text-slate-950 hover:text-orange-700">{quote.quote_number}</Link><span className="mt-1 block text-xs text-slate-500">{quote.issue_date}</span></td><td data-testid={`quote-history-subject-${quote.id}`} className="max-w-[260px] px-5 py-4 text-sm font-semibold leading-5 text-slate-800"><span className="line-clamp-2" title={quote.subject}>{quote.subject || "—"}</span></td><td className="px-5 py-4"><span data-testid={`quote-history-client-${quote.id}`} className="block text-sm font-semibold text-slate-800">{quote.client_company}</span><span className="mt-1 block text-xs text-slate-500">{quote.client_name}</span></td><td data-testid={`quote-history-preparer-${quote.id}`} className="px-5 py-4"><span className="block text-sm font-semibold text-slate-700">{quote.prepared_by_name || "—"}</span><span className="mt-1 block text-xs text-slate-500">{quote.prepared_by_title || "No title"}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{Array.from(new Set(quote.line_items.map((item) => item.category))).map((category) => <Badge data-testid={`quote-history-category-${quote.id}-${category}`} key={category} variant="outline" className="rounded-none border-slate-200 text-[10px] uppercase tracking-wider">{CATEGORY_LABELS[category]}</Badge>)}</div></td><td data-testid={`quote-history-cost-${quote.id}`} className="px-5 py-4 font-mono text-xs font-semibold">{formatMoney(quote.total_cost, quote.currency)}</td><td data-testid={`quote-history-usd-total-${quote.id}`} className="px-5 py-4 font-mono text-xs font-bold text-slate-900">{usdValue === null ? <span className="text-orange-700">FX needed</span> : formatMoney(usdValue, "USD")}</td><td data-testid={`quote-history-margin-${quote.id}`} className="px-5 py-4"><span className="bg-orange-50 px-2 py-1 font-mono text-xs font-bold text-orange-700">{quote.margin_percent.toFixed(1)}%</span></td><td className="px-5 py-4"><select data-testid={`quote-history-status-select-${quote.id}`} value={quote.status} onChange={(event) => statusMutation.mutate({ id: quote.id, status: event.target.value as QuoteStatus })} className="min-w-[150px] border-2 border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">{(["draft", "issued", "released", "partial_executed", "executed", "cancelled"] as QuoteStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></td><td className="px-5 py-4"><div className="flex items-center gap-3"><Link to={`/quotes/${quote.id}`} data-testid={`quote-history-open-${quote.id}`} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-orange-700">Open <ArrowUpRight size={14} /></Link><button type="button" data-testid={`quote-history-delete-${quote.id}`} onClick={() => setQuotePendingDelete(quote)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-800">Delete</button></div></td></tr>; })}</tbody></table></div>}
        </section>
        <p data-testid="dashboard-footer-note" className="mt-6 text-xs text-slate-400">All values are working commercial estimates. Review cost basis, tax treatment, and client terms before release.</p>

        <Dialog open={selectedMetric !== null} onOpenChange={(open) => { if (!open) setSelectedMetric(null); }}>
          <DialogContent data-testid="metric-detail-dialog" className="max-h-[82vh] max-w-5xl overflow-y-auto rounded-none">
            <DialogHeader><DialogTitle>{selectedMetric ? METRIC_TITLES[selectedMetric] : "Quotation Detail"}</DialogTitle><DialogDescription>All released quotations are listed in their saved currency and converted USD basis. Missing manual rates are highlighted.</DialogDescription></DialogHeader>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-3 data-label">Reference</th><th className="px-4 py-3 data-label">Customer</th><th className="px-4 py-3 data-label">Preparer</th><th className="px-4 py-3 data-label">Status</th><th className="px-4 py-3 data-label">Original value</th><th className="px-4 py-3 text-right data-label">{selectedMetric === "margin" ? "Margin" : "USD value"}</th></tr></thead><tbody>{quotes.map((quote) => <tr data-testid={`metric-detail-row-${quote.id}`} key={quote.id} className="border-b border-slate-100"><td className="px-4 py-3 font-mono text-xs font-bold">{quote.quote_number}</td><td className="px-4 py-3 text-sm">{quote.client_company}</td><td className="px-4 py-3 text-sm">{quote.prepared_by_name || "—"}</td><td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{STATUS_LABELS[quote.status]}</td><td className="px-4 py-3 font-mono text-xs">{formatMoney(quote.grand_total, quote.currency)}</td><td data-testid={`metric-detail-value-${quote.id}`} className="px-4 py-3 text-right font-mono text-sm font-bold text-orange-700">{selectedMetric ? metricQuoteValue(quote, selectedMetric) : "—"}</td></tr>)}</tbody></table></div>
          </DialogContent>
        </Dialog>
        <Dialog open={quotePendingDelete !== null} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setQuotePendingDelete(null); }}>
          <DialogContent data-testid="quote-delete-confirmation-dialog" className="max-w-md rounded-none">
            <DialogHeader>
              <DialogTitle data-testid="quote-delete-confirmation-title">Permanently delete quotation?</DialogTitle>
              <DialogDescription data-testid="quote-delete-confirmation-message" className="pt-2 text-sm leading-6 text-slate-600">Permanently delete quotation <strong className="text-slate-900">{quotePendingDelete?.quote_number}</strong> — <strong className="text-slate-900">{quotePendingDelete?.subject || "No subject"}</strong>? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button data-testid="quote-delete-cancel-button" onClick={() => setQuotePendingDelete(null)} disabled={deleteMutation.isPending} variant="outline" className="rounded-none border-slate-300">Cancel</Button>
              <Button data-testid="quote-delete-confirm-button" onClick={() => quotePendingDelete && deleteMutation.mutate(quotePendingDelete.id)} disabled={deleteMutation.isPending} className="rounded-none bg-red-600 text-white hover:bg-red-700">{deleteMutation.isPending ? "Deleting…" : "Delete permanently"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}