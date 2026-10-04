# NASAKTION Quote Generator: independent hosting plan

## Review basis and current findings

This review is based on `NST-Quote-Genereator-feature-entra-auth.zip`. The GitHub URL provided separately returned 404 to this review, so I could not verify whether the uploaded ZIP exactly matches the current remote branch. No production environment or database was accessed or changed.

The source matches the audit's main architecture: React 19/Vite/TypeScript SPA, FastAPI/Pydantic API, MongoDB via Motor, relative `/api` calls, and browser-generated PDFs. There is no server-side PDF/file store or user authentication in the original source snapshot. Logos are base64 data stored in the MongoDB company profile. The business data is a shared workspace; current quote records have no employee/owner partition. Entra roles therefore control access/actions across the whole company's quote workspace.

The audit's Emergent dependency list is corroborated by `frontend/vite.config.ts`, two Emergent npm packages in `frontend/package.json`, `emergentintegrations` in `backend/requirements.txt`, an unused Emergent splash page, and Emergent-specific project metadata/docs. The Vite plugins and npm dependencies and Python integration package have been removed in this working copy. The source tree still contains historical Emergent references in scaffold docs/metadata and the unused `frontend/src/pages/Home.tsx`; remove or archive those before treating the repository as the clean independent-hosting source.

The audit is a point-in-time report, not confirmation of a completed production deployment. It explicitly says the rollout was asynchronous. Verify current production hosting, MongoDB contents, DNS/SSL, and any existing backups with the current platform before planning a production data copy.

One current lifecycle issue: the repository uses Motor 3.7.1. MongoDB now recommends moving Motor applications to PyMongo Async; Motor was deprecated on May 14, 2026. Make that a planned source change before launch, review the small driver API differences, and then test the complete quote/profile flows. [MongoDB migration guide](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)

## Target design

- **Web app:** Azure Static Web Apps (Vite output) on a domain you own, for example `quotes.example.com`.
- **API:** Azure App Service running FastAPI on a separate host such as `api-quotes.example.com`.
- **Database:** a managed MongoDB Atlas deployment in a region selected for your business/data requirements.
- **Identity:** your workforce Microsoft Entra tenant. The SPA gets a delegated `access_as_user` token; FastAPI validates signature, issuer, tenant, API audience, SPA actor, scope, and app role.
- **Network:** HTTPS everywhere. Set API CORS to the exact SPA origin. Keep MongoDB restricted to the API's approved network path/IPs; do not expose a broad public database allowlist.
- **Deployments:** GitHub Actions deploys only after review and verification. Use Azure's GitHub/OIDC connection where available; otherwise store its deployment credential in a protected GitHub Environment, never in the repository.

