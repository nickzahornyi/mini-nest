import "reflect-metadata";
import {
  VALIDATION_RULES_METADATA,
  type Constructor,
} from "../tokens.js";

type ValidationRule = (value: unknown) => string | undefined;
type ValidationRules = Map<string, ValidationRule[]>;

export interface ValidationErrorDetail {
  field: string;
  constraints: string[];
}

export class ValidationException extends Error {
  constructor(readonly errors: ValidationErrorDetail[]) {
    super("Validation failed");
  }
}

function rule(validator: ValidationRule): PropertyDecorator {
  return (target, propertyKey) => {
    const rules = new Map<string, ValidationRule[]>(
      Reflect.getOwnMetadata(VALIDATION_RULES_METADATA, target.constructor) ?? [],
    );
    const field = String(propertyKey);
    rules.set(field, [...(rules.get(field) ?? []), validator]);
    Reflect.defineMetadata(VALIDATION_RULES_METADATA, rules, target.constructor);
  };
}

export const IsEmail = (): PropertyDecorator =>
  rule((value) =>
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? undefined
      : "must be a valid email",
  );

export const IsString = (): PropertyDecorator =>
  rule((value) =>
    typeof value === "string" && value.trim().length > 0
      ? undefined
      : "must be a non-empty string",
  );

export class ValidationPipe {
  transform<T extends object>(value: unknown, dto: Constructor<T>): T {
    const instance = Object.create(dto.prototype) as T;
    if (typeof value === "object" && value !== null) {
      Object.assign(instance, value);
    }
    const rules: ValidationRules =
      (Reflect.getMetadata(VALIDATION_RULES_METADATA, dto) as
        | ValidationRules
        | undefined) ?? new Map<string, ValidationRule[]>();
    const errors: ValidationErrorDetail[] = [];

    for (const [field, validators] of rules) {
      const constraints = validators
        .map((validator) =>
          validator((instance as unknown as Record<string, unknown>)[field]),
        )
        .filter((message): message is string => message !== undefined);
      if (constraints.length > 0) errors.push({ field, constraints });
    }

    if (errors.length > 0) throw new ValidationException(errors);
    return instance;
  }
}
