import { setTimeout } from "node:timers/promises";
import { RequestContext } from "../context/request-context.js";
import { Injectable } from "../decorators/injectable.js";

@Injectable()
export class RequestIdRepository {
  async readFromContext(): Promise<string | undefined> {
    await setTimeout(Math.floor(Math.random() * 5));
    const requestId = RequestContext.getRequestId();
    return requestId;
  }
}

@Injectable()
export class RequestIdService {
  constructor(private readonly repository: RequestIdRepository) {}

  readTwoLevelsDeep(): Promise<string | undefined> {
    return this.repository.readFromContext();
  }
}
