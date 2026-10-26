import { AppError } from "../../common/errors/app-error.js";
import type { AuthRepository } from "../auth/auth.repository.js";
import type { ListUsersInput, UpdateProfileInput, UpdateStatusInput } from "./user.schemas.js";
import { UserRepository } from "./user.repository.js";
import type { UserListResult, UserView } from "./user.types.js";

export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly authRepository: AuthRepository
  ) {}

  async get(userId: string): Promise<UserView> {
    const user = await this.repository.findById(userId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    return user;
  }

  list(input: ListUsersInput): Promise<UserListResult> {
    return this.repository.list(input);
  }

  async updateOwnProfile(userId: string, input: UpdateProfileInput, requestId?: string): Promise<UserView> {
    const user = await this.repository.updateProfile(userId, input, requestId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    return user;
  }

  async updateStatus(
    userId: string,
    input: UpdateStatusInput,
    actorId: string,
    requestId?: string
  ): Promise<UserView> {
    if (userId === actorId && input.status === "SUSPENDED") {
      throw new AppError("Administrators cannot suspend their own account", 409, "SELF_SUSPENSION_NOT_ALLOWED");
    }
    const user = await this.repository.updateStatus(userId, input, actorId, requestId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    if (input.status === "SUSPENDED") await this.authRepository.revokeAllForUser(userId);
    return user;
  }
}
