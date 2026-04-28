# Genie Architecture Audit and Modernization Plan

## Current state

This repo currently contains two overlapping app shapes:

1. A working Azure Functions + Azure Table Storage prototype for a consulting/staffing scenario.
   - API handlers: `src/functions/*.ts`
   - Services/models: `src/services/*.ts`, `src/model/*.ts`
   - Seed data and infra: `scripts/db/*`, `infra/*`
2. A partially rewritten Microsoft 365 Copilot declarative agent for the current Genie beauty recommendation demo.
   - Manifest and agent definition: `appPackage/manifest.json`, `appPackage/genie-declarative-agent.json`
   - Plugin/OpenAPI: `appPackage/genie-plugin.json`, `appPackage/genie-definition.json`
   - Local mock API: `genie-api-server.js`

The local beauty demo path exists, but the repo is not yet coherent because the declarative agent layer and the Azure Functions backend describe different domains.

## What should stay

These parts are worth preserving because they already provide useful structure or working behavior:

- `src/functions/*.ts`
  - Keep as the legacy prototype backend and Azure Functions reference implementation.
  - The routing, table-backed services, and deployment scaffolding are a useful hosting baseline.
- `src/services/*.ts`
  - Keep the layered service approach. The separation between HTTP handlers, API services, and persistence services is sound.
- `infra/azure.bicep` and `teamsapp*.yml`
  - Keep as the first Azure-hosting path, but treat them as platform scaffolding rather than finalized production infrastructure.
- `appPackage/*`
  - Keep the declarative agent packaging model and relative file references.
- `genie-api-server.js`
  - Keep the local mock API entry point so the demo run command and tunnel-based setup remain familiar.

## What should be refactored

- Domain split
  - The repo needs an explicit boundary between `legacy prototype backend` and `Genie declarative agent demo`.
- API contract
  - The current OpenAPI response model is too shallow for rich Adaptive Cards.
- Adaptive Card template
  - The current card is a single repeated product layout with limited metadata and no no-results/comparison experience.
- Mock data and response builder
  - The mock API should stop generating mostly-random cards and instead return structured recommendation rationale and predictable display items.
- Environment/config guidance
  - The docs and sample env guidance do not match the actual repo layout.
- Error handling
  - The local mock API should return stable envelopes with request IDs and actionable error messages.

## Recommended Genie architecture

Use a three-layer structure while preserving the existing local demo path.

### 1. Experience layer

Files:
- `appPackage/manifest.json`
- `appPackage/genie-declarative-agent.json`
- `appPackage/genie-plugin.json`
- `appPackage/genie-definition.json`

Responsibilities:
- agent instructions
- conversation starters
- plugin action definitions
- Adaptive Card templates
- OpenAPI binding

### 2. Genie API layer

Safe-now local implementation:
- `genie-api-server.js`
- `src/genie/mock/*`

Future Azure-hosted implementation:
- new `src/functions/genieRecommendations.ts`
- new `src/services/genie/*`

Responsibilities:
- request normalization
- recommendation scoring/ranking
- response envelope creation
- card-ready view model generation
- health/status endpoints

### 3. Data/provider layer

Safe-now local implementation:
- mock catalog in `src/genie/mock/*`

Future Azure-hosted implementation:
- Azure Table/Cosmos/SQL backed catalog and profile providers
- optional Azure AI Search / retrieval augmentation
- optional user profile enrichment provider

Responsibilities:
- product catalog lookup
- user preference/profile lookup
- inventory/pricing/promotions integration
- telemetry and experimentation data

## Recommended response model

The API should return both raw recommendation data and card-ready display items.

```json
{
  "requestId": "uuid",
  "status": "success",
  "results": {
    "status": "success",
    "generatedAt": "2026-03-07T00:00:00.000Z",
    "query": {
      "skinType": "dry",
      "concerns": ["dark spots"],
      "preference": "dewy"
    },
    "summary": {
      "headline": "Top picks for dry skin with a dewy finish",
      "recommendationReason": "These picks emphasize hydration, barrier support, and luminous finish.",
      "appliedFilters": ["dry skin", "dewy finish"],
      "resultCount": 3
    },
    "products": [],
    "displayItems": [],
    "refinements": [],
    "errors": []
  }
}
```

Key design rule:
- `products` is the durable data contract.
- `displayItems` is the UI contract for Adaptive Cards.

That split keeps the API maintainable when cards evolve.

## Adaptive Card design recommendations

### Safe to implement now

- Richer single-product cards
  - product image
  - brand + category line
  - recommendation reason text
  - badges and tags
  - current/original price with savings text
  - rating + review count
  - quick facts such as skin type, finish, and key ingredient
- Comparison summary card
  - a separate display item rendered ahead of product cards when there are at least two strong matches
- No-results fallback card
  - explain why nothing matched
  - offer refinements and browse links
- Refinement support
  - expose clickable `Action.OpenUrl` links for category browsing or search landing pages
  - keep conversational refinement buttons as a future-state item if the host adds stronger action support

### Best after Azure hosting

- True multi-step refinement cards with stateful action handling
- Inventory-aware pricing and promotions
- User-aware personalization from profile/history
- Real comparison cards generated from a ranking/explanation service
- Telemetry-driven ranking experiments and A/B card variants

## Safe to implement now

- richer OpenAPI schema
- better agent instructions
- richer Adaptive Card template
- deterministic mock catalog and recommendation reason text
- health endpoint
- stable error envelope with request IDs
- updated README and architecture notes

## Best after Azure hosting

- move Genie API from mock server into Azure Functions
- add managed identity / secure downstream API auth
- add Azure App Configuration / Key Vault
- replace static mock catalog with real provider integrations
- add structured logging, telemetry, and monitoring
- separate legacy prototype data model from Genie production domain model

## Risks and assumptions

- The Teams package now uses `genie-*` filenames consistently, but changing those file paths and IDs means hosts may continue to cache older package metadata until the app package is rebuilt and reinstalled.
- The legacy staffing prototype remains in the repo and may confuse future contributors unless the split is documented clearly.
- Declarative agent Adaptive Card capabilities vary by host surface. `Action.OpenUrl` is the safest current action type to rely on.
