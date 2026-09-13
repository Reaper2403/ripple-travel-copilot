import { Client } from "@notionhq/client";
import type { ServerConfig } from "../config";
import { AdapterError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { ArtifactAction, FollowThroughTrackerAction, ProviderWriteResult, WriteContext } from "../domain/types";
import type { ArtifactPort } from "../ports";
import { validateContext } from "./fake";

function notionError(error: unknown): AdapterError {
  const code = String((error as { code?: unknown }).code ?? "unknown");
  const status = Number((error as { status?: unknown }).status ?? 0);
  const category = status === 401 ? "AUTH" : status === 403 || status === 404 ? "PERMISSION" : status === 409 ? "CONFLICT" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
  return new AdapterError({ category, provider_code: code, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "The recovery brief could not be written to Notion." });
}
function safeNotionUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "notion.so" || url.hostname.endsWith(".notion.so")) ? url.toString() : undefined; }
  catch { return undefined; }
}

const trackerHeadings = ["Week at a glance", "At a glance", "What changed", "Affected commitments", "Next actions", "Decision log"] as const;
const rich = (content: string) => [{ type: "text" as const, text: { content: content.slice(0, 1900) } }];
const heading = (content: string) => ({ object: "block" as const, type: "heading_2" as const, heading_2: { rich_text: rich(content) } });
const paragraph = (content: string) => ({ object: "block" as const, type: "paragraph" as const, paragraph: { rich_text: rich(content) } });
const metadataText = (url: string) => ({ type: "text" as const, text: { content: "\u2063", link: { url } } });
const metadataParagraph = (url: string) => ({ object: "block" as const, type: "paragraph" as const, paragraph: { rich_text: [metadataText(url)] } });

function daypart(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function clockTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function naturalizeClockTimes(value: string): string {
  return value.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*[–—-]\s*([01]?\d|2[0-3]):([0-5]\d))?/g, (_match, startHourText: string, startMinuteText: string, endHourText?: string, endMinuteText?: string) => {
    const startHour = Number(startHourText);
    const start = `${daypart(startHour)} ${clockTime(startHour, Number(startMinuteText))}`;
    if (endHourText === undefined || endMinuteText === undefined) return start;
    const endHour = Number(endHourText);
    const endPrefix = daypart(endHour) === daypart(startHour) ? "" : `${daypart(endHour)} `;
    return `${start}–${endPrefix}${clockTime(endHour, Number(endMinuteText))}`;
  });
}

export function naturalDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).formatToParts(date).find((part) => part.type === "hour")?.value ?? 0);
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return `${dateLabel} ${daypart(localHour)} at ${timeLabel} (${timezone})`;
}

function taskBlock(task: FollowThroughTrackerAction["tasks"][number]) {
  return { object: "block" as const, type: "to_do" as const, to_do: { checked: task.status === "DONE", rich_text: [...rich(`${naturalizeClockTimes(task.title)} · Owner: ${task.owner_label}${task.due_at ? ` · Due: ${naturalDateTime(task.due_at, task.timezone ?? "UTC")}` : ""} · Status: ${displayStatus(task.status)}`), metadataText(`https://ripple.local/task/${encodeURIComponent(task.task_id)}`)] } };
}

function trackerTimezone(action: FollowThroughTrackerAction): string {
  return action.tasks.find((task) => task.timezone)?.timezone ?? "UTC";
}

function displayStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function weekAtAGlanceText(action: FollowThroughTrackerAction): string {
  const timezone = trackerTimezone(action);
  return [
    `Latest commitment: ${naturalizeClockTimes(action.chosen_decision)}`,
    `Why it matters: ${naturalizeClockTimes(action.impact)}`,
    `Next checkpoint: ${action.next_deadline ? naturalDateTime(action.next_deadline, timezone) : "No deadline is currently at risk"}`,
    `Owner: ${action.tasks[0]?.owner_label ?? "Executive"}`,
    "Assistant handoff: Review the decision log and open actions before making another calendar change.",
  ].join("\n");
}

