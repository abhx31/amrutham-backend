import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthController } from "./auth.controller.js";
import { disableMfaSchema, verifyMfaLoginSchema, verifyMfaSetupSchema } from "./mfa.schemas.js";
import type { MfaService } from "./mfa.service.js";

export class MfaController {
  constructor(
    private readonly service: MfaService,
    private readonly authController: AuthController
  ) {}

  setup = async (request: Request, response: Response): Promise<void> => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(await this.service.setup(requireAuth(request)));
  };

  verifySetup = async (request: Request, response: Response): Promise<void> => {
    const { code } = verifyMfaSetupSchema.parse(request.body);
    const result = await this.service.verifySetup(requireAuth(request), code, String(request.id));
    this.authController.setRefreshCookie(response, result.session.refreshToken);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      accessToken: result.session.accessToken,
      tokenType: "Bearer",
      expiresIn: result.session.expiresIn,
      user: result.session.user,
      recoveryCodes: result.recoveryCodes
    });
  };

  verifyLogin = async (request: Request, response: Response): Promise<void> => {
    const session = await this.service.verifyLogin(verifyMfaLoginSchema.parse(request.body));
    this.authController.sendSession(response, session, 200);
  };

  disable = async (request: Request, response: Response): Promise<void> => {
    const input = disableMfaSchema.parse(request.body);
    await this.service.disable(requireAuth(request), input.password, input.code, String(request.id));
    response.status(204).send();
  };
}

function requireAuth(request: Request) {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth;
}
