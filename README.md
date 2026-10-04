# NASAKTION Quote Generator

Three-tier quote workspace: React 19 / TypeScript / Vite frontend, FastAPI backend, and MongoDB. Quotes and the shared company profile are stored in MongoDB. PDFs are generated in the browser and downloaded by the user.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set `MONGO_URL`, `DB_NAME`, and the Microsoft Entra IDs for your tenant, API registration, and SPA registration.
2. Copy `frontend/.env.example` to `frontend/.env.local` and set the same tenant/API/SPA IDs. The scope defaults to `api://<API client ID>/access_as_user`.
3. In the Entra SPA app registration, configure `http://localhost:3000/` as a **Single-page application** redirect URI. The API registration must expose `access_as_user`, and users need `Quote.Admin` or `Quote.Editor` assigned on the API Enterprise Application.
4. Install backend dependencies from `backend/requirements.txt`, then start FastAPI from the `backend` directory on port `8001`.
5. Install frontend dependencies in `frontend`, then start Vite on port `3000`. Vite proxies `/api` to `http://localhost:8001` for local development.

Never put database credentials or client secrets in `VITE_*` values. The frontend identifiers are public client configuration; the backend verifies delegated bearer tokens and enforces roles.

## Roles

- **Quote.Admin:** read, create, edit, change status, and delete quotes; read and change the shared company profile.
- **Quote.Editor:** read, create, edit, and change status; cannot delete quotes or change the shared company profile.

All authorized users currently share one company workspace and can see all quotations. The API is the enforcement boundary; hiding restricted controls in the frontend is only a user experience improvement.

## Deployment plan

See [INDEPENDENT-HOSTING-MIGRATION.md](INDEPENDENT-HOSTING-MIGRATION.md) for the architecture review, file-by-file changes, Azure/MongoDB deployment plan, secret settings, test gates, migration precautions, and cutover/rollback sequence.
