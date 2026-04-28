import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GenieRecommendationService from "../services/genie/GenieRecommendationService";
import { HealthResponse } from "../model/genie/genieModels";

interface HealthHttpResponse extends HttpResponseInit {
  status: number;
  jsonBody: HealthResponse;
}

export async function genieHealth(req: HttpRequest, context: InvocationContext): Promise<HealthHttpResponse> {
  context.log("HTTP trigger function genieHealth processed a request.");
  return {
    status: 200,
    jsonBody: GenieRecommendationService.buildHealthResponse(),
  };
}

app.http("genieHealth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: genieHealth,
});
