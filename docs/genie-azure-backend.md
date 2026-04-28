# Genie Azure-Hosted Backend v1

## Goal

Preserve the current Genie mock API contract while moving recommendation serving into Azure Functions.

## Recommended hosted structure

### Version 1: hosted mock-compatible backend

Use Azure Functions as the HTTP layer and keep the current recommendation contract unchanged.

Files:
- `src/functions/genieRecommendations.ts`
- `src/functions/genieHealth.ts`
- `src/services/genie/GenieRecommendationService.ts`
- `src/services/genie/GenieCatalog.ts`
- `src/services/genie/GenieConfig.ts`
- `src/model/genie/genieModels.ts`

Responsibilities:
- normalize request query parameters
- run deterministic recommendation scoring
- return the same envelope and `displayItems` structure as the current mock API
- expose a simple health route for smoke tests and monitoring

### Future production-ready backend

Add a provider-oriented service layer behind the same HTTP contract.

Recommended next files later:
- `src/services/genie/providers/ProductCatalogProvider.ts`
- `src/services/genie/providers/UserProfileProvider.ts`
- `src/services/genie/providers/PricingProvider.ts`
- `src/services/genie/providers/TelemetryService.ts`
- `src/services/genie/providers/AuthContextService.ts`

## Route mapping

Current mock route to hosted Azure Function mapping:

- `GET /api/products/recommendations`
  - mock: `genie-api-server.js`
  - hosted: `src/functions/genieRecommendations.ts`
- `GET /api/health`
  - mock: `genie-api-server.js`
  - hosted: `src/functions/genieHealth.ts`

## Preferred local backend path

For local Teams/Copilot validation, prefer the Azure Functions host on `http://localhost:7071`.

- preferred local backend: Azure Functions on `7071`
- fallback local backend: mock server on `7072`

Reason:
- the Teams Toolkit local debug flow already starts the Function host
- the OpenAPI contract maps directly to the Function routes
- this is the lowest-risk path for validating Azure readiness without changing the public contract

## Config model

### Local Azure Functions config

Use `local.settings.json` for local Function host values.

Recommended values:
- `FUNCTIONS_WORKER_RUNTIME=node`
- `GENIE_SERVICE_NAME=genie-functions-api`
- `GENIE_MODE=hosted-mock-compatible`
- `GENIE_VERSION=v1`
- `GENIE_SHOP_BASE_URL=https://www.ulta.com`

### Azure app settings

Use Function App application settings with the same keys.

Required for the Function host:
- `AzureWebJobsStorage`
- `FUNCTIONS_EXTENSION_VERSION`
- `FUNCTIONS_WORKER_RUNTIME`
- `WEBSITE_RUN_FROM_PACKAGE`
- `WEBSITE_NODE_DEFAULT_VERSION`

Recommended for Genie:
- `GENIE_SERVICE_NAME`
- `GENIE_MODE`
- `GENIE_VERSION`
- `GENIE_SHOP_BASE_URL`

Local legacy sample compatibility only:
- `STORAGE_ACCOUNT_CONNECTION_STRING`

### OpenAPI server URL

Keep `appPackage/genie-definition.json` as the source of truth for the API contract.

- local mock demo: set `OPENAPI_SERVER_URL` to the dev tunnel that fronts `genie-api-server.js`
- preferred local hosted test: set `OPENAPI_SERVER_URL` to the dev tunnel that fronts the Function host on `7071`
- hosted Azure backend: set `OPENAPI_SERVER_URL` to the Function App base URL

That means the declarative agent package can point either to the local mock API or the hosted Function App without changing the contract file itself.

## Repo guidance

### Keep in current repo

- declarative agent package files in `appPackage/`
- hosted Azure Functions under `src/functions/`
- shared Genie service/model files under `src/services/genie/` and `src/model/genie/`
- local mock server for host-UX iteration

### Refactor later

