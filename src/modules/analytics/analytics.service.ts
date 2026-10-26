import { AppError } from "../../common/errors/app-error.js";
import { AnalyticsRepository } from "./analytics.repository.js";
import type { AnalyticsRange, AnalyticsRangeQuery } from "./analytics.schemas.js";

export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  overview(query: AnalyticsRangeQuery) {
    return this.repository.overview(resolveRange(query));
  }

  consultationTrends(query: AnalyticsRangeQuery) {
    return this.repository.consultationTrends(resolveRange(query));
  }

  doctorUtilization(query: AnalyticsRangeQuery) {
    return this.repository.doctorUtilization(resolveRange(query));
  }

  paymentTrends(query: AnalyticsRangeQuery) {
    return this.repository.paymentTrends(resolveRange(query));
  }
}

function resolveRange(query: AnalyticsRangeQuery): AnalyticsRange {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 30 * 86_400_000);
  if (to <= from) throw new AppError("to must be after from", 400, "INVALID_ANALYTICS_RANGE");
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    throw new AppError("Analytics range cannot exceed 366 days", 400, "INVALID_ANALYTICS_RANGE");
  }
  return { from, to, limit: query.limit };
}
