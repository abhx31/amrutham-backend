import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { listPendingDoctorsSchema } from "../doctors/doctor.schemas.js";
import { createAdminUserSchema } from "./admin.schemas.js";
import type { AdminService } from "./admin.service.js";

export class AdminController {
  constructor(private readonly service: AdminService) {}

  pendingDoctors = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      items: await this.service.listPendingDoctors(listPendingDoctorsSchema.parse(request.query))
    });
  };

  createUser = async (request: Request, response: Response): Promise<void> => {
    response.status(201).json({
      user: await this.service.createUser(
        createAdminUserSchema.parse(request.body),
        requireUserId(request),
        String(request.id)
      )
    });
  };
}

function requireUserId(request: Request): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth.userId;
}
