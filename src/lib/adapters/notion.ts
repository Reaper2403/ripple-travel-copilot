import { Client } from "@notionhq/client";
import type { ServerConfig } from "../config";
import { AdapterError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { ArtifactAction, ProviderWriteResult, WriteContext } from "../domain/types";
import type { ArtifactPort } from "../ports";
import { validateContext } from "./fake";

function notionError(error: unknown): AdapterError {
  const code = String((error as { code?: unknown }).code ?? "unknown");
  const status = Number((error as { status?: unknown }).status ?? 0);
  const category = status === 401 ? "AUTH" : status === 403 || status === 404 ? "PERMISSION" : status === 409 ? "CONFLICT" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
  return new AdapterError({ category, provider_code: code, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "The recovery brief could not be written to Notion." });
}

export class NotionArtifactAdapter implements ArtifactPort {
  private readonly client: Client;
  constructor(private readonly config: ServerConfig) {
    this.client = new Client({ auth: config.NOTION_ACCESS_TOKEN });
  }

  async upsert_case_brief(context: WriteContext, action: ArtifactAction): Promise<ProviderWriteResult> {
    validateContext(context);
    if (!this.config.NOTION_PARENT_PAGE_ID) {
      throw new AdapterError({ category: "AUTH", retryable: false, safe_message: "The Notion parent page is not configured." });
    }
    try {
      const marker = `Ripple action ${context.action_id}`;
      const search = await this.client.search({ query: action.title, filter: { property: "object", value: "page" }, page_size: 20 });
      for (const candidate of search.results) {
        const page = candidate as unknown as { id: string; object: string; parent?: { type?: string; page_id?: string } };
        if (page.object !== "page" || page.parent?.type !== "page_id" || page.parent.page_id?.replaceAll("-", "") !== this.config.NOTION_PARENT_PAGE_ID.replaceAll("-", "")) continue;
        const children = await this.client.blocks.children.list({ block_id: candidate.id, page_size: 10 });
        const found = children.results.some((block) => {
          const paragraph = block as unknown as { type?: string; paragraph?: { rich_text?: Array<{ plain_text?: string }> } };
          return paragraph.type === "paragraph" && Boolean(paragraph.paragraph?.rich_text?.some((part) => part.plain_text?.includes(marker)));
        });
        if (found) {
          const verifiedPage = await this.client.pages.retrieve({ page_id: candidate.id });
          return { outcome: "SUCCEEDED", provider_ref: candidate.id, provider_version: "last_edited_time" in verifiedPage ? verifiedPage.last_edited_time : "unknown", verified: verifiedPage.id === candidate.id, before_hash: hash(action), after_hash: hash(action), completed_at: new Date().toISOString() };
        }
      }
      const result = await this.client.pages.create({
        parent: { type: "page_id", page_id: this.config.NOTION_PARENT_PAGE_ID },
        properties: {
          title: { type: "title", title: [{ type: "text", text: { content: action.title.slice(0, 200) } }] },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: `${marker} · case ${context.case_id} · approved plan ${context.plan_id}` } }] },
          },
          ...action.sections.flatMap((section) => [
            { object: "block" as const, type: "heading_2" as const, heading_2: { rich_text: [{ type: "text" as const, text: { content: section.heading.slice(0, 200) } }] } },
            { object: "block" as const, type: "paragraph" as const, paragraph: { rich_text: [{ type: "text" as const, text: { content: section.body_text.slice(0, 1900) } }] } },
          ]),
        ],
      });
      const verifiedPage = await this.client.pages.retrieve({ page_id: result.id });
      return {
        outcome: "SUCCEEDED",
        provider_ref: result.id,
        provider_version: "last_edited_time" in verifiedPage ? verifiedPage.last_edited_time : "unknown",
        verified: verifiedPage.id === result.id,
        before_hash: null,
        after_hash: hash(action),
        completed_at: new Date().toISOString(),
      };
    } catch (error) {
      throw notionError(error);
    }
  }
}
