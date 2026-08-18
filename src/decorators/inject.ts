import "reflect-metadata";
import { INJECT_TOKENS_METADATA, type InjectionToken } from "../tokens.js";

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const tokens = new Map<number, InjectionToken>(
      Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) ?? [],
    );

    tokens.set(parameterIndex, token);

    Reflect.defineMetadata(INJECT_TOKENS_METADATA, tokens, target);
  };
}
