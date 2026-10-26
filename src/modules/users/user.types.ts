import type { UserRole } from "../auth/auth.types.js";

export type UserStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type UserView = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserListResult = {
  items: UserView[];
  nextCursor: string | null;
};
