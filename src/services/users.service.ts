import { Injectable } from "../decorators/injectable.js";
import type { CreateUserDto } from "../dto/create-user.dto.js";
import { UserRepository } from "./user.repository.js";

export interface UserRecord {
  id: number;
  name: string;
  email: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async health(): Promise<void> {
    await this.repository.health();
  }

  async findAll(limit?: string): Promise<UserRecord[]> {
    const parsedLimit = Number.parseInt(limit ?? "100", 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 100;
    return this.repository.findAll(safeLimit);
  }

  async findOne(id: string): Promise<UserRecord | undefined> {
    return this.repository.findOne(id);
  }

  async create(dto: CreateUserDto): Promise<UserRecord> {
    return this.repository.create(dto);
  }

  async close(): Promise<void> {
    await this.repository.close();
  }
}
