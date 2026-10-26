import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../src/modules/auth/auth.repository.js";
import type { UserRepository } from "../src/modules/users/user.repository.js";
import { UserService } from "../src/modules/users/user.service.js";

const user = {
  id: "6ce8b2a4-fd46-4ec2-8f62-f9e58cb5cae0",
  email: "patient@example.com",
  role: "PATIENT" as const,
  status: "ACTIVE" as const,
  firstName: "Asha",
  lastName: "Rao",
  phone: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("user service", () => {
  it("prevents an administrator from suspending their own account", async () => {
    const repository = { updateStatus: vi.fn() } as unknown as UserRepository;
    const authRepository = { revokeAllForUser: vi.fn() } as unknown as AuthRepository;
    const service = new UserService(repository, authRepository);

    await expect(service.updateStatus(
      user.id,
      { status: "SUSPENDED", reason: "Requested for investigation" },
      user.id
    )).rejects.toMatchObject({ code: "SELF_SUSPENSION_NOT_ALLOWED", statusCode: 409 });
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it("revokes all sessions after an administrator suspends a user", async () => {
    const suspended = { ...user, status: "SUSPENDED" as const };
    const repository = { updateStatus: vi.fn().mockResolvedValue(suspended) } as unknown as UserRepository;
    const revokeAllForUser = vi.fn().mockResolvedValue(undefined);
    const authRepository = { revokeAllForUser } as unknown as AuthRepository;
    const service = new UserService(repository, authRepository);

    await expect(service.updateStatus(
      user.id,
      { status: "SUSPENDED", reason: "Policy violation" },
      "35eb0418-7a24-4408-9fd8-ce960fffa1db"
    )).resolves.toEqual(suspended);
    expect(revokeAllForUser).toHaveBeenCalledWith(user.id);
  });

  it("returns a stable not-found error for an unknown user", async () => {
    const repository = { findById: vi.fn().mockResolvedValue(undefined) } as unknown as UserRepository;
    const authRepository = {} as AuthRepository;
    const service = new UserService(repository, authRepository);

    await expect(service.get(user.id)).rejects.toMatchObject({ code: "USER_NOT_FOUND", statusCode: 404 });
  });
});
