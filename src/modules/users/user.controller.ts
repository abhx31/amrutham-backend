import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import {
  listUsersSchema,
  updateProfileSchema,
  updateStatusSchema,
  userIdParamsSchema
} from "./user.schemas.js";
import type { UserService } from "./user.service.js";

export class UserController {
  constructor(private readonly service: UserService) {}

  me = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ user: await this.service.get(requireUserId(request)) });
  };

  updateMe = async (request: Request, response: Response): Promise<void> => {
    const input = updateProfileSchema.parse(request.body);
    response.status(200).json({
      user: await this.service.updateOwnProfile(requireUserId(request), input, String(request.id))
    });
  };

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.list(listUsersSchema.parse(request.query)));
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const { userId } = userIdParamsSchema.parse(request.params);
    response.status(200).json({ user: await this.service.get(userId) });
  };

  updateStatus = async (request: Request, response: Response): Promise<void> => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const input = updateStatusSchema.parse(request.body);
    response.status(200).json({
      user: await this.service.updateStatus(userId, input, requireUserId(request), String(request.id))
    });
  };
}

function requireUserId(request: Request): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth.userId;
}
