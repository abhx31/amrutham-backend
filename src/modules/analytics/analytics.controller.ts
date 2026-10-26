import type { Request, Response } from "express";
import { analyticsRangeSchema } from "./analytics.schemas.js";
import type { AnalyticsService } from "./analytics.service.js";

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  overview = async (request: Request, response: Response): Promise<void> => {
    response.setHeader("Cache-Control", "private, max-age=60");
    response.status(200).json(await this.service.overview(analyticsRangeSchema.parse(request.query)));
  };

  consultations = async (request: Request, response: Response): Promise<void> => {
    response.setHeader("Cache-Control", "private, max-age=60");
    response.status(200).json({
      items: await this.service.consultationTrends(analyticsRangeSchema.parse(request.query))
    });
  };

  doctors = async (request: Request, response: Response): Promise<void> => {
    response.setHeader("Cache-Control", "private, max-age=60");
    response.status(200).json({
      items: await this.service.doctorUtilization(analyticsRangeSchema.parse(request.query))
    });
  };

  payments = async (request: Request, response: Response): Promise<void> => {
    response.setHeader("Cache-Control", "private, max-age=60");
    response.status(200).json({
      items: await this.service.paymentTrends(analyticsRangeSchema.parse(request.query))
    });
  };
}
