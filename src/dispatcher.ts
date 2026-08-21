import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { RequestContext } from "./context/request-context.js";
import type { RouteParamMetadata } from "./decorators/params.js";
import { ForbiddenError, NotFoundError } from "./errors.js";
import { ExceptionFilter } from "./filters/exception.filter.js";
import { ZodValidationPipe } from "./pipes/zod-validation.pipe.js";
import { Router, type RouteMatch } from "./router.js";
import { ROUTE_PARAMS_METADATA, type Constructor } from "./tokens.js";

export interface Middleware {
  use(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => Promise<void>,
  ): Promise<void>;
}

export interface Guard {
  canActivate(request: IncomingMessage): boolean | Promise<boolean>;
}

export interface Interceptor {
  intercept(
    request: IncomingMessage,
    next: () => Promise<unknown>,
  ): Promise<unknown>;
}

export class Dispatcher {
  private readonly middlewares: Middleware[] = [];
  private readonly guards: Guard[] = [];
  private readonly interceptors: Interceptor[] = [];

  constructor(
    private readonly router: Router,
    private readonly validationPipe = new ZodValidationPipe(),
    private readonly exceptionFilter = new ExceptionFilter(),
  ) {}

  useMiddleware(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  useGuard(guard: Guard): this {
    this.guards.push(guard);
    return this;
  }

  useInterceptor(interceptor: Interceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  createServer(): Server {
    return createServer((request, response) => {
      void this.dispatch(request, response);
    });
  }

  private async dispatch(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestIdHeader = request.headers["x-request-id"];
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) ??
      randomUUID();
    response.setHeader("X-Request-Id", requestId);

    try {
      await RequestContext.run(requestId, async () => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const match = this.router.match(request.method ?? "GET", url.pathname);
        if (!match) {
          throw new NotFoundError(
            `Route ${request.method ?? "GET"} ${url.pathname} not found`,
          );
        }

        await this.runMiddlewares(request, response, async () => {
          for (const guard of this.guards) {
            if (!(await guard.canActivate(request))) throw new ForbiddenError();
          }

          const controller = this.router.container.resolve(
            match.route.controller,
          ) as Record<string, (...values: unknown[]) => unknown>;
          const handler = controller[match.route.handlerName];
          const result = await this.runInterceptors(request, async () => {
            const body = await this.readJsonBody(request);
            const args = this.buildArguments(match, url, body);
            return handler.apply(controller, args);
          });

          if (!response.writableEnded) {
            this.json(response, match.route.method === "POST" ? 201 : 200, result);
          }
        });
      });
    } catch (error) {
      this.exceptionFilter.catch(error, response);
    }
  }

  private runMiddlewares(
    request: IncomingMessage,
    response: ServerResponse,
    handler: () => Promise<void>,
  ): Promise<void> {
    return this.middlewares.reduceRight<() => Promise<void>>(
      (next, middleware) => () => middleware.use(request, response, next),
      handler,
    )();
  }

  private runInterceptors(
    request: IncomingMessage,
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    return this.interceptors.reduceRight<() => Promise<unknown>>(
      (next, interceptor) => () => interceptor.intercept(request, next),
      handler,
    )();
  }

  private buildArguments(
    match: RouteMatch,
    url: URL,
    body: unknown,
  ): unknown[] {
    const prototype = match.route.controller.prototype;
    const parameters =
      (Reflect.getMetadata(
        ROUTE_PARAMS_METADATA,
        prototype,
        match.route.handlerName,
      ) as Map<number, RouteParamMetadata> | undefined) ?? new Map();
    const parameterTypes =
      (Reflect.getMetadata(
        "design:paramtypes",
        prototype,
        match.route.handlerName,
      ) as Constructor[] | undefined) ?? [];
    const args: unknown[] = [];

    for (const [index, parameter] of parameters) {
      if (parameter.type === "param") args[index] = match.params[parameter.name];
      if (parameter.type === "query") {
        args[index] = url.searchParams.get(parameter.name) ?? undefined;
      }
      if (parameter.type === "body") {
        const dto = parameter.dto ?? parameterTypes[index];
        args[index] =
          dto && dto !== Object
            ? this.validationPipe.transform(body, dto as Constructor<object>)
            : body;
      }
    }
    return args;
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    if (request.method !== "POST") return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(value ?? null));
  }
}