function glanceText(action: FollowThroughTrackerAction): string {
  const timezone = trackerTimezone(action);
  return [
    `Status: ${displayStatus(action.status)}`,
    `Chosen decision: ${naturalizeClockTimes(action.chosen_decision)}`,
    `Impact: ${naturalizeClockTimes(action.impact)}`,
    `Next deadline: ${action.next_deadline ? naturalDateTime(action.next_deadline, timezone) : "None"}`,
    `Last updated: ${naturalDateTime(action.last_updated_at, timezone)}`,
  ].join("\n");
}

function trackerBlocks(action: FollowThroughTrackerAction, marker: string) {
  const timezone = trackerTimezone(action);
  return [
    metadataParagraph(marker), heading("Week at a glance"), paragraph(weekAtAGlanceText(action)), heading("At a glance"), paragraph(glanceText(action)), heading("What changed"), paragraph(naturalizeClockTimes(action.executive_summary)),
    heading("Affected commitments"), ...(action.affected_commitments.length ? action.affected_commitments.map((item) => paragraph(`${item.title} · ${naturalizeClockTimes(item.time_label)} · Owner: ${item.owner_label}\nImpact: ${naturalizeClockTimes(item.impact)}\nResponse: ${naturalizeClockTimes(item.chosen_response)}`)) : [paragraph("No existing commitments are changed by this plan.")]),
    heading("Next actions"), ...action.tasks.map(taskBlock), heading("Decision log"), ...action.decisions.map((item) => paragraph(`${naturalDateTime(item.decided_at, timezone)} · ${naturalizeClockTimes(item.decision)}`)),
  ];
}

export class NotionArtifactAdapter implements ArtifactPort {
  private readonly client: Client;
  constructor(private readonly config: ServerConfig) {
    this.client = new Client({ auth: config.NOTION_ACCESS_TOKEN });
  }

