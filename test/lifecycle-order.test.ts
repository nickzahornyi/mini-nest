import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { z } from 'zod';
import { Container } from "../src/container.js";
import { Controller } from "../src/decorators/controller.js";
import { Get, Post } from "../src/decorators/methods.js";
import { Body } from "../src/decorators/params.js";
import { Dispatcher } from "../src/dispatcher.js";
import { NotFoundError } from "../src/errors.js";
import { AuthGuard } from "../src/guards/auth.guard.js";
import { LoggingInterceptor } from "../src/interceptors/logging.interceptor.js";
import { ZodValidationPipe } from "../src/pipes/zod-validation.pipe.js";
import { Router } from "../src/router.js";
import { RequestIdService } from "../src/services/request-id.service.js";

async function withServer<T>(
  dispatcher: Dispatcher,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server: Server = dispatcher.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("request lifecycle", () => {
  it("runs all six lifecycle stages in the exact order", async () => {
    const calls: string[] = [];

    class LifecycleDto {
      static readonly schema = z.object({ value: z.string() });
      value!: string;
    }

    @Controller("lifecycle")
    class LifecycleController {
      @Post()
      handle(@Body(LifecycleDto) _body: LifecycleDto) {
        calls.push("handler");
        return { ok: true };
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([LifecycleController]),
      new ZodValidationPipe(() => calls.push("pipe")),
    )
      .useMiddleware({
        async use(_request, _response, next) {
          calls.push("middleware");
          await next();
        },
      })
      .useGuard({
        canActivate() {
          calls.push("guard");
          return true;
        },
      })
      .useInterceptor({
        async intercept(_request, next) {
          calls.push("interceptor:before");
          const result = await next();
          calls.push("interceptor:after");
          return result;
        },
      });

    await withServer(dispatcher, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/lifecycle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "ok" }),
      });
      assert.equal(response.status, 201);
    });

    assert.deepEqual(calls, [
      "middleware",
      "guard",
      "interceptor:before",
      "pipe",
      "handler",
      "interceptor:after",
    ]);
  });

  it("returns 403 and never calls the handler when AuthGuard blocks", async () => {
    let handlerCalls = 0;

    @Controller("secure")
    class SecureController {
      @Get()
      handle() {
        handlerCalls += 1;
        return { ok: true };
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([SecureController]),
    ).useGuard(new AuthGuard());

    await withServer(dispatcher, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/secure`);
      assert.equal(response.status, 403);
      assert.equal(handlerCalls, 0);
    });
  });

  it("LoggingInterceptor logs the method, path and duration", async () => {
    const logs: string[] = [];

    @Controller("logged")
    class LoggedController {
      @Get()
      handle() {
        return { ok: true };
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([LoggedController]),
    ).useInterceptor(new LoggingInterceptor((message) => logs.push(message)));

    await withServer(dispatcher, (baseUrl) => fetch(`${baseUrl}/logged`).then(() => undefined));
    assert.match(logs[0], /^GET \/logged — [0-9]+(?:\.[0-9]+)? ms$/);
  });

  it("sanitizes an unexpected handler error as HTTP 500", async () => {
    @Controller("errors")
    class ErrorController {
      @Get("boom")
      boom() {
        throw new Error("boom");
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([ErrorController]),
    );

    await withServer(dispatcher, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/errors/boom`);
      const body = await response.text();
      assert.equal(response.status, 500);
      assert.doesNotMatch(body, /boom|at .*\.ts:/);
    });
  });

  it("maps NotFoundError to an informative HTTP 404", async () => {
    @Controller("errors")
    class ErrorController {
      @Get("missing")
      missing() {
        throw new NotFoundError("User 42 was not found");
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([ErrorController]),
    );

    await withServer(dispatcher, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/errors/missing`);
      assert.equal(response.status, 404);
      assert.match(await response.text(), /User 42 was not found/);
    });
  });

  it("keeps ten concurrent request contexts isolated", async () => {
    @Controller("context")
    class ContextController {
      constructor(private readonly service: RequestIdService) {}

      @Get()
      async read() {
        return { requestId: await this.service.readTwoLevelsDeep() };
      }
    }

    const container = new Container();
    const dispatcher = new Dispatcher(
      new Router(container).registerControllers([ContextController]),
    );

    await withServer(dispatcher, async (baseUrl) => {
      const ids = Array.from({ length: 10 }, (_, index) => `request-${index}`);
      const results = await Promise.all(
        ids.map(async (requestId) => {
          const response = await fetch(`${baseUrl}/context`, {
            headers: { "x-request-id": requestId },
          });
          const body = (await response.json()) as { requestId: string };
          return {
            sent: requestId,
            header: response.headers.get("x-request-id"),
            deep: body.requestId,
          };
        }),
      );

      for (const result of results) {
        assert.equal(result.header, result.sent);
        assert.equal(result.deep, result.sent);
      }
    });
  });
});
