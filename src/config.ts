import "dotenv/config";

export type BentleyEnvironment = "prod" | "qa";

export interface BentleyConfig {
  environment: BentleyEnvironment;
  apiBaseUrl: string;
  issuerUrl: string;
}

export function getBentleyConfig(): BentleyConfig {
  const environment = parseBentleyEnvironment(process.env.ITWIN_ENV);
  const prefix = environment === "qa" ? "qa-" : "";

  return {
    environment,
    apiBaseUrl:
      process.env.ITWIN_API_BASE_URL?.trim() || `https://${prefix}api.bentley.com`,
    issuerUrl:
      process.env.ITWIN_ISSUER_URL?.trim() || `https://${prefix}ims.bentley.com`,
  };
}

export function parseBentleyEnvironment(value: string | undefined): BentleyEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "qa") return "qa";
  throw new Error(`Unsupported ITWIN_ENV: ${value}. Use prod or qa.`);
}
