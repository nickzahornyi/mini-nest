import { Controller } from "../decorators/controller.js";
import { Get, Post } from "../decorators/methods.js";
import { Body, Param, Query } from "../decorators/params.js";
import { CreateUserDto } from "../dto/create-user.dto.js";
import { UsersService } from "../services/users.service.js";

@Controller()
export class HealthController {
  constructor(private readonly users: UsersService) {}

  @Get("health")
  async health(): Promise<{ status: string }> {
    await this.users.health();
    return { status: "ok" };
  }
}

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query("limit") limit?: string) {
    return this.users.findAll(limit);
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return { id, user: await this.users.findOne(id) };
  }

  @Post()
  create(@Body(CreateUserDto) body: CreateUserDto) {
    return this.users.create(body);
  }
}
