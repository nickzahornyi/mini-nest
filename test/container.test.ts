import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Container } from "../src/container.js";
import { Inject } from "../src/decorators/inject.js";
import { Injectable } from "../src/decorators/injectable.js";
import { CONFIG } from "../src/tokens.js";

describe("Container", () => {
  it("recursively resolves A -> B -> C from design:paramtypes", () => {
    @Injectable()
    class C {}

    @Injectable()
    class B {
      constructor(readonly c: C) {}
    }

    @Injectable()
    class A {
      constructor(readonly b: B) {}
    }

    const result = new Container().resolve(A);

    assert.ok(result instanceof A);
    assert.ok(result.b instanceof B);
    assert.ok(result.b.c instanceof C);
  });

  it("returns the same singleton instance by default", () => {
    @Injectable()
    class Service {}

    const container = new Container();
    assert.equal(container.resolve(Service), container.resolve(Service));
  });

  it("shares a singleton between a class token and its alias", () => {
    @Injectable()
    class Service {}

    const container = new Container().registerClass("service", Service);

    assert.equal(container.resolve("service"), container.resolve(Service));
  });

  it("returns a new transient instance for every resolve", () => {
    @Injectable({ scope: "transient" })
    class Service {}

    const container = new Container();
    assert.notEqual(container.resolve(Service), container.resolve(Service));
  });

  it("resolves an interface dependency through @Inject(token)", () => {
    interface AppConfig {
      environment: string;
    }

    @Injectable()
    class UsesConfig {
      constructor(@Inject(CONFIG) readonly config: AppConfig) {}
    }

    const config = { environment: "test" };
    const container = new Container().registerValue(CONFIG, config);

    assert.equal(container.resolve(UsesConfig).config, config);
  });

  it("inherits @Inject metadata with a base constructor", () => {
    interface AppConfig {
      environment: string;
    }

    @Injectable()
    class BaseService {
      constructor(@Inject(CONFIG) readonly config: AppConfig) {}
    }

    class ChildService extends BaseService {}

    const config = { environment: "inherited" };
    const container = new Container().registerValue(CONFIG, config);

    assert.equal(container.resolve(ChildService).config, config);
  });

  it("reports the complete circular dependency chain", () => {
    const TOKEN_A = Symbol("A");
    const TOKEN_B = Symbol("B");

    @Injectable()
    class A {
      constructor(@Inject(TOKEN_B) readonly b: unknown) {}
    }

    @Injectable()
    class B {
      constructor(@Inject(TOKEN_A) readonly a: unknown) {}
    }

    const container = new Container()
      .registerClass(TOKEN_A, A)
      .registerClass(TOKEN_B, B);

    assert.throws(
      () => container.resolve(TOKEN_A),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof RangeError) &&
        /A -> B -> A/.test(error.message),
    );
  });
});