- remove contract duplication between `genie-api-server.js` and hosted TypeScript service by moving both onto a single shared core module
- isolate production provider integrations behind interfaces
- add auth context, telemetry, and data providers after hosting is stable

## Deployment notes

## Current deployment assets

The repo already includes the minimum Azure deployment spine:

- infrastructure: `infra/azure.bicep`
- infra parameters: `infra/azure.parameters.json`
- provision flow: `teamsapp.yml` `provision`
- zip deploy flow: `teamsapp.yml` `deploy`
- OpenAPI server indirection: `appPackage/genie-definition.json`
- environment output persistence: `env/.env.dev`

## Minimum viable hosted deployment

Use the existing Teams Toolkit flow and keep the current API contract unchanged.

1. Review the target environment file in `env/.env.dev`.
   - The committed `dev` file may still contain earlier sample-oriented Azure names such as old resource groups or `sme...` Function App values.
   - If you want a clean Genie deployment identity, create or use a fresh environment instead of reusing those values blindly.
2. Run `teamsapp provision --env dev`.
3. Run `teamsapp deploy --env dev`.
4. Confirm `env/.env.dev` contains the deployed Function App URL in `OPENAPI_SERVER_URL`.
5. Rebuild/update the Teams app package using the `dev` environment.
6. Reinstall or refresh the app in Teams/M365 if the host is still using cached package metadata.

This path preserves:
- the current `GET /api/health` route
- the current `GET /api/products/recommendations` route
- the current declarative-agent plugin contract
- the current Adaptive Card rendering behavior

For the first Genie deployment, the cloud provision path is intentionally simplified:
- only the Function App storage account is provisioned
- the legacy sample database seed step is removed from cloud provision
- legacy sample storage is no longer required for Genie hosting
- the hosting plan is a Basic App Service plan (`B1`) instead of Windows Consumption
- the Function App no longer depends on `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING`

## Manual vs automated steps

### Already automated in the repo

- Azure resource provisioning through `infra/azure.bicep`
- Azure Functions zip deployment through `teamsapp.yml`
- environment-specific ARM deployment naming through `teamsapp.yml`
- `OPENAPI_SERVER_URL` output from infrastructure
- Teams app package build/update flow
- Azure app settings for:
  - Function runtime settings
  - `GENIE_SERVICE_NAME`
  - `GENIE_MODE`
  - `GENIE_VERSION`
  - `GENIE_SHOP_BASE_URL`

### Manual Azure-side steps

- choose the target Azure subscription
- choose or create the target resource group
- decide whether to reuse `env/.env.dev` or create a fresh deployment environment
- sign in to Teams Toolkit / Azure
- run `teamsapp provision --env <env>`
- run `teamsapp deploy --env <env>`
- verify the deployed endpoints in the browser or with `curl`
- rebuild/reinstall the Teams package if required by host caching

## Provision retry notes

If a first provision attempt partially succeeded and only the Teams app was created:

1. Keep the generated `TEAMS_APP_ID` in the target environment file unless you explicitly want a brand-new app identity.
2. Re-run provision after fixing the infrastructure workflow.
3. If you want a completely clean retry, clear the generated Azure output values in the target environment file:
   - `API_FUNCTION_ENDPOINT`
   - `API_FUNCTION_RESOURCE_ID`
   - `OPENAPI_SERVER_URL`
   - `M365_TITLE_ID`
   - `M365_APP_ID`

The ARM deployment name is now environment-specific, which removes the old sample-oriented `Create-resources-for-sme` assumption from the provision path.

## Storage share 403 notes

The original repo template used a Windows Consumption-style Function App configuration, which implicitly depended on Azure Files through `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING`.

That dependency is a poor fit when the tenant appears unable to create or mount Azure file shares reliably.

The first Genie Azure deployment path now avoids that dependency by using a Basic App Service plan (`B1`) with zip deployment.

If deployment still fails after this change, the issue is no longer the old Azure Files-backed Functions pattern and should be investigated as a more general App Service or storage provisioning problem.

