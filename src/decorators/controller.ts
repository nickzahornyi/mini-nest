import "reflect-metadata";
import {
  CONTROLLER_PREFIX_METADATA,
  INJECTABLE_METADATA,
  SCOPE_METADATA,
} from "../tokens.js";

export function Controller(prefix = ""): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_PREFIX_METADATA, prefix, target);
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
    Reflect.defineMetadata(SCOPE_METADATA, "singleton", target);
  };
}