The frontend and API can use separate subdomains. This requires the exact SPA origin in `CORS_ORIGINS`; it does not require putting a database URL or secret in browser code. Azure Static Web Apps supports custom domains and managed certificates; Azure App Service supports custom domain bindings. Confirm domain/DNS control and region choices before creating production resources. [Static Web Apps custom domains](https://learn.microsoft.com/azure/static-web-apps/custom-domain), [App Service custom domains](https://learn.microsoft.com/en-us/azure/app-service/overview-custom-domains)

## Phased migration

### 0. Preserve current state and confirm Entra setup

1. Keep the existing Emergent deployment and database untouched as the recovery source.
2. Work from the `feature/entra-auth` branch. Compare its tree with this ZIP after making the archive available locally; do not assume they are identical.
3. Keep the API and SPA app registrations already created. Record the tenant ID, API client ID, SPA client ID, `api://<API client ID>/access_as_user` scope, and role values in a password manager or deployment settings. These IDs are configuration values, not secrets.
4. Before public launch, add the final HTTPS SPA URL as a **SPA** redirect URI and logout return URL in the SPA registration. Keep localhost only for development. Leave implicit/hybrid token issuance disabled.
5. Assign employees/groups to the API Enterprise Application with `Quote.Admin` or `Quote.Editor`. The SPA and API are separate app registrations; make assignments on the API enterprise app.

### 1. Clean and prepare source

1. Remove/archive `.emergent` metadata, Emergent-only scaffold instructions in `TEMPLATE.md`/`README.md`, and the unused Emergent `Home.tsx` splash page. Keep application assets and business code.
2. Keep `frontend/vite.config.ts` on ordinary Vite/React/Tailwind plugins; this copy has removed Emergent Vite hooks. Confirm no build-time or runtime import still points to Emergent.
3. Remove unused `emergentintegrations` and `@emergentbase/*` packages; this copy has removed those package references. Regenerate and commit the package-manager lockfile with the chosen package manager. The ZIP had no frontend lockfile, so reproducible dependency resolution still needs to be established.
4. Replace Motor with `pymongo.AsyncMongoClient` in `backend/lib/db.py`, update `backend/requirements.txt`, then validate query/index/close behavior. This is a code change separate from changing the MongoDB provider.
5. Keep `.env.example` files tracked and real `.env` files ignored. Do not put credentials in Vite `VITE_*` variables.

### 2. Establish a clean production build

1. Build the Vite SPA and serve the generated static output from Static Web Apps. Configure SPA fallback so direct loads/refreshes at `/quotes/new` and `/quotes/:id` return `index.html`.
2. Run FastAPI under the host's production ASGI command (Uvicorn/Gunicorn worker configuration as appropriate), with a health endpoint separate from protected business routes and logs sent to the host's monitoring service.
3. Configure `/api` routing to the API host. Since the current frontend calls relative `/api/...`, either configure a Static Web Apps route/proxy or change the frontend API base to the HTTPS API origin and add that origin to CORS. Pick one routing design and use it consistently; don't leave production pointed at Vite's localhost proxy.
4. Add the MSAL dependencies already introduced in the working copy to the generated lockfile and deploy preview, not production.

### 3. Provision and migrate MongoDB

1. Create a separate Atlas deployment and a least-privilege application database user. Save the Atlas connection string as a backend secret. Match the source database name and inspect all collections/indexes before migration.
2. Confirm the source MongoDB version, size, authentication/network access, collections (`quotes`, `company_profiles`, and any other live collections), indexes, backups, and embedded logo fields. Verify which data is production data versus test/demo content.
3. Take and verify a restorable source backup first. Perform an initial restore into a non-production Atlas database and compare collection counts, key fields, dates, quote calculations, indexes, and logo rendering.
4. Choose the final copy method after confirming source topology and downtime tolerance. `mongodump`/`mongorestore` is appropriate for a small source with an agreed write freeze; live migration needs compatible replica-set/topology and access. MongoDB documents that writes made after a dump are not included unless using an appropriate oplog/live migration process. Do not run a production restore/cutover as part of this phase. [Atlas seed with mongorestore](https://www.mongodb.com/docs/atlas/import/mongorestore/), [Atlas migration options](https://www.mongodb.com/docs/atlas/architecture/current/migration/)

### 4. Finish Entra SPA/API authentication and roles

The uploaded source had no authentication. This working copy adds the initial Entra integration:

- `frontend/src/lib/entra.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/session.ts`, and `frontend/src/lib/authorization.ts` handle MSAL setup, token acquisition, sign-in/out, `/api/me`, and role-aware UI.
- `backend/lib/auth.py` validates signed delegated tokens against the tenant's signing keys and checks tenant, API audience, SPA client (`azp`), `access_as_user` scope, and role claims.
- `backend/server.py`, `backend/routers/quotes.py`, and `backend/routers/company_profile.py` require authentication/roles at the API boundary. Admin can delete quotes and edit the shared company profile; Admin and Editor can read/create/edit quotes and update quote status.
- `frontend/src/pages/Dashboard.tsx` hides Admin-only actions for Editors. API checks remain authoritative if a user bypasses the UI.

Before launch, confirm exact role values in Entra match `Quote.Admin` and `Quote.Editor`. This is a single-company shared data model: every authorized employee can read all quotes. If quotes must be private by owner/team, add server-side ownership/tenant fields and query filters as a separate product/security requirement before production.

### 5. Configure hosting, DNS, and secrets

Set these backend App Service settings:

| Setting | Value/source | Secret? |
|---|---|---|
| `MONGO_URL` | Atlas connection string with app DB credentials | **Yes** |
| `DB_NAME` | Actual target app database name | No |
| `ENTRA_TENANT_ID` | Workforce tenant ID | No |
| `ENTRA_API_CLIENT_ID` | API app registration client ID | No |
| `ENTRA_SPA_CLIENT_ID` | SPA app registration client ID | No |
| `CORS_ORIGINS` | Exact production SPA origin, e.g. `https://quotes.example.com` | No |

Set these SPA build variables in Static Web Apps/GitHub deployment environment:

| Setting | Value/source | Secret? |
|---|---|---|
| `VITE_ENTRA_TENANT_ID` | Same workforce tenant ID | No |
| `VITE_ENTRA_SPA_CLIENT_ID` | SPA client ID | No |
| `VITE_ENTRA_API_CLIENT_ID` | API client ID | No |
| `VITE_ENTRA_API_SCOPE` | `api://<API client ID>/access_as_user` | No |

No Entra client secret is required for this SPA + delegated bearer-token API design. Never expose the Atlas password/URI as `VITE_*`. Add the production SPA origin to the SPA app registration, bind both owned DNS names, enable HTTPS/certificates, and verify the API allowlist can reach Atlas.

### 6. Verify on a non-production deployment

Run checks before any production data copy: signed-out request rejected; wrong tenant/audience/client/scope rejected; assigned Admin and Editor succeed; unassigned employee gets denied; Editor cannot delete or change company profile; Admin can; CRUD and status update persist; PDF generation/download works; reload/deep links work; CORS allows only the SPA origin; sign-out clears cached quote data; expired tokens recover; Atlas backup/restore is demonstrably usable. Confirm logs do not contain bearer tokens, Mongo credentials, or quotation content beyond operational need.

### 7. Cut over with a rollback window

1. Announce a short maintenance window and stop quote writes in the current app.
2. Take a final source backup and record collection counts. Restore the final snapshot into Atlas; verify counts and sample records before switching.
3. Deploy the API with Atlas and Entra settings; deploy the SPA with final MSAL identifiers/redirect URLs. Smoke test on the Azure-provided hostnames first.
4. Add the final custom SPA redirect URI, verify both hostnames over HTTPS, then change DNS. Keep the old app and source database available but read-only during the agreed observation period.
5. Roll back DNS and backend configuration to the old service if login, API calls, data integrity, or PDF generation fails. If any new quotes were written to Atlas, freeze both sides and reconcile those records before restoring writes to the old source; never blindly overwrite newer data with an old dump.
6. After sign-off, confirm scheduled backups/retention and access, then retire the old host only after a recovery snapshot has been verified and the owner approves closure.

## Current working-copy configuration files

- `backend/.env.example`: Mongo URL/database, CORS, and Entra IDs.
- `frontend/.env.example`: public Entra identifiers and delegated API scope.
- `frontend/src/lib/entra.ts`: defaults the API scope to `api://<API client ID>/access_as_user`.
- Keep production values only in Azure App Service settings / Static Web Apps and protected GitHub Environment settings. Do not send credentials in chat or commit them.

## Completion boundary

The working copy has authentication and role enforcement changes prepared, but it has **not been built, tested, deployed, connected to the live database, or used to migrate data**. Do not treat it as production-ready until the verification phase passes and the deployment configuration has been confirmed against the actual Entra registrations.
