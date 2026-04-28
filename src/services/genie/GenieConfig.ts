export interface GenieConfig {
  shopBaseUrl: string;
  serviceName: string;
  mode: string;
  version: string;
}

class GenieConfigService {
  getConfig(): GenieConfig {
    return {
      shopBaseUrl: process.env.GENIE_SHOP_BASE_URL || "https://www.ulta.com",
      serviceName: process.env.GENIE_SERVICE_NAME || "genie-functions-api",
      mode: process.env.GENIE_MODE || "hosted-mock-compatible",
      version: process.env.GENIE_VERSION || "v1",
    };
  }
}

export default new GenieConfigService();
