import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import {
  createAvailabilitySchema,
  createDoctorSchema,
  doctorIdParamsSchema,
  listAvailabilitySchema,
  listDoctorsSchema,
  listOwnAvailabilitySchema,
  slotIdParamsSchema,
  updateAvailabilitySchema,
  updateDoctorSchema,
  verifyDoctorSchema
} from "./doctor.schemas.js";
import type { DoctorService } from "./doctor.service.js";

export class DoctorController {
  constructor(private readonly service: DoctorService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ items: await this.service.list(listDoctorsSchema.parse(request.query)) });
  };

  getPublic = async (request: Request, response: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(request.params);
    response.status(200).json({ doctor: await this.service.getPublic(doctorId) });
  };

  getMine = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ doctor: await this.service.getMine(requireUserId(request)) });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    response.status(201).json({
      doctor: await this.service.create(
        createDoctorSchema.parse(request.body),
        requireUserId(request),
        String(request.id)
      )
    });
  };

  updateMine = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      doctor: await this.service.updateMine(
        requireUserId(request),
        updateDoctorSchema.parse(request.body),
        String(request.id)
      )
    });
  };

  verify = async (request: Request, response: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(request.params);
    response.status(200).json({
      doctor: await this.service.verify(
        doctorId,
        verifyDoctorSchema.parse(request.body),
        requireUserId(request),
        String(request.id)
      )
    });
  };

  listAvailability = async (request: Request, response: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(request.params);
    response.status(200).json({
      items: await this.service.listAvailability(doctorId, listAvailabilitySchema.parse(request.query))
    });
  };

  createAvailability = async (request: Request, response: Response): Promise<void> => {
    response.status(201).json({
      slot: await this.service.createAvailability(
        requireUserId(request),
        createAvailabilitySchema.parse(request.body),
        String(request.id)
      )
    });
  };

  listOwnAvailability = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      items: await this.service.listOwnAvailability(
        requireUserId(request),
        listOwnAvailabilitySchema.parse(request.query)
      )
    });
  };

  updateAvailability = async (request: Request, response: Response): Promise<void> => {
    const { slotId } = slotIdParamsSchema.parse(request.params);
    response.status(200).json({
      slot: await this.service.updateAvailability(
        requireUserId(request),
        slotId,
        updateAvailabilitySchema.parse(request.body),
        String(request.id)
      )
    });
  };

  removeAvailability = async (request: Request, response: Response): Promise<void> => {
    const { slotId } = slotIdParamsSchema.parse(request.params);
    await this.service.removeAvailability(requireUserId(request), slotId, String(request.id));
    response.status(204).send();
  };
}

function requireUserId(request: Request): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth.userId;
}
