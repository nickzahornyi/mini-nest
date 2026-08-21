import type { IncomingMessage } from "node:http";
import type { Interceptor } from "../dispatcher.js";

export class LoggingInterceptor implements Interceptor {
  constructor(private readonly logger: (message: string) => void = console.log) {}

  async intercept(
    request: IncomingMessage,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const startedAt = performance.now();
    try {
      return await next();
    } finally {
      const duration = performance.now() - startedAt;
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      this.logger(`${request.method ?? "GET"} ${pathname} — ${duration.toFixed(1)} ms`);
    }
  }
}
