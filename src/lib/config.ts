import { z } from "zod";

const serverConfigSchema = z.object({
  PROVIDER_MODE: z.enum(["fake", "real"]).default("fake"),
  RIPPLE_OPERATOR_EMAIL: z.string().email().default("operator@example.com"),
  DEMO_STAKEHOLDER_EMAILS: z.string().default("host@example.com"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  GMAIL_INGEST_LABEL: z.string().default("TravelCopilot/Test"),
  NOTION_ACCESS_TOKEN: z.string().optional(),
  NOTION_PARENT_PAGE_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
});

export type ServerConfig = z.infer<typeof serverConfigSchema> & { stakeholder_emails: string[] };

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;
  const result = serverConfigSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Server configuration is invalid: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const stakeholder_emails = result.data.DEMO_STAKEHOLDER_EMAILS.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => z.string().email().safeParse(item).success);
  cached = { ...result.data, stakeholder_emails };
  return cached;
}

export function assertRealProviderConfig(config = getServerConfig()): void {
  const missing = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "NOTION_ACCESS_TOKEN",
    "NOTION_PARENT_PAGE_ID",
  ].filter((key) => !config[key as keyof ServerConfig]);
  if (missing.length) throw new Error(`Real provider mode is missing: ${missing.join(", ")}`);
}
