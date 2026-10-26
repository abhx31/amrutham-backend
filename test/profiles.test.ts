import { describe, expect, it, vi } from "vitest";
import type { ProfileRepository } from "../src/modules/profiles/profile.repository.js";
import { updateProfileDetailsSchema } from "../src/modules/profiles/profile.schemas.js";
import { ProfileService } from "../src/modules/profiles/profile.service.js";

describe("profile validation and service", () => {
  it("normalizes a structured address country code", () => {
    const result = updateProfileDetailsSchema.parse({
      address: {
        line1: "12 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "in"
      }
    });

    expect(result.address).toMatchObject({ country: "IN" });
  });

  it("rejects future dates of birth", () => {
    expect(() => updateProfileDetailsSchema.parse({ dateOfBirth: "2999-01-01" })).toThrow();
  });

  it("rejects empty profile updates", () => {
    expect(() => updateProfileDetailsSchema.parse({})).toThrow();
  });

  it("returns a stable error when a profile is not found", async () => {
    const repository = { findByUserId: vi.fn().mockResolvedValue(undefined) } as unknown as ProfileRepository;
    const service = new ProfileService(repository);

    await expect(service.get("c1df8e1d-8d74-4db9-b54c-edf972aa53e2"))
      .rejects.toMatchObject({ code: "PROFILE_NOT_FOUND", statusCode: 404 });
  });
});
