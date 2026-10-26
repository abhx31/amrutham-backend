import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { consultationIdParamsSchema } from "../consultations/consultation.schemas.js";
import {
  createPrescriptionSchema,
  prescriptionIdParamsSchema,
  updatePrescriptionSchema
} from "./prescription.schemas.js";
import type { PrescriptionService } from "./prescription.service.js";

export class PrescriptionController {
  constructor(private readonly service: PrescriptionService) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(201).json({
      prescription: await this.service.create(
        consultationId,
        createPrescriptionSchema.parse(request.body),
        requireAuth(request),
        String(request.id)
      )
    });
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json({ items: await this.service.list(consultationId, requireAuth(request)) });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const { prescriptionId } = prescriptionIdParamsSchema.parse(request.params);
    response.status(200).json({
      prescription: await this.service.get(prescriptionId, requireAuth(request))
    });
  };

  finalize = async (request: Request, response: Response): Promise<void> => {
    const { prescriptionId } = prescriptionIdParamsSchema.parse(request.params);
    response.status(200).json({
      prescription: await this.service.finalize(prescriptionId, requireAuth(request), String(request.id))
    });
  };

  updateDraft = async (request: Request, response: Response): Promise<void> => {
    const { prescriptionId } = prescriptionIdParamsSchema.parse(request.params);
    response.status(200).json({
      prescription: await this.service.updateDraft(
        prescriptionId,
        updatePrescriptionSchema.parse(request.body),
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
