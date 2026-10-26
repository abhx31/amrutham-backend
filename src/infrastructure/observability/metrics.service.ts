import type { RequestHandler } from "express";

type MetricKey = string;

export class MetricsService {
  private readonly requests = new Map<MetricKey, number>();
  private readonly durations = new Map<MetricKey, { count: number; sum: number }>();

  middleware(): RequestHandler {
    return (request, response, next) => {
      const started = process.hrtime.bigint();
      response.on("finish", () => {
        const routePath = typeof request.route?.path === "string" ? request.route.path : "unmatched";
        const route = `${request.baseUrl}${routePath}`;
        const labels = `${escapeLabel(request.method)}|${escapeLabel(route)}|${response.statusCode}`;
        this.requests.set(labels, (this.requests.get(labels) ?? 0) + 1);
        const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const duration = this.durations.get(labels) ?? { count: 0, sum: 0 };
        duration.count += 1;
        duration.sum += seconds;
        this.durations.set(labels, duration);
      });
      next();
    };
  }

  render(): string {
    const lines = [
      "# HELP amrutam_http_requests_total Total HTTP requests.",
      "# TYPE amrutam_http_requests_total counter"
    ];
    for (const [key, value] of this.requests) {
      const [method, route, status] = key.split("|");
      lines.push(`amrutam_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
    }
    lines.push(
      "# HELP amrutam_http_request_duration_seconds HTTP request duration in seconds.",
      "# TYPE amrutam_http_request_duration_seconds summary"
    );
    for (const [key, value] of this.durations) {
      const [method, route, status] = key.split("|");
      const labels = `method="${method}",route="${route}",status="${status}"`;
      lines.push(`amrutam_http_request_duration_seconds_sum{${labels}} ${value.sum}`);
      lines.push(`amrutam_http_request_duration_seconds_count{${labels}} ${value.count}`);
    }
    lines.push("# HELP amrutam_process_uptime_seconds Process uptime in seconds.");
    lines.push("# TYPE amrutam_process_uptime_seconds gauge");
    lines.push(`amrutam_process_uptime_seconds ${process.uptime()}`);
    return `${lines.join("\n")}\n`;
  }
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}
