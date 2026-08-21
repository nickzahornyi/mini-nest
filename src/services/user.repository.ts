import pg from "pg";
import { RequestContext } from "../context/request-context.js";
import { Injectable } from "../decorators/injectable.js";
import type { CreateUserDto } from "../dto/create-user.dto.js";
import type { UserRecord } from "./users.service.js";

const { Pool } = pg;

@Injectable()
export class UserRepository {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async health(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async findAll(limit: number): Promise<UserRecord[]> {
    this.logContext("findAll");
    const result = await this.pool.query<UserRecord>(
      "SELECT id, name, email FROM users ORDER BY id LIMIT $1",
      [limit],
    );
    return result.rows;
  }

  async findOne(id: string): Promise<UserRecord | undefined> {
    this.logContext("findOne");
    const result = await this.pool.query<UserRecord>(
      "SELECT id, name, email FROM users WHERE id = $1",
      [id],
    );
    return result.rows[0];
  }

  async create(dto: CreateUserDto): Promise<UserRecord> {
    this.logContext("create");
    const result = await this.pool.query<UserRecord>(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [dto.name, dto.email],
    );
    return result.rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private logContext(operation: string): void {
    const requestId = RequestContext.getRequestId();
    console.log(`[${requestId ?? "no-request"}] UserRepository.${operation}`);
  }
}
