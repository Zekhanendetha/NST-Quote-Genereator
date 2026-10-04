import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";

const safeFilenamePart = (value: string, fallback: string) => value
  .trim()
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 70) || fallback;

interface GenerateQuotePdfInput {
  pages: HTMLElement[];
  quoteNumber: string;
  subject: string;
  companyName: string;
}

export async function generateQuotePdf({ pages, quoteNumber, subject, companyName }: GenerateQuotePdfInput) {
  if (!pages.length) throw new Error("No quotation pages are available to export");
  await document.fonts.ready;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `${quoteNumber} - ${subject}`,
    subject,
    author: companyName,
    creator: "NASAKTION Quote Generator",
  });

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 15_000,
      removeContainer: true,
    });
    if (index > 0) doc.addPage("a4", "portrait");
    doc.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  }

  const filename = `${safeFilenamePart(quoteNumber, "Quotation")}-${safeFilenamePart(subject, "Subject")}.pdf`;
  doc.save(filename);
  return filename;
}