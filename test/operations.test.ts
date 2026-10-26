import { describe, expect, it } from "vitest";
import { MetricsService } from "../src/infrastructure/observability/metrics.service.js";

describe("operational metrics", () => {
  it("renders Prometheus-compatible process metrics", () => {
    const output = new MetricsService().render();
    expect(output).toContain("# TYPE amrutam_process_uptime_seconds gauge");
    expect(output).toContain("amrutam_process_uptime_seconds ");
  });
});
