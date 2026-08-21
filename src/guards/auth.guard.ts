import type { IncomingMessage } from "node:http";
import type { Guard } from "../dispatcher.js";

export class AuthGuard implements Guard {
  constructor(private readonly publicPaths: string[] = []) {}

  canActivate(request: IncomingMessage): boolean {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (this.publicPaths.includes(pathname)) return true;
    const authorization = request.headers.authorization;
    return typeof authorization === "string" && authorization.trim().length > 0;
  }
}
