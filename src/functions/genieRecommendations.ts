import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GenieRecommendationService from "../services/genie/GenieRecommendationService";
import { ErrorEnvelope, RecommendationResponseEnvelope } from "../model/genie/genieModels";

interface RecommendationResponse extends HttpResponseInit {
  status: number;
  jsonBody: RecommendationResponseEnvelope | ErrorEnvelope;
}

function collectQuery(req: HttpRequest): Record<string, unknown> {
  return {
    age: req.query.get("age") || undefined,
    gender: req.query.get("gender") || undefined,
    skinType: req.query.get("skinType") || undefined,
    concerns: req.query.getAll("concerns").length > 0 ? req.query.getAll("concerns") : req.query.get("concerns") || undefined,
    preference: req.query.get("preference") || undefined,
    brand: req.query.get("brand") || undefined,
    minPrice: req.query.get("minPrice") || undefined,
    maxPrice: req.query.get("maxPrice") || undefined,
    finish: req.query.get("finish") || undefined,
    limit: req.query.get("limit") || undefined,
  };
}

export async function genieRecommendations(req: HttpRequest, context: InvocationContext): Promise<RecommendationResponse> {
  context.log("HTTP trigger function genieRecommendations processed a request.");

  try {
    const response = GenieRecommendationService.buildRecommendationsResponse(collectQuery(req));
    return {
      status: 200,
      jsonBody: response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 500,
      jsonBody: GenieRecommendationService.buildErrorResponse(500, "Unexpected hosted Genie recommendation failure.", message),
    };
  }
}

app.http("genieRecommendations", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "products/recommendations",
  handler: genieRecommendations,
});
