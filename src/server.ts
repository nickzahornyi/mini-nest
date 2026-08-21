import "reflect-metadata";
import { Container } from "./container.js";
import {
  HealthController,
  UsersController,
} from "./controllers/app.controller.js";
import { Dispatcher } from "./dispatcher.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { LoggingInterceptor } from "./interceptors/logging.interceptor.js";
import { Router } from "./router.js";
import { UsersService } from "./services/users.service.js";

const port = Number(process.env.PORT ?? 3000);
const container = new Container();
const router = new Router(container).registerControllers([
  HealthController,
  UsersController,
]);
const dispatcher = new Dispatcher(router)
  .useGuard(new AuthGuard(["/health"]))
  .useInterceptor(new LoggingInterceptor());
const server = dispatcher.createServer();

server.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    void container
      .resolve(UsersService)
      .close()
      .finally(() => process.exit(0));
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
