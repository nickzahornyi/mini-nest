import { AsyncLocalStorage } from "node:async_hooks";

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

export class RequestContext {
  static run<T>(requestId: string, callback: () => T): T {
    return storage.run({ requestId }, callback);
  }

  static getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  }
}
