import { eq } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs, profiles, users } from "../../infrastructure/database/schema.js";
import type { UpdateProfileDetailsInput } from "./profile.schemas.js";
import type { Address, EmergencyContact, ProfileView } from "./profile.types.js";

const profileSelection = {
  userId: profiles.userId,
  email: users.email,
  firstName: profiles.firstName,
  lastName: profiles.lastName,
  phone: profiles.phone,
  dateOfBirth: profiles.dateOfBirth,
  gender: profiles.gender,
  address: profiles.address,
  emergencyContact: profiles.emergencyContact,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt
};

export class ProfileRepository {
  constructor(private readonly database: Database) {}

  async findByUserId(userId: string): Promise<ProfileView | undefined> {
    const [record] = await this.database.select(profileSelection).from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(eq(profiles.userId, userId)).limit(1);
    return record ? mapProfile(record) : undefined;
  }

  update(
    userId: string,
    input: UpdateProfileDetailsInput,
    requestId?: string
  ): Promise<ProfileView | undefined> {
    return this.database.transaction(async (transaction) => {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) update[key] = value;
      }

      const changed = await transaction.update(profiles).set(update)
        .where(eq(profiles.userId, userId)).returning({ id: profiles.id });
      if (changed.length === 0) return undefined;

      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "PROFILE_UPDATED",
        entityType: "profile",
        entityId: changed[0]!.id,
        requestId,
        metadata: { changedFields: Object.keys(input) }
      });

      const [record] = await transaction.select(profileSelection).from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .where(eq(profiles.userId, userId)).limit(1);
      return record ? mapProfile(record) : undefined;
    });
  }
}

function mapProfile(record: typeof profileSelection extends never ? never : {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: unknown;
  emergencyContact: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ProfileView {
  return {
    ...record,
    address: record.address as Address | null,
    emergencyContact: record.emergencyContact as EmergencyContact | null
  };
}
