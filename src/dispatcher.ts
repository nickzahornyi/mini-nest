import "reflect-metadata";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { RouteParamMetadata } from "./decorators/params.js";
import { Router, type RouteMatch } from "./router.js";
import { ROUTE_PARAMS_METADATA, type Constructor } from "./tokens.js";
import {
  ValidationException,
  ValidationPipe,
} from "./pipes/validation.pipe.js";

export interface HandlerContext {
  controller: Record<string, (...values: unknown[]) => unknown>;
  handler: (...values: unknown[]) => unknown;
  args: unknown[];
  request: IncomingMessage;
  match: RouteMatch;
}

export type ExecutionStage = (
  context: HandlerContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

export class Dispatcher {
  constructor(
    private readonly router: Router,
    private readonly validationPipe = new ValidationPipe(),
    private readonly stages: ExecutionStage[] = [],
  ) {}

  use(stage: ExecutionStage): this {
    this.stages.push(stage);
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
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = this.router.match(request.method ?? "GET", url.pathname);
      if (!match) return this.json(response, 404, { error: "Not found" });

      const body = await this.readJsonBody(request);
      const args = this.buildArguments(match, url, body);
      const controller = this.router.container.resolve(match.route.controller) as
        Record<string, (...values: unknown[]) => unknown>;
      const handler = controller[match.route.handlerName];
      const result = await this.executeHandler({
        controller,
        handler,
        args,
        request,
        match,
      });
      this.json(response, match.route.method === "POST" ? 201 : 200, result);
    } catch (error) {
      if (error instanceof ValidationException) {
        return this.json(response, 400, { errors: error.errors });
      }
      if (error instanceof SyntaxError) {
        return this.json(response, 400, { error: "Invalid JSON body" });
      }
      console.error(error);
      this.json(response, 500, { error: "Internal server error" });
    }
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
        args[index] = dto && dto !== Object
          ? this.validationPipe.transform(body, dto as Constructor<object>)
          : body;
      }
    }
    return args;
  }

  private executeHandler(context: HandlerContext): Promise<unknown> {
    const invoke = () =>
      Promise.resolve(context.handler.apply(context.controller, context.args));
    const pipeline = this.stages.reduceRight<() => Promise<unknown>>(
      (next, stage) => () => stage(context, next),
      invoke,
    );
    return pipeline();
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
