import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  EMAIL_FROM: z.string().email().default("no-reply@amrutam.local"),
  EMAIL_TRANSPORT: z.enum(["fake", "smtp"]).default("fake"),
  SMTP_URL: z.string().refine(
    (value) => value.startsWith("smtp://") || value.startsWith("smtps://"),
    "SMTP_URL must use smtp:// or smtps://"
  ).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("amrutam-api"),
  JWT_AUDIENCE: z.string().min(1).default("amrutam-clients"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.string().refine((value) => {
    try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
  }, "MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
  METRICS_BEARER_TOKEN: z.string().min(32),
  PAYMENT_GATEWAY_MODE: z.enum(["fake"]).default("fake"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(1_000).default(100),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().max(100).default(5)
}).superRefine((environment, context) => {
  if (environment.EMAIL_TRANSPORT === "smtp" && !environment.SMTP_URL) {
    context.addIssue({ code: "custom", path: ["SMTP_URL"], message: "SMTP_URL is required when EMAIL_TRANSPORT=smtp" });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(environment);
}
