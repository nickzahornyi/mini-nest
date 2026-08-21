import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { Container } from "../src/container.js";
import { Controller } from "../src/decorators/controller.js";
import { Get, Post } from "../src/decorators/methods.js";
import { Body, Param, Query } from "../src/decorators/params.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Dispatcher } from "../src/dispatcher.js";
import { CreateUserDto } from "../src/dto/create-user.dto.js";
import { Router } from "../src/router.js";

@Injectable()
class TestUsersService {
  readonly marker = Symbol("singleton");
}

@Controller("users")
class TestUsersController {
  lastBody?: CreateUserDto;

  constructor(readonly users: TestUsersService) {}

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { id };
  }

  @Get("special")
  special() {
    return { route: "static" };
  }

  @Get()
  findAll(@Query("limit") limit?: string) {
    return { limit };
  }

  @Post()
  create(@Body(CreateUserDto) body: CreateUserDto) {
    this.lastBody = body;
    return { body, isDto: body instanceof CreateUserDto };
  }

  @Post("explicit")
  createWithErasedType(@Body(CreateUserDto) body: any) {
    return { isDto: body instanceof CreateUserDto };
  }
}

describe("HTTP dispatcher", () => {
  const container = new Container();
  const router = new Router(container).registerControllers([TestUsersController]);
  const executionEvents: string[] = [];
  const dispatcher = new Dispatcher(router).useInterceptor({
    async intercept(_request, next) {
      executionEvents.push("before");
      const result = await next();
      executionEvents.push("after");
      return result;
    },
  });
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = dispatcher.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("joins @Controller prefix with @Get path and injects @Param", async () => {
    const response = await fetch(`${baseUrl}/users/42`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "42" });
  });

  it("prioritizes a static route over a dynamic route", async () => {
    const response = await fetch(`${baseUrl}/users/special`);
    assert.deepEqual(await response.json(), { route: "static" });
  });

  it("injects a query value as a separate argument", async () => {
    const response = await fetch(`${baseUrl}/users?limit=5`);
    assert.deepEqual(await response.json(), { limit: "5" });
  });

  it("returns 400 with every invalid DTO field", async () => {
    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const payload = (await response.json()) as {
      errors: Array<{ field: string }>;
    };

    assert.equal(response.status, 400);
    assert.ok(payload.errors.some((error) => error.field === "email"));
    assert.ok(payload.errors.some((error) => error.field === "name"));
  });

  it("parses @Body and passes a DTO instance to the handler", async () => {
    const body = {
      name: "Lin",
      email: "lin@example.com",
      isAdmin: true,
    };
    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      body: Record<string, unknown>;
      isDto: boolean;
    };

    assert.equal(response.status, 201);
    assert.equal(payload.isDto, true);
    assert.deepEqual(payload.body, {
      name: "Lin",
      email: "lin@example.com",
    });
    assert.equal("isAdmin" in payload.body, false);
    assert.ok(container.resolve(TestUsersController).lastBody instanceof CreateUserDto);
  });

  it("validates an explicit DTO when design:paramtypes is Object", async () => {
    const response = await fetch(`${baseUrl}/users/explicit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Lin", email: "not-an-email" }),
    });
    const payload = (await response.json()) as {
      errors: Array<{ field: string }>;
    };

    assert.equal(response.status, 400);
    assert.ok(payload.errors.some((error) => error.field === "email"));
  });

  it("creates controller dependencies through the IoC container", async () => {
    await fetch(`${baseUrl}/users/1`);
    const controller = container.resolve(TestUsersController);
    assert.equal(controller.users, container.resolve(TestUsersService));
  });

  it("composes execution stages around the handler", async () => {
    executionEvents.length = 0;
    await fetch(`${baseUrl}/users/1`);
    assert.deepEqual(executionEvents, ["before", "after"]);
  });

  it("returns JSON 404 for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Route GET /missing not found",
    });
  });
});
