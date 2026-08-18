import "reflect-metadata";
import {
  INJECTABLE_METADATA,
  INJECT_TOKENS_METADATA,
  SCOPE_METADATA,
  type Constructor,
  type InjectionToken,
  type Scope,
} from "./tokens.js";

type ClassProvider<T> = { useClass: Constructor<T> };
type ValueProvider<T> = { useValue: T };
type Provider<T> = Constructor<T> | ClassProvider<T> | ValueProvider<T>;

export class Container {
  private readonly providers = new Map<InjectionToken, Provider<unknown>>();
  private readonly singletons = new Map<InjectionToken, unknown>();

  register<T>(token: InjectionToken<T>, provider: Provider<T>): this {
    this.providers.set(token, provider as Provider<unknown>);
    this.singletons.delete(token);
    return this;
  }

  registerValue<T>(token: InjectionToken<T>, value: T): this {
    return this.register(token, { useValue: value });
  }

  registerClass<T>(token: InjectionToken<T>, target: Constructor<T>): this {
    return this.register(token, { useClass: target });
  }

  resolve<T>(token: InjectionToken<T>): T {
    return this.resolveToken(token, []);
  }

  private resolveToken<T>(token: InjectionToken<T>, path: Constructor[]): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    const provider = this.providers.get(token) ?? token;
    if (this.isValueProvider(provider)) {
      return provider.useValue as T;
    }

    const target = this.getTarget(provider, token);
    const instance = this.instantiate(target, path);
    const scope = Reflect.getMetadata(SCOPE_METADATA, target) as Scope | undefined;

    if ((scope ?? "singleton") === "singleton") {
      this.singletons.set(token, instance);
    }

    return instance as T;
  }

  private instantiate<T>(target: Constructor<T>, path: Constructor[]): T {
    if (path.includes(target)) {
      const cycle = [...path, target]
        .map((item) => item.name)
        .join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    if (!Reflect.getMetadata(INJECTABLE_METADATA, target)) {
      throw new Error(`${target.name} is not decorated with @Injectable()`);
    }

    const parameterTypes =
      (Reflect.getMetadata("design:paramtypes", target) as InjectionToken[]) ?? [];
    const injectedTokens =
      (Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) as
        | Map<number, InjectionToken>
        | undefined) ?? new Map();
    const nextPath = [...path, target];
    const dependencies = parameterTypes.map((type, index) => {
      const dependencyToken = injectedTokens.get(index) ?? type;
      if (!dependencyToken || dependencyToken === Object) {
        throw new Error(
          `Cannot resolve parameter ${index} of ${target.name}; use @Inject(token)`,
        );
      }
      return this.resolveToken(dependencyToken, nextPath);
    });

    return new target(...dependencies);
  }

  private getTarget<T>(
    provider: Provider<unknown> | InjectionToken<T>,
    token: InjectionToken<T>,
  ): Constructor {
    if (typeof provider === "function") return provider;
    if (this.isClassProvider(provider)) return provider.useClass;
    throw new Error(`No provider registered for ${this.tokenName(token)}`);
  }

  private isClassProvider(value: unknown): value is ClassProvider<unknown> {
    return typeof value === "object" && value !== null && "useClass" in value;
  }

  private isValueProvider(value: unknown): value is ValueProvider<unknown> {
    return typeof value === "object" && value !== null && "useValue" in value;
  }

  private tokenName(token: InjectionToken): string {
    return typeof token === "function" ? token.name : String(token);
  }
}
