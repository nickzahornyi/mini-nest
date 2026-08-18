export type Constructor<T = unknown> = new (...args: any[]) => T;
export type InjectionToken<T = unknown> = Constructor<T> | string | symbol;
export type Scope = "singleton" | "transient";

export const INJECTABLE_METADATA = Symbol("mini-nest:injectable");
export const SCOPE_METADATA = Symbol("mini-nest:scope");
export const INJECT_TOKENS_METADATA = Symbol("mini-nest:inject-tokens");

export const CONFIG = Symbol.for("CONFIG");
