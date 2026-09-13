import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "./domain/errors";
import type { ExecutionReceipt, RecoveryCase } from "./domain/types";

interface StoredState {
  cases: Record<string, RecoveryCase>;
  receipts: ExecutionReceipt[];
}

const emptyState = (): StoredState => ({ cases: {}, receipts: [] });

export class DurableStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename = path.join(process.cwd(), ".data", "state.json")) {}

  private async read(): Promise<StoredState> {
    try {
      return JSON.parse(await readFile(this.filename, "utf8")) as StoredState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private async write(state: StoredState): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, this.filename);
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async getCase(caseId: string): Promise<RecoveryCase | undefined> {
    return structuredClone((await this.read()).cases[caseId]);
  }

  async saveCase(item: RecoveryCase, expectedVersion?: number): Promise<RecoveryCase> {
    return this.serialized(async () => {
      const state = await this.read();
      const existing = state.cases[item.case_id];
      if (expectedVersion !== undefined && existing?.version !== expectedVersion) {
        throw new DomainError("The case changed while this request was in progress.", "STALE_APPROVAL");
      }
      state.cases[item.case_id] = structuredClone(item);
      await this.write(state);
      return structuredClone(item);
    });
  }

  async replaceDemo(item: RecoveryCase): Promise<void> {
    return this.serialized(async () => {
      const state = await this.read();
      state.cases[item.case_id] = structuredClone(item);
      state.receipts = state.receipts.filter((receipt) => receipt.case_id !== item.case_id);
      await this.write(state);
    });
  }

  async listReceipts(caseId: string): Promise<ExecutionReceipt[]> {
    return structuredClone((await this.read()).receipts.filter((receipt) => receipt.case_id === caseId));
  }

  async upsertReceipt(receipt: ExecutionReceipt): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      const index = state.receipts.findIndex((item) => item.case_id === receipt.case_id && item.action_id === receipt.action_id);
      if (index >= 0) state.receipts[index] = structuredClone(receipt);
      else state.receipts.push(structuredClone(receipt));
      await this.write(state);
    });
  }

  async planReceipts(receipts: ExecutionReceipt[]): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      for (const receipt of receipts) {
        const exists = state.receipts.some((item) => item.case_id === receipt.case_id && item.action_id === receipt.action_id);
        if (!exists) state.receipts.push(structuredClone(receipt));
      }
      await this.write(state);
    });
  }
}
