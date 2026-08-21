import type { ValidationErrorDetail } from "./pipes/zod-validation.pipe.js";

export class NotFoundError extends Error {}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
  }
}

export class ValidationError extends Error {
  constructor(readonly errors: ValidationErrorDetail[]) {
    super("Validation failed");
  }
}
