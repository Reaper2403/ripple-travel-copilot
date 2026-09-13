import type { CaseResponse } from "./api-contract";
import { getServerConfig } from "./config";
import { ensureDemoCase, store } from "./orchestrator";

export async function caseResponse(caseId = "demo"): Promise<CaseResponse> {
  const item = caseId === "demo" ? await ensureDemoCase() : await store.getCase(caseId);
  if (!item) throw new Error("Case not found");
  return { case: item, receipts: await store.listReceipts(caseId), provider_mode: getServerConfig().PROVIDER_MODE };
}
