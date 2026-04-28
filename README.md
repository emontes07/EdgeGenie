# Genie Beauty Advisor

Genie is the next-generation declarative Microsoft 365 Copilot / Teams agent in this repo.

The repo currently contains two layers:

- `Genie declarative agent demo`: the active beauty recommendation experience used for local demo flows.
- `Legacy Azure Functions prototype`: the earlier consulting/staffing sample that still provides useful Azure Functions, storage, and deployment scaffolding.

This update keeps the local beauty demo path intact while making the agent contract, mock API, and card model more maintainable.

## Repo layout

- `appPackage/`
  - Teams manifest, declarative agent definition, plugin config, and OpenAPI contract.
- `genie-api-server.js`
  - Local Genie mock API entry point.
- `src/genie/mock/`
  - Mock catalog and recommendation response builder for the Genie experience.
- `src/functions/`, `src/services/`, `src/model/`
  - Legacy Azure Functions prototype kept for future Azure-hosting evolution.
- `docs/genie-architecture.md`
  - Audit, recommended architecture, safe-now changes, and Azure migration notes.

## Local demo

### Preferred local backend: Azure Functions on 7071

This is the preferred local backend path for Teams/Copilot validation because it exercises the hosted Genie implementation while preserving the current API contract.

### 1. Start the Genie hosted local backend

```bash
npm run hosted:start
```

The hosted local API listens on `http://localhost:7071`.

Useful endpoints:

- `GET /api/health`
- `GET /api/products/recommendations`

Example:

```bash
curl "http://localhost:7071/api/products/recommendations?skinType=dry&concerns=dark%20spots&preference=dewy"
```

### 2. Expose the API with dev tunnel

```bash
devtunnel create genie-api-tunnel -a
devtunnel port create -p 7071 --protocol http
devtunnel host genie-api-tunnel
```

### 3. Point Teams Toolkit at the tunnel

Set `OPENAPI_SERVER_URL` in `env/.env.local` to your tunnel URL.

Example:

```env
OPENAPI_SERVER_URL=https://<your-devtunnel-id>-7071.usw2.devtunnels.ms
```

### 4. Launch the Teams app experience

Use the existing Teams Toolkit workflow for the app package and local app launch.

### Mock fallback backend: 7072

Keep the mock server for isolated API/card iteration or regression comparison.

```bash
npm run mock:start
```

The mock API listens on `http://localhost:7072`.

## What changed in Genie

- Better agent instructions for concise, practical recommendation quality.
- Richer OpenAPI schema with explicit `products`, `displayItems`, `summary`, and `refinements` sections.
- Adaptive Cards that can render:
  - richer product cards
  - comparison cards
  - no-results fallback cards
- Deterministic mock data with recommendation reasons, badges, tags, and pricing context.
- Stable error envelopes and a health endpoint.
- Architecture documentation that separates safe-now work from Azure follow-up.

## Current recommendation response shape

```json
{
  "requestId": "uuid",
  "status": "success",
  "results": {
    "status": "success",
    "generatedAt": "2026-03-07T00:00:00.000Z",
    "query": {},
    "summary": {},
    "products": [],
    "displayItems": [],
    "refinements": [],
    "errors": []
  }
}
```

`products` is the durable data model.

`displayItems` is the UI-oriented model used by the Adaptive Card template.

## What remains intentionally unchanged

- The legacy Azure Functions prototype under `src/functions/` still works as its own baseline.
- The declarative agent package now uses `appPackage/genie-*.json` filenames consistently.
- Azure infrastructure files remain as the current hosting scaffold until Genie moves from the mock API to Azure-hosted runtime logic.

## Testing steps

1. Run `npm run build`.
2. Run `npm run hosted:start`.
3. Verify `http://localhost:7071/api/health` returns `status: ok`.
4. Verify recommendation responses for:
   - a normal request
   - a request with tighter price or finish filters
   - a no-results request such as an exact brand plus restrictive finish/price
5. Set `OPENAPI_SERVER_URL` to the `7071` tunnel URL and refresh the Teams app package.
6. Optionally run `npm run mock:start` and compare the same recommendation responses on `7072` if you want a regression baseline.

## Azure migration direction

The recommended future path is:

1. Move Genie recommendation logic into a dedicated Azure Function.
2. Keep the `displayItems` response layer so card evolution does not break the core product schema.
3. Introduce real provider integrations for pricing, catalog, inventory, and profile enrichment.
4. Add App Configuration, Key Vault, telemetry, and monitoring after the API is hosted in Azure.

See `docs/genie-architecture.md` for the full audit and migration notes.
See `docs/genie-azure-backend.md` for the first hosted Azure Functions backend structure that preserves the current Genie API contract.

## First Azure deployment

For the first real hosted Genie deployment, use the existing Teams Toolkit Azure Functions path and keep the current OpenAPI contract unchanged.

The repo now defaults that first hosted deployment to a Basic App Service plan (`B1`) rather than the older Windows Consumption-style template. This avoids the Azure Files content-share dependency that can block deployment in restricted tenants while preserving the current API contract and Teams agent behavior.

High-level steps:

1. Review `env/.env.dev` and confirm you want to use that environment or create a fresh one.
2. Run `teamsapp provision --env dev`.
3. Run `teamsapp deploy --env dev`.
4. Verify the deployed Function App:
   - `GET https://<function-app>.azurewebsites.net/api/health`
   - `GET https://<function-app>.azurewebsites.net/api/products/recommendations?skinType=dry&preference=dewy&limit=3`
5. Confirm `OPENAPI_SERVER_URL` now points at the Azure Function App URL in the target environment file.
6. Rebuild/update the Teams app package so the declarative agent uses the Azure-hosted backend instead of the local tunnel.

See `docs/genie-azure-backend.md` for the detailed local-to-Azure transition steps, required app settings, smoke tests, and manual versus automated deployment steps.
