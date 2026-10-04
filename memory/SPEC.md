# QuoteForge living spec

QuoteForge is a browser-based oil and gas commercial quotation workspace. It lets a user build sales, rental, and service quotes with configurable UoM, multiple currencies, optional tax, payment terms, delivery lead time, editable supplier/client placeholders, and notes. Rental and service lines use daily or lump-sum charge bases; sales lines use their own per-unit or line-total pricing option. Every saved quote is persisted in MongoDB and appears in release history.

## Data model
- `Quote`: string id, editable quote number, selectable release date, status, supplier details and persisted company logo, preparer name/title, client details, currency, tax settings, terms, internal notes, client-facing release note, quote-level commission, line items, subtotal, cost, tax, grand total, gross profit, and margin percentage. Commission is divided equally across all line items and included in their client-facing prices.
- `QuoteLineItem`: description plus printable detailed specification, category (`sales`, `rental`, `service`), charge type (`daily`, `lump_sum`) for rental/service lines, sales pricing (`unit`, `line_total`) for sales lines, UoM, quantity, duration days, price method (`sell_rate`, `margin`), direct sell rate or target gross margin percentage, cost rate, cost added value percentage, calculated cost add-on, commission allocation, line total and line cost. Margin pricing derives the sell value from fully loaded cost using `loaded cost / (1 - margin %)`. Cost added value increases internal cost basis for government tax, landing cost, and similar charges.

## Key flows
1. Dashboard (`/`) shows persistent quote history and aggregate revenue, cost, profit, and margin.
2. New quote (`/quotes/new`) captures parties, line items, settings, company identity, and notes. Totals and P&L update live.
3. Save creates a persistent quote and opens its saved URL (`/quotes/:id`). Saved quotes can be edited and saved again.
4. Print / PDF uses the browser print dialog and a clean A4 quotation preview. The preview is always rendered below the builder and uses the editable company/client fields. Its commercial table separates description, type/basis, quantity, UoM, effective item price, and final line amount; detailed specifications remain under the item description. The document header includes the persisted company logo, editable quotation number, and selectable release date. Customer replaces Bill To, the supplier label is omitted, and the footer includes a client-facing release note plus name, title, and signature release fields.

## Auth and integrations
There is no authentication. PDF export is implemented through the browser print-to-PDF flow; no third-party integration is configured.