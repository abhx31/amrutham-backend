import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import type { UserRole } from "./auth.types.js";
import type { TokenService } from "./token.service.js";

export function authenticate(tokenService: TokenService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
      }
      request.auth = await tokenService.verifyAccessToken(authorization.slice(7));
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeRoles(...allowedRoles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(new AppError("Authentication is required", 401, "UNAUTHORIZED"));
    if (!allowedRoles.includes(request.auth.role)) {
      return next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
    }
    next();
  };
}

export function authenticateMfaSetup(tokenService: TokenService): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      next(new AppError("Authentication is required", 401, "UNAUTHORIZED"));
      return;
    }
    const token = authorization.slice(7);
    try {
      try {
        request.auth = await tokenService.verifyAccessToken(token);
      } catch {
        request.auth = await tokenService.verifyMfaToken(token, "mfa_setup");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
