import type { Request, Response } from "express";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService, MfaChallengeResult } from "./auth.service.js";

const REFRESH_COOKIE = "amrutam_refresh";

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfig
  ) {}

  register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.authService.register(registerSchema.parse(request.body));
    this.sendSession(response, result, 201);
  };

  login = async (request: Request, response: Response): Promise<void> => {
    const result = await this.authService.login(loginSchema.parse(request.body));
    if ("challengeToken" in result) {
      response.status(200).json(result);
      return;
    }
    this.sendSession(response, result, 200);
  };

  refresh = async (request: Request, response: Response): Promise<void> => {
    const token = readCookie(request.headers.cookie, REFRESH_COOKIE);
    if (!token) throw new AppError("Refresh token is required", 401, "INVALID_REFRESH_TOKEN");
    this.sendSession(response, await this.authService.refresh(token), 200);
  };

  logout = async (request: Request, response: Response): Promise<void> => {
    const token = readCookie(request.headers.cookie, REFRESH_COOKIE);
    if (token) await this.authService.logout(token);
    this.clearRefreshCookie(response);
    response.status(204).send();
  };

  logoutAll = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
    await this.authService.logoutAll(request.auth.userId);
    this.clearRefreshCookie(response);
    response.status(204).send();
  };

  me = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
    response.status(200).json({ user: await this.authService.me(request.auth.userId) });
  };

  sendSession(response: Response, result: AuthResult, status: number): void {
    this.setRefreshCookie(response, result.refreshToken);
    response.status(status).json({
      accessToken: result.accessToken,
      tokenType: "Bearer",
      expiresIn: result.expiresIn,
      user: result.user
    });
  }

  setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api/v1/auth",
      maxAge: this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000
    };
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
