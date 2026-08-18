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

  it("reports the complete circular dependency chain", () => {
    @Injectable()
    class A {
      constructor(readonly b: unknown) {}
    }

    @Injectable()
    class B {
      constructor(readonly a: unknown) {}
    }

    Reflect.defineMetadata("design:paramtypes", [B], A);
    Reflect.defineMetadata("design:paramtypes", [A], B);

    assert.throws(
      () => new Container().resolve(A),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof RangeError) &&
        /A -> B -> A/.test(error.message),
    );
  });
});
