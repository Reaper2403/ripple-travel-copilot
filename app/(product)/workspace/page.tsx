import { Suspense } from "react";
import { AssistantWorkspace } from "@/components/v2/assistant-workspace";

export default function WorkspacePage() {
  return <Suspense fallback={<main className="v2-workspace-shell"><div className="v2-workspace v2-workspace-loading"><span className="v2-assistant-symbol">✦</span><h1>Preparing your workspace…</h1></div></main>}><AssistantWorkspace /></Suspense>;
}
