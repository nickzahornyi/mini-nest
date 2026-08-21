import pg from "pg";
import { Injectable } from "../decorators/injectable.js";
import type { CreateUserDto } from "../dto/create-user.dto.js";

const { Pool } = pg;

export interface UserRecord {
  id: number;
  name: string;
  email: string;
}

@Injectable()
export class UsersService {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async health(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async findAll(limit?: string): Promise<UserRecord[]> {
    const parsedLimit = Number.parseInt(limit ?? "100", 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 100;
    const result = await this.pool.query<UserRecord>(
      "SELECT id, name, email FROM users ORDER BY id LIMIT $1",
      [safeLimit],
    );
    return result.rows;
  }

  async findOne(id: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRecord>(
      "SELECT id, name, email FROM users WHERE id = $1",
      [id],
    );
    return result.rows[0];
  }

  async create(dto: CreateUserDto): Promise<UserRecord> {
    const result = await this.pool.query<UserRecord>(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [dto.name, dto.email],
    );
    return result.rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
