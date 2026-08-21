import "reflect-metadata";
import { Container } from "./container.js";
import type { HttpMethod, RouteMetadata } from "./decorators/methods.js";
import {
  CONTROLLER_PREFIX_METADATA,
  ROUTE_METADATA,
  type Constructor,
} from "./tokens.js";

export interface RegisteredRoute {
  controller: Constructor;
  handlerName: string;
  method: HttpMethod;
  path: string;
  parameterNames: string[];
  pattern: RegExp;
}

export interface RouteMatch {
  route: RegisteredRoute;
  params: Record<string, string>;
}

export class Router {
  private readonly routes: RegisteredRoute[] = [];

  constructor(readonly container: Container) {}

  registerControllers(controllers: Constructor[]): this {
    for (const controller of controllers) this.registerController(controller);
    return this;
  }

  match(method: string, pathname: string): RouteMatch | undefined {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec(pathname);
      if (!match) continue;

      const params = Object.fromEntries(
        route.parameterNames.map((name, index) => [
          name,
          decodeURIComponent(match[index + 1]),
        ]),
      );
      return { route, params };
    }
    return undefined;
  }

  private registerController(controller: Constructor): void {
    const prefix =
      (Reflect.getMetadata(CONTROLLER_PREFIX_METADATA, controller) as
        | string
        | undefined) ?? "";
    const prototype = controller.prototype as Record<string, unknown>;

    for (const handlerName of Object.getOwnPropertyNames(prototype)) {
      if (handlerName === "constructor") continue;
      const handler = prototype[handlerName];
      if (typeof handler !== "function") continue;

      const metadata = Reflect.getMetadata(ROUTE_METADATA, handler) as
        | RouteMetadata
        | undefined;
      if (!metadata) continue;

      const path = this.joinPaths(prefix, metadata.path);
      const { pattern, parameterNames } = this.compilePath(path);
      this.routes.push({
        controller,
        handlerName,
        method: metadata.method,
        path,
        pattern,
        parameterNames,
      });
    }
  }

  private joinPaths(prefix: string, path: string): string {
    const segments = `${prefix}/${path}`.split("/").filter(Boolean);
    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
  }

  private compilePath(path: string): {
    pattern: RegExp;
    parameterNames: string[];
  } {
    const parameterNames: string[] = [];
    const pattern = path
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          parameterNames.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");

    return { pattern: new RegExp(`^${pattern}/?$`), parameterNames };
  }
}
