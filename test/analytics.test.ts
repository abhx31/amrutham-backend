import { describe, expect, it, vi } from "vitest";
import type { AnalyticsRepository } from "../src/modules/analytics/analytics.repository.js";
import { analyticsRangeSchema } from "../src/modules/analytics/analytics.schemas.js";
import { AnalyticsService } from "../src/modules/analytics/analytics.service.js";

describe("admin analytics", () => {
  it("parses a bounded ISO-8601 range", () => {
    const result = analyticsRangeSchema.parse({
      from: "2026-10-01T00:00:00+05:30",
      to: "2026-10-22T00:00:00+05:30",
      limit: "10"
    });
    expect(result.limit).toBe(10);
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });

  it("rejects ranges longer than 366 days", () => {
    expect(() => analyticsRangeSchema.parse({
      from: "2025-01-01T00:00:00Z",
      to: "2026-10-22T00:00:00Z"
    })).toThrow();
  });

  it("defaults reports to the previous 30 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T00:00:00.000Z"));
    const consultationTrends = vi.fn().mockResolvedValue([]);
    const repository = { consultationTrends } as unknown as AnalyticsRepository;
    const service = new AnalyticsService(repository);

    await service.consultationTrends({ limit: 25 });
    expect(consultationTrends).toHaveBeenCalledWith({
      from: new Date("2026-09-22T00:00:00.000Z"),
      to: new Date("2026-10-22T00:00:00.000Z"),
      limit: 25
    });
    vi.useRealTimers();
  });
});
