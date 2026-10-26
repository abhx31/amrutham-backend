import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import {
  cancelConsultationSchema,
  consultationIdParamsSchema,
  createConsultationSchema,
  listConsultationsSchema,
  transitionConsultationSchema
} from "./consultation.schemas.js";
import type { ConsultationService } from "./consultation.service.js";

export class ConsultationController {
  constructor(private readonly service: ConsultationService) {}

  book = async (request: Request, response: Response): Promise<void> => {
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw new AppError("Idempotency-Key header is required", 400, "IDEMPOTENCY_KEY_REQUIRED");
    const result = await this.service.book(
      requireAuth(request).userId,
      idempotencyKey,
      createConsultationSchema.parse(request.body),
      String(request.id)
    );
    response.status(result.replayed ? 200 : 201)
      .setHeader("Idempotency-Replayed", String(result.replayed))
      .json({ consultation: result.consultation });
  };

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      items: await this.service.list(requireAuth(request), listConsultationsSchema.parse(request.query))
    });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json({ consultation: await this.service.get(consultationId, requireAuth(request)) });
  };

  transition = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json({
      consultation: await this.service.transition(
        consultationId,
        transitionConsultationSchema.parse(request.body),
        requireAuth(request),
        String(request.id)
      )
    });
  };

  cancel = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json({
      consultation: await this.service.cancel(
        consultationId,
        cancelConsultationSchema.parse(request.body),
        requireAuth(request),
        String(request.id)
      )
    });
  };
}

function requireAuth(request: Request) {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth;
}