  private async allChildren(blockId: string): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor });
      results.push(...page.results);
      if (results.length > 1000) throw new AdapterError({ category: "VALIDATION", retryable: false, safe_message: "The Notion destination is too large to reconcile safely." });
      cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
    } while (cursor);
    return results;
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
          return { outcome: "SUCCEEDED", provider_ref: candidate.id, provider_version: "last_edited_time" in verifiedPage ? verifiedPage.last_edited_time : "unknown", external_url: "url" in verifiedPage ? safeNotionUrl(verifiedPage.url) : undefined, verified: verifiedPage.id === candidate.id, before_hash: hash(action), after_hash: hash(action), completed_at: new Date().toISOString() };
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
        external_url: "url" in verifiedPage ? safeNotionUrl(verifiedPage.url) : undefined,
        verified: verifiedPage.id === result.id,
        before_hash: null,
        after_hash: hash(action),
        completed_at: new Date().toISOString(),
      };
    } catch (error) {
      throw notionError(error);
    }
  }

  async upsert_tracker(context: WriteContext, action: FollowThroughTrackerAction): Promise<ProviderWriteResult> {
    validateContext(context);
    if (!this.config.NOTION_PARENT_PAGE_ID) throw new AdapterError({ category: "AUTH", retryable: false, safe_message: "The Notion follow-through destination is not configured." });
    try {
      const marker = `https://ripple.local/tracker/${encodeURIComponent(context.case_id)}`;
      const legacyMarker = `Ripple tracker ${context.case_id}`;
      const requiredTaskMarkers = action.tasks.map((task) => ({ current: `https://ripple.local/task/${encodeURIComponent(task.task_id)}`, legacy: `Ripple task ${task.task_id}` }));
      const parentChildren = await this.allChildren(this.config.NOTION_PARENT_PAGE_ID);
      for (const candidate of parentChildren) {
        const child = candidate as unknown as { id: string; type?: string; child_page?: { title?: string } };
        if (child.type !== "child_page" || child.child_page?.title !== action.title) continue;
        let children = await this.allChildren(child.id);
        if (!children.some((block) => { const encoded = JSON.stringify(block); return encoded.includes(marker) || encoded.includes(legacyMarker); })) continue;
        const existingMarkers = new Set(requiredTaskMarkers.filter((taskMarker) => children.some((block) => { const encoded = JSON.stringify(block); return encoded.includes(taskMarker.current) || encoded.includes(taskMarker.legacy); })).map((item) => item.current));
        const missing = action.tasks.filter((task) => !existingMarkers.has(`https://ripple.local/task/${encodeURIComponent(task.task_id)}`));
        const missingHeadings = trackerHeadings.filter((required) => !children.some((block) => JSON.stringify(block).includes(`\"plain_text\":\"${required}\"`)));
        if (missing.length || missingHeadings.length) {
          const timezone = trackerTimezone(action);
          const repair = [...missing.map(taskBlock), ...missingHeadings.flatMap((required) => [heading(required), paragraph(required === "Week at a glance" ? weekAtAGlanceText(action) : required === "At a glance" ? glanceText(action) : required === "Affected commitments" ? (action.affected_commitments.map((item) => `${item.title}: ${naturalizeClockTimes(item.impact)}`).join("\n") || "No existing commitments are changed by this plan.") : required === "Decision log" ? action.decisions.map((item) => `${naturalDateTime(item.decided_at, timezone)} · ${naturalizeClockTimes(item.decision)}`).join("\n") : required === "What changed" ? naturalizeClockTimes(action.executive_summary) : "See Ripple-owned tasks below.")] as const)];
          await this.client.blocks.children.append({ block_id: child.id, children: repair });
          children = await this.allChildren(child.id);
        }
        const foundMarkers = requiredTaskMarkers.filter((taskMarker) => children.some((block) => { const encoded = JSON.stringify(block); return encoded.includes(taskMarker.current) || encoded.includes(taskMarker.legacy); })).map((item) => item.current).sort();
        const verified = await this.client.pages.retrieve({ page_id: child.id });
        const complete = foundMarkers.length === requiredTaskMarkers.length && trackerHeadings.every((required) => children.some((block) => JSON.stringify(block).includes(`\"plain_text\":\"${required}\"`)));
        return { outcome: "SUCCEEDED", provider_ref: child.id, provider_version: "last_edited_time" in verified ? verified.last_edited_time : "unknown", external_url: "url" in verified ? safeNotionUrl(verified.url) : undefined, verified: verified.id === child.id && complete, before_hash: hash({ marker, tasks: [...existingMarkers].sort() }), after_hash: hash({ marker, tasks: foundMarkers }), completed_at: new Date().toISOString() };
      }
      const result = await this.client.pages.create({
        parent: { type: "page_id", page_id: this.config.NOTION_PARENT_PAGE_ID },
        properties: { title: { type: "title", title: [{ type: "text", text: { content: action.title.slice(0, 200) } }] } },
        children: trackerBlocks(action, marker),
      });
      const verified = await this.client.pages.retrieve({ page_id: result.id });
      const readBack = await this.allChildren(result.id);
      const foundMarkers = requiredTaskMarkers.filter((taskMarker) => readBack.some((block) => JSON.stringify(block).includes(taskMarker.current))).map((item) => item.current).sort();
      const complete = readBack.some((block) => JSON.stringify(block).includes(marker)) && foundMarkers.length === requiredTaskMarkers.length && trackerHeadings.every((required) => readBack.some((block) => JSON.stringify(block).includes(`\"plain_text\":\"${required}\"`)));
      return { outcome: "SUCCEEDED", provider_ref: result.id, provider_version: "last_edited_time" in verified ? verified.last_edited_time : "unknown", external_url: "url" in verified ? safeNotionUrl(verified.url) : undefined, verified: verified.id === result.id && complete, before_hash: null, after_hash: hash({ marker, tasks: foundMarkers }), completed_at: new Date().toISOString() };
    } catch (error) { throw notionError(error); }
  }
}
