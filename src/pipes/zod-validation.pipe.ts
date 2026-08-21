import { z, type ZodType } from 'zod';
import { ValidationError } from "../errors.js";
import type { Constructor } from "../tokens.js";

export interface ValidationErrorDetail {
  field: string;
  constraints: string[];
}

type ZodDto<T extends object> = Constructor<T> & { schema?: ZodType<T> };

export class ZodValidationPipe {
  constructor(private readonly onTransform?: () => void) {}

  transform<T extends object>(value: unknown, dto: Constructor<T>): T {
    this.onTransform?.();
    const schema = (dto as ZodDto<T>).schema;
    if (!schema) {
      const instance = Object.create(dto.prototype) as T;
      return typeof value === "object" && value !== null
        ? Object.assign(instance, value)
        : instance;
    }

    const result = schema.safeParse(value);
    if (!result.success) {
      const grouped = new Map<string, string[]>();
      for (const issue of result.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join(".") : "body";
        grouped.set(field, [...(grouped.get(field) ?? []), issue.message]);
      }
      throw new ValidationError(
        [...grouped].map(([field, constraints]) => ({ field, constraints })),
      );
    }

    return Object.assign(Object.create(dto.prototype) as T, result.data);
  }
}

export { z };
