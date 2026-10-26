import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { profileUserIdParamsSchema, updateProfileDetailsSchema } from "./profile.schemas.js";
import type { ProfileService } from "./profile.service.js";

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  me = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ profile: await this.service.get(requireUserId(request)) });
  };

  updateMe = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      profile: await this.service.update(
        requireUserId(request),
        updateProfileDetailsSchema.parse(request.body),
        String(request.id)
      )
    });
  };

  getByUserId = async (request: Request, response: Response): Promise<void> => {
    const { userId } = profileUserIdParamsSchema.parse(request.params);
    response.status(200).json({ profile: await this.service.get(userId) });
  };
}

function requireUserId(request: Request): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth.userId;
}
