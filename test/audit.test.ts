import { describe, expect, it } from "vitest";
import { listAuditLogsSchema } from "../src/modules/audit/audit.schemas.js";

describe("audit log query validation", () => {
  it("coerces bounded pagination values", () => {
    expect(listAuditLogsSchema.parse({ limit: "25", offset: "10" }))
      .toMatchObject({ limit: 25, offset: 10 });
  });

  it("rejects an inverted time range", () => {
    expect(() => listAuditLogsSchema.parse({
      from: "2026-10-22T12:00:00+05:30",
      to: "2026-10-21T12:00:00+05:30"
    })).toThrow();
  });
});