Manual Azure Portal checks:

1. Open the generated Function storage account (`<resourceBaseName>api`).
2. Check `Networking`:
   - `Public network access` should allow the Function App creation path.
   - If firewall rules or selected networks are enforced, Windows Consumption deployment can fail.
3. Check `Configuration`:
   - verify shared key access is allowed if your organization uses storage-account hardening policies.
4. Check `File shares`:
   - confirm whether you can manually create a file share in that storage account.
   - if manual file share creation is blocked, the Function App ARM deployment will also fail.
5. Check `Activity log` and `Deployments` on the resource group:
   - inspect the failed `Microsoft.Web/sites` operation
   - inspect any policy-deny details attached to the storage account or Function App creation
6. Check Azure Policy assignments on the subscription or resource group:
   - storage accounts with restricted public access
   - policies that deny shared key access
   - policies that restrict Azure Files or storage networking for App Service / Functions

## Workaround options

### Lowest-risk current workaround

Use a Dedicated App Service plan for Genie.

Why:
- keeps the current Teams Toolkit provision/deploy flow
- keeps zip deployment
- avoids the Azure Files content-share dependency used by the prior Consumption-style template
- preserves the current Genie contract and agent behavior

Tradeoff:
- higher fixed cost than Consumption/Flex

### Better long-term serverless option

Move Genie to Flex Consumption.

Why:
- Flex Consumption doesn't require the Azure Files content-share settings used by Windows Consumption
- aligns better with a serverless hosted API

Tradeoff:
- requires a more substantial repo change
- current Teams Toolkit `azureFunctions/zipDeploy` path would need to be reworked to a Flex-compatible deployment flow

## Local-to-Azure transition

Local validation uses:
- `OPENAPI_SERVER_URL=https://<devtunnel-host>`

Hosted Azure validation uses:
- `OPENAPI_SERVER_URL=https://<function-app>.azurewebsites.net`

No OpenAPI file change is required because `appPackage/genie-definition.json` already resolves the server URL from environment.

## OPENAPI_SERVER_URL and Teams package update

After Azure provision:

1. Confirm `env/.env.dev` has the Azure Function App base URL in `OPENAPI_SERVER_URL`.
2. Rebuild the app package with the `dev` environment.
3. Update or reinstall the app package in Teams/M365.
4. Start a fresh chat/session if the old local tunnel URL appears to be cached.

## Smoke tests after deployment

1. Health:
   - `GET https://<function-app>.azurewebsites.net/api/health`
2. Recommendation success:
   - `GET https://<function-app>.azurewebsites.net/api/products/recommendations?skinType=dry&preference=dewy&limit=3`
3. Recommendation fallback:
   - `GET https://<function-app>.azurewebsites.net/api/products/recommendations?brand=unknown-brand&finish=matte&maxPrice=10`
4. Teams/M365 validation:
   - ask for dewy products for dry skin
   - ask for matte options for oily skin
   - ask for a deliberately narrow no-results query

## Next-step production improvements

- move away from sample-biased infra naming and environment values
- add Application Insights / telemetry
- add auth context and request tracing
- replace static mock catalog data with provider-backed services
- separate Genie deployment assets from legacy sample infrastructure once Azure hosting is stable

## Testing

### Local hosted-function testing

1. Run `npm run build`.
2. Run `npm start` or `func start`.
3. Test:
   - `GET http://localhost:7071/api/health`
   - `GET http://localhost:7071/api/products/recommendations?skinType=dry&preference=dewy&limit=3`

### Azure testing

1. Deploy the Function App.
2. Hit:
   - `GET https://<function-app>.azurewebsites.net/api/health`
   - `GET https://<function-app>.azurewebsites.net/api/products/recommendations?skinType=dry&preference=dewy&limit=3`
3. Point `OPENAPI_SERVER_URL` at the Function App.
4. Rebuild/reinstall the Teams app package and validate the Genie host flow.
