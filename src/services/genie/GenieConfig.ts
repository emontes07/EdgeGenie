export interface GenieConfig {
  shopBaseUrl: string;
  serviceName: string;
  mode: string;
  version: string;
}

class GenieConfigService {
  getConfig(): GenieConfig {
    return {
      shopBaseUrl: process.env.GENIE_SHOP_BASE_URL || "https://example.com/edgewell-sales-genie",
      serviceName: process.env.GENIE_SERVICE_NAME || "edgewell-sales-genie-api",
      mode: process.env.GENIE_MODE || "hosted-mock-compatible",
      version: process.env.GENIE_VERSION || "v1-edgewell-demo",
    };
  }
}

export default new GenieConfigService();
