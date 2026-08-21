import "reflect-metadata";
import { ROUTE_METADATA } from "../tokens.js";

export type HttpMethod = "GET" | "POST";

export interface RouteMetadata {
  method: HttpMethod;
  path: string;
}

function route(method: HttpMethod, path = ""): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    Reflect.defineMetadata(ROUTE_METADATA, { method, path }, descriptor.value!);
  };
}

export const Get = (path = ""): MethodDecorator => route("GET", path);
export const Post = (path = ""): MethodDecorator => route("POST", path);
