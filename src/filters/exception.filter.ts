import type { ServerResponse } from "node:http";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors.js";

export class ExceptionFilter {
  catch(error: unknown, response: ServerResponse): void {
    if (error instanceof NotFoundError) {
      return this.json(response, 404, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return this.json(response, 400, { errors: error.errors });
    }
    if (error instanceof ForbiddenError) {
      return this.json(response, 403, { error: error.message });
    }

    console.error(error);
    this.json(response, 500, { error: "Internal server error" });
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(value));
  }
}
