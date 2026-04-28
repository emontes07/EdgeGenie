# Edgewell Sales Genie

Edgewell Sales Genie is a declarative Microsoft 365 Copilot / Teams demo for Edgewell Personal Care field sellers.

This refactor keeps the existing architecture, endpoints, OpenAPI wiring, and plugin flow intact while shifting the experience from a consumer advisor to a B2B retail sales assistant.

## Repo layout

- `appPackage/`
  - Teams manifest, declarative agent definition, plugin config, and OpenAPI contract.
- `genie-api-server.js`
  - Local mock API entry point.
- `src/genie/mock/`
  - Mock Edgewell catalog and recommendation engine for isolated local testing.
- `src/functions/`, `src/services/`, `src/model/`
  - Hosted Azure Functions path and shared service/model code.
- `docs/`
  - Architecture and Azure-hosting notes retained from the original project scaffold.

## Edgewell Sales Genie Demo

Edgewell Sales Genie is a field sales assistant concept. It is designed to help Edgewell sellers quickly pull together brand positioning, retail talking points, bundle ideas, and concise buyer-ready pitches without changing the existing API contract.

Sample prompts:

- `How do I position Schick vs Gillette?`
- `What should I pitch for a summer promotion?`
- `Give me talking points for Banana Boat at Walmart.`
- `What bundle should I recommend for back-to-school?`
- `Create a short retail buyer pitch for an Edgewell assortment.`
- `Which Edgewell items should I use for a Father's Day display?`

## Local demo

### Preferred local backend: Azure Functions on `7071`

```bash
npm run hosted:start
```

Useful endpoints:

- `GET /api/health`
- `GET /api/products/recommendations`

Example:

```bash
curl "http://localhost:7071/api/products/recommendations?brand=schick&concerns=competitive%20positioning&preference=walmart&limit=3"
```

### Mock fallback backend: `7072`

```bash
npm run mock:start
```

The mock API listens on `http://localhost:7072`.

## What changed

- Rebranded the app experience to `Edgewell Sales Genie`.
- Replaced the mock catalog with Edgewell-style field sales products across razors, shave prep, sun care, hygiene, and grooming.
- Kept the response envelope and endpoint structure unchanged:
  - `requestId`
  - `status`
  - `results.summary`
  - `results.products`
  - `results.displayItems`
  - `results.refinements`
- Enriched product and card content with:
  - `brand`
  - `keyBenefits`
  - `competitivePositioning`
  - `retailerContext`
  - `bundleIdeas`
  - `talkingPoints`
  - `objectionHandling`
  - `seasonality`
  - `suggestedPitch`
- Updated Adaptive Card output to emphasize talking points, competitive angle, and suggested retail pitch.
- Updated declarative-agent prompts, OpenAPI descriptions, and sample requests for seller-focused flows.

## Current response shape

```json
{
  "requestId": "uuid",
  "status": "success",
  "results": {
    "status": "success",
    "generatedAt": "2026-04-28T00:00:00.000Z",
    "query": {},
    "summary": {},
    "products": [],
    "displayItems": [],
    "refinements": [],
    "errors": []
  }
}
```

The envelope is unchanged. `products` remains the durable data model and `displayItems` remains the Adaptive Card-facing model.

## Testing steps

1. Run `npm run build`.
2. Run `npm run hosted:start`.
3. Verify `http://localhost:7071/api/health` returns `status: ok`.
4. Verify recommendation responses for:
   - `brand=schick&concerns=competitive positioning&preference=walmart`
   - `brand=banana boat&concerns=summer promotion&preference=walmart`
   - `concerns=back-to-school&preference=bundle`
   - a no-results request such as `brand=unknown-brand&finish=matte&maxPrice=10`
5. Optionally run `npm run mock:start` and compare the same response patterns on `7072`.

## What remains intentionally unchanged

- Existing routes and endpoint paths.
- The OpenAPI/plugin wiring.
- The local Teams/Copilot packaging structure.
- The Azure Functions scaffold and deployment files.
- The local ability to run both hosted and mock backends without adding dependencies.
