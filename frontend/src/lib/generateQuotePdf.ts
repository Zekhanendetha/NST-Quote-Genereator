import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CATEGORY_LABELS, formatMoney, type QuoteLineItemInput, type QuotePayload } from "@/lib/types";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const lineValue = (item: QuoteLineItemInput, rate: number) => item.category === "sales"
  ? (item.sales_pricing === "line_total" ? rate : item.quantity * rate)
  : item.quantity * rate * (item.charge_type === "daily" ? item.duration_days : 1);

const loadedCost = (item: QuoteLineItemInput) => {
  const base = lineValue(item, item.cost_rate);
  return base + base * item.cost_addon_percent / 100;
};

const quotedBase = (item: QuoteLineItemInput) => item.price_method === "margin"
  ? loadedCost(item) / (1 - item.target_margin_percent / 100)
  : lineValue(item, item.sell_rate);

const safeFilenamePart = (value: string, fallback: string) => value
  .trim()
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 70) || fallback;

const logoFormat = (logo: string) => logo.startsWith("data:image/jpeg") ? "JPEG" : logo.startsWith("data:image/webp") ? "WEBP" : "PNG";

interface GenerateQuotePdfInput {
  quote: QuotePayload;
  quoteNumber: string;
  releaseDate: string;
}

export function generateQuotePdf({ quote, quoteNumber, releaseDate }: GenerateQuotePdfInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const commissionPerLine = quote.line_items.length ? quote.commission_amount / quote.line_items.length : 0;
  const lineTotals = quote.line_items.map((item) => quotedBase(item) + commissionPerLine);
  const subtotal = lineTotals.reduce((sum, amount) => sum + amount, 0);
  const tax = quote.tax_enabled ? subtotal * quote.tax_rate / 100 : 0;
  const total = subtotal + tax;

  doc.setProperties({
    title: `${quoteNumber} - ${quote.subject}`,
    subject: quote.subject,
    author: quote.company_name,
    creator: "NASAKTION Quote Generator",
  });

  const drawHeader = () => {
    if (quote.company_logo) {
      try { doc.addImage(quote.company_logo, logoFormat(quote.company_logo), 85, 6, 40, 14, undefined, "FAST"); } catch { /* keep the release usable if a browser-decoded logo format is unsupported */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(234, 88, 12);
    doc.text((quote.company_name || "").toUpperCase(), MARGIN, 26);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.text(quote.quote_title, MARGIN, 33);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(quote.subject, 112), MARGIN, 38);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(185, 28, 28);
    doc.text("CONFIDENTIAL", PAGE_WIDTH - MARGIN, 26, { align: "right" });
    doc.setTextColor(15, 23, 42);
    doc.text("COMMERCIAL OFFER", PAGE_WIDTH - MARGIN, 30, { align: "right" });
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text(quoteNumber, PAGE_WIDTH - MARGIN, 35, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(`Release date: ${releaseDate}`, PAGE_WIDTH - MARGIN, 39, { align: "right" });
    doc.text(`Validity: ${quote.valid_days} days`, PAGE_WIDTH - MARGIN, 43, { align: "right" });
    doc.setDrawColor(234, 88, 12);
    doc.setLineWidth(1);
    doc.line(MARGIN, 48, PAGE_WIDTH - MARGIN, 48);
  };

  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 18) return y;
    doc.addPage();
    drawHeader();
    return 56;
  };

  drawHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(quote.company_name, MARGIN, 57);
  doc.text("CUSTOMER", 112, 57);
  doc.text(quote.client_company, 112, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  const supplierLines = [quote.company_address, quote.company_email, quote.company_phone].filter(Boolean);
  doc.text(supplierLines, MARGIN, 62);
  const customerLines = [
    `Attn: ${quote.client_name}`,
    quote.client_location,
    quote.client_email,
    quote.customer_reference ? `Ref: ${quote.customer_reference}` : "",
    quote.delivery_point ? `Delivery point: ${quote.delivery_point}` : "",
  ].filter(Boolean);
  doc.text(customerLines, 112, 67);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 80, PAGE_WIDTH - MARGIN, 80);

  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const introduction = `${quote.company_name} is pleased to submit this quotation proposal regarding "${quote.subject}" for your consideration and review. This proposal has been prepared based on the scope and requirements discussed and outlines our proposed solution, deliverables, and commercial terms for your evaluation.`;
  const introductionLines = doc.splitTextToSize(introduction, CONTENT_WIDTH);
  doc.text(introductionLines, MARGIN, 87);
  const tableStartY = 91 + introductionLines.length * 3.5;

  autoTable(doc, {
    startY: tableStartY,
    margin: { top: 54, right: MARGIN, bottom: 18, left: MARGIN },
    head: [["DESCRIPTION", "TYPE / BASIS", "QTY", "UOM", "ITEM PRICE", "LINE AMOUNT"]],
    body: quote.line_items.map((item, index) => {
      const billedUnits = item.category !== "sales" && item.charge_type === "daily" ? item.quantity * item.duration_days : item.quantity;
      const lineTotal = lineTotals[index];
      const itemPrice = billedUnits ? lineTotal / billedUnits : lineTotal;
      const basis = item.category === "sales" ? (item.sales_pricing === "unit" ? "Per unit" : "Line total") : (item.charge_type === "daily" ? "Daily" : "Lump sum");
      return [
        item.description_details ? `${item.description}\n${item.description_details}` : item.description,
        `${CATEGORY_LABELS[item.category]}\n${basis}`,
        String(item.quantity),
        item.category !== "sales" && item.charge_type === "daily" ? `${item.uom}\n${item.duration_days} days` : item.uom,
        formatMoney(itemPrice, quote.currency),
        formatMoney(lineTotal, quote.currency),
      ];
    }),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 6.2, textColor: [15, 23, 42], cellPadding: { top: 2.2, right: 1.5, bottom: 2.2, left: 1.5 }, lineColor: [241, 245, 249], lineWidth: { bottom: 0.2 }, overflow: "linebreak", valign: "top" },
    headStyles: { font: "courier", fontStyle: "bold", fontSize: 5.4, textColor: [15, 23, 42], lineColor: [15, 23, 42], lineWidth: { bottom: 0.5 } },
    columnStyles: { 0: { cellWidth: 61 }, 1: { cellWidth: 29 }, 2: { cellWidth: 13, halign: "right" }, 3: { cellWidth: 18, halign: "right" }, 4: { cellWidth: 31, halign: "right" }, 5: { cellWidth: 34, halign: "right", fontStyle: "bold" } },
    willDrawPage: ({ pageNumber }) => { if (pageNumber > 1) drawHeader(); },
  });

  const tableResult = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let y = ensureSpace(tableResult?.finalY ?? tableStartY, 70);
  const totalX = 137;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal", totalX, y + 5);
  doc.text(formatMoney(subtotal, quote.currency), PAGE_WIDTH - MARGIN, y + 5, { align: "right" });
  doc.text("Tax", totalX, y + 10);
  doc.text(formatMoney(tax, quote.currency), PAGE_WIDTH - MARGIN, y + 10, { align: "right" });
  doc.setDrawColor(15, 23, 42);
  doc.line(totalX, y + 13, PAGE_WIDTH - MARGIN, y + 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("TOTAL", totalX, y + 19);
  doc.setTextColor(234, 88, 12);
  doc.text(formatMoney(total, quote.currency), PAGE_WIDTH - MARGIN, y + 19, { align: "right" });

  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Payment: ${quote.payment_terms}`, MARGIN, y);
  doc.text(`Delivery: ${quote.lead_time}`, 112, y);
  if (quote.notes) doc.text(doc.splitTextToSize(quote.notes, CONTENT_WIDTH), MARGIN, y + 6);
  if (quote.release_notes) {
    doc.setFillColor(255, 247, 237);
    doc.rect(MARGIN, y + 13, CONTENT_WIDTH, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(194, 65, 12);
    doc.text("RELEASE NOTE", MARGIN + 3, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(quote.release_notes, CONTENT_WIDTH - 6), MARGIN + 3, y + 23);
  }

  y = ensureSpace(y + (quote.release_notes ? 36 : 12), 34);
  doc.setDrawColor(148, 163, 184);
  doc.rect(MARGIN, y, 78, 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Best Regards,", MARGIN + 4, y + 6);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(quote.company_name, MARGIN + 4, y + 12);
  doc.line(MARGIN + 4, y + 24, MARGIN + 72, y + 24);
  doc.setFontSize(7);
  doc.text(quote.prepared_by_name, MARGIN + 4, y + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(quote.prepared_by_title, MARGIN + 4, y + 31);

  doc.addPage();
  drawHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("Quotation Terms and Conditions", MARGIN, 60);
  const terms: Array<[string, string]> = [
    ["Price Basis", `All prices are quoted in ${quote.currency} unless otherwise stated.`],
    ["Payment Terms", quote.payment_terms || "To be mutually agreed and stated in the Purchase Order."],
    ["Delivery Lead Time", `${quote.lead_time || "To be confirmed"} after official release of the Purchase Order (PO).`],
    ["Scope of Supply", `As per quotation subject: "${quote.subject}".`],
    ["Order Confirmation", "The Purchase Order shall be deemed accepted only upon written confirmation by the Seller."],
    ["Change to Order", "Any changes to specifications, quantity, or delivery schedule after order confirmation may result in adjustments to price and delivery lead time."],
  ];
  autoTable(doc, { startY: 68, margin: { top: 54, right: MARGIN, bottom: 18, left: MARGIN }, body: terms, theme: "plain", styles: { font: "helvetica", fontSize: 7, textColor: [71, 85, 105], cellPadding: 3, lineColor: [226, 232, 240], lineWidth: { bottom: 0.2 }, overflow: "linebreak" }, columnStyles: { 0: { cellWidth: 46, font: "courier", fontStyle: "bold", fontSize: 6, textColor: [71, 85, 105] }, 1: { cellWidth: 140 } }, willDrawPage: ({ pageNumber }) => { if (pageNumber > 1) drawHeader(); } });

  doc.addPage();
  drawHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("Customer Acceptance", MARGIN, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const acceptance = "I hereby acknowledge and agree to the Terms and Conditions contained herein and certify that I am authorized to execute this Quotation. Accordingly, we consider this the only agreement between the Company and ourselves for the specific items outlined in this Quotation.";
  doc.text(doc.splitTextToSize(acceptance, CONTENT_WIDTH), MARGIN, 70);
  doc.setDrawColor(226, 232, 240);
  doc.rect(MARGIN, 92, CONTENT_WIDTH, 24);
  doc.setFont("courier", "bold");
  doc.setFontSize(6);
  doc.text("FOR AND ON BEHALF OF", MARGIN + 4, 99);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(quote.client_company, MARGIN + 4, 108);
  const fields = [["Name", MARGIN, 140], ["Designation", 108, 140], ["Date", MARGIN, 170], ["Signature", 108, 170]] as const;
  for (const [label, x, fieldY] of fields) {
    doc.setFont("courier", "bold");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x, fieldY);
    doc.setDrawColor(100, 116, 139);
    doc.line(x, fieldY + 14, x + 80, fieldY + 14);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`CONFIDENTIAL  ·  Page ${page} of ${pageCount}`, PAGE_WIDTH / 2, 290, { align: "center" });
  }

  const filename = `${safeFilenamePart(quoteNumber, "Quotation")}-${safeFilenamePart(quote.subject, "Subject")}.pdf`;
  doc.save(filename);
  return filename;
}