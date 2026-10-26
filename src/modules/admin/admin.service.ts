import { AppError } from "../../common/errors/app-error.js";
import type { PasswordService } from "../auth/password.service.js";
import type { DoctorService } from "../doctors/doctor.service.js";
import type { ListPendingDoctorsInput } from "../doctors/doctor.schemas.js";
import { AdminRepository } from "./admin.repository.js";
import type { CreateAdminUserInput } from "./admin.schemas.js";

export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly doctorService: DoctorService,
    private readonly passwordService: PasswordService
  ) {}

  listPendingDoctors(input: ListPendingDoctorsInput) {
    return this.doctorService.listPending(input);
  }

  async createUser(input: CreateAdminUserInput, actorId: string, requestId?: string) {
    try {
      return await this.repository.createUser(input, await this.passwordService.hash(input.password), actorId, requestId);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new AppError("An account with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
  }
}
