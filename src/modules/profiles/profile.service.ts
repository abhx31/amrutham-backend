import { AppError } from "../../common/errors/app-error.js";
import { ProfileRepository } from "./profile.repository.js";
import type { UpdateProfileDetailsInput } from "./profile.schemas.js";
import type { ProfileView } from "./profile.types.js";

export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  async get(userId: string): Promise<ProfileView> {
    const profile = await this.repository.findByUserId(userId);
    if (!profile) throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND");
    return profile;
  }

  async update(userId: string, input: UpdateProfileDetailsInput, requestId?: string): Promise<ProfileView> {
    const profile = await this.repository.update(userId, input, requestId);
    if (!profile) throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND");
    return profile;
  }
}
