import "reflect-metadata";
import { ROUTE_PARAMS_METADATA } from "../tokens.js";

export type RouteParamMetadata =
  | { type: "body" }
  | { type: "param"; name: string }
  | { type: "query"; name: string };

function routeParam(metadata: RouteParamMetadata): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) {
      throw new Error("HTTP parameter decorators can only be used on methods");
    }

    const parameters = new Map<number, RouteParamMetadata>(
      Reflect.getOwnMetadata(ROUTE_PARAMS_METADATA, target, propertyKey) ?? [],
    );
    parameters.set(parameterIndex, metadata);
    Reflect.defineMetadata(
      ROUTE_PARAMS_METADATA,
      parameters,
      target,
      propertyKey,
    );
  };
}

export const Body = (): ParameterDecorator => routeParam({ type: "body" });
export const Param = (name: string): ParameterDecorator =>
  routeParam({ type: "param", name });
export const Query = (name: string): ParameterDecorator =>
  routeParam({ type: "query", name });
