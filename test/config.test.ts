import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const requiredEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  PAYMENT_WEBHOOK_SECRET: "b".repeat(32),
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  METRICS_BEARER_TOKEN: "c".repeat(32)
};

describe("email configuration", () => {
  it("uses the fake transport by default", () => {
    expect(loadConfig(requiredEnvironment).EMAIL_TRANSPORT).toBe("fake");
  });

  it("requires an SMTP URL for real email delivery", () => {
    expect(() => loadConfig({ ...requiredEnvironment, EMAIL_TRANSPORT: "smtp" })).toThrow("SMTP_URL");
  });

  it("accepts SMTP delivery with an SMTP connection URL", () => {
    const config = loadConfig({
      ...requiredEnvironment,
      EMAIL_TRANSPORT: "smtp",
      SMTP_URL: "smtps://mailer:secret@smtp.example.com:465"
    });
    expect(config.SMTP_URL).toBe("smtps://mailer:secret@smtp.example.com:465");
  });
});

describe("proxy trust configuration", () => {
  it("trusts no forwarded hops by default", () => {
    expect(loadConfig(requiredEnvironment).TRUST_PROXY_HOPS).toBe(0);
  });

  it("accepts the single ALB hop used by ECS", () => {
    expect(loadConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS).toBe(1);
  });

  it("rejects an unbounded forwarded chain", () => {
    expect(() => loadConfig({ ...requiredEnvironment, TRUST_PROXY_HOPS: "10" })).toThrow();
  });
});
