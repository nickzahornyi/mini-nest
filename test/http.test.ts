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

  @Get()
  findAll(@Query("limit") limit?: string) {
    return { limit };
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    this.lastBody = body;
    return { body, isDto: body instanceof CreateUserDto };
  }
}

describe("HTTP dispatcher", () => {
  const container = new Container();
  const router = new Router(container).registerControllers([TestUsersController]);
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = new Dispatcher(router).createServer();
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
    const body = { name: "Lin", email: "lin@example.com" };
    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      body: typeof body;
      isDto: boolean;
    };

    assert.equal(response.status, 201);
    assert.equal(payload.isDto, true);
    assert.deepEqual(payload.body, body);
    assert.ok(container.resolve(TestUsersController).lastBody instanceof CreateUserDto);
  });

  it("creates controller dependencies through the IoC container", async () => {
    await fetch(`${baseUrl}/users/1`);
    const controller = container.resolve(TestUsersController);
    assert.equal(controller.users, container.resolve(TestUsersService));
  });

  it("returns JSON 404 for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  });
});
