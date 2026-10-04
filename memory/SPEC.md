# QuoteForge living spec

QuoteForge is a browser-based oil and gas commercial quotation workspace. It lets a user build sales, rental, and service quotes with configurable UoM, multiple currencies, optional tax, payment terms, delivery lead time, editable supplier/client placeholders, and notes. Rental and service lines use daily or lump-sum charge bases; sales lines use their own per-unit or line-total pricing option. Every saved quote is persisted in MongoDB and appears in release history.

## Data model
- `Quote`: string id, quote number, issue date, status, supplier details, client details, currency, tax settings, terms, notes, line items, subtotal, cost, tax, grand total, gross profit, and margin percentage.
- `QuoteLineItem`: description, category (`sales`, `rental`, `service`), charge type (`daily`, `lump_sum`) for rental/service lines, sales pricing (`unit`, `line_total`) for sales lines, UoM, quantity, duration days, sell rate, cost rate, calculated line total and line cost.

## Key flows
1. Dashboard (`/`) shows persistent quote history and aggregate revenue, cost, profit, and margin.
2. New quote (`/quotes/new`) captures parties, line items, settings, company identity, and notes. Totals and P&L update live.
3. Save creates a persistent quote and opens its saved URL (`/quotes/:id`). Saved quotes can be edited and saved again.
4. Print / PDF uses the browser print dialog and a clean A4 quotation preview. The preview is always rendered below the builder and uses the editable company/client fields.

## Auth and integrations
There is no authentication. PDF export is implemented through the browser print-to-PDF flow; no third-party integration is configured.