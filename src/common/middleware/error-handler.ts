import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues },
      requestId: request.id
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
      requestId: request.id
    });
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");
  response.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" },
    requestId: request.id
  });
};
