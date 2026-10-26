import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import {
  changePasswordSchema,
  requestEmailVerificationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  sessionIdParamsSchema,
  verifyEmailSchema
} from "./account.schemas.js";
import type { AccountService } from "./account.service.js";

export class AccountController {
  constructor(private readonly service: AccountService) {}

  forgotPassword = async (request: Request, response: Response): Promise<void> => {
    const { email } = requestPasswordResetSchema.parse(request.body);
    await this.service.requestPasswordReset(email);
    response.status(202).json({ message: "If the account exists, reset instructions will be sent" });
  };

  resetPassword = async (request: Request, response: Response): Promise<void> => {
    const input = resetPasswordSchema.parse(request.body);
    await this.service.resetPassword(input.token, input.newPassword);
    response.status(204).send();
  };

  changePassword = async (request: Request, response: Response): Promise<void> => {
    const input = changePasswordSchema.parse(request.body);
    await this.service.changePassword(
      requireUserId(request),
      input.currentPassword,
      input.newPassword,
      String(request.id)
    );
    response.status(204).send();
  };

  requestEmailVerification = async (request: Request, response: Response): Promise<void> => {
    const { email } = requestEmailVerificationSchema.parse(request.body);
    await this.service.requestEmailVerification(email);
    response.status(202).json({ message: "If the account exists, verification instructions will be sent" });
  };

  verifyEmail = async (request: Request, response: Response): Promise<void> => {
    const { token } = verifyEmailSchema.parse(request.body);
    await this.service.verifyEmail(token);
    response.status(204).send();
  };

  listSessions = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ items: await this.service.listSessions(requireUserId(request)) });
  };

  revokeSession = async (request: Request, response: Response): Promise<void> => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    await this.service.revokeSession(requireUserId(request), sessionId, String(request.id));
    response.status(204).send();
  };
}

function requireUserId(request: Request): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth.userId;
}
