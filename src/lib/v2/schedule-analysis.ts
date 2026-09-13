import { randomUUID } from "node:crypto";
import { hash } from "../domain/hash";
import type { CalendarEventSnapshot, CalendarSnapshot } from "../domain/types";
import type { ProposalAlternative, SchedulingIntent, SchedulingProposal } from "./contracts";
import { V2_SCHEMA_VERSION } from "./contracts";
import type { SafeRecentNotice } from "./read-context";
import type { SmartAssistantPlan } from "./smart-assistant";

const MINUTE = 60_000;
type Insight = SchedulingProposal["insights"][number];

function durationFrom(content: string): number {
  const match = content.match(/\b(15|30|45|60|90|120)\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/i);
  if (!match) return 45;
  const amount = Number(match[1]);
  return /hour|hr|h$/i.test(match[0]) ? amount * 60 : amount;
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)])) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
}

function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  let candidate = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = localParts(new Date(candidate), timezone);
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    candidate -= represented - Date.UTC(year, month - 1, day, hour, minute);
  }
  return new Date(candidate);
}

function availableWindows(snapshot: CalendarSnapshot, timezone: string, durationMinutes: number, limit = 3): Array<{ start_at: string; end_at: string }> {
  const startLocal = localParts(new Date(snapshot.start_at), timezone);
  const result: Array<{ start_at: string; end_at: string }> = [];
  for (let offset = 0; offset < 8 && result.length < limit; offset += 1) {
    const date = new Date(Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day + offset));
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const dayStart = zonedToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 9, 0, timezone).getTime();
    const dayEnd = zonedToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 17, 0, timezone).getTime();
    const occupied = snapshot.events
      .map((event) => ({ start: Date.parse(event.start_at) - 15 * MINUTE, end: Date.parse(event.end_at) + 15 * MINUTE }))
      .filter((event) => event.end > dayStart && event.start < dayEnd)
      .sort((a, b) => a.start - b.start);
    let cursor = Math.max(dayStart, Date.parse(snapshot.start_at));
    if (cursor >= dayEnd) continue;
    for (const busy of occupied) {
      const end = Math.min(busy.start, dayEnd);
      if (end - cursor >= durationMinutes * MINUTE) result.push({ start_at: new Date(cursor).toISOString(), end_at: new Date(cursor + durationMinutes * MINUTE).toISOString() });
      cursor = Math.max(cursor, busy.end);
      if (result.length >= limit) break;
    }
    if (result.length < limit && dayEnd - cursor >= durationMinutes * MINUTE) result.push({ start_at: new Date(cursor).toISOString(), end_at: new Date(cursor + durationMinutes * MINUTE).toISOString() });
  }
  return result.slice(0, limit);
}

function calendarInsights(snapshot: CalendarSnapshot): Insight[] {
  const insights: Insight[] = [];
  const events = [...snapshot.events].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  for (let index = 0; index < events.length; index += 1) {
    for (let other = index + 1; other < events.length; other += 1) {
      if (Date.parse(events[other].start_at) >= Date.parse(events[index].end_at)) break;
      insights.push({ kind: "CONFLICT", title: "Overlapping commitments", detail: `${events[index].title} overlaps ${events[other].title}.`, event_refs: [events[index].event_ref, events[other].event_ref] });
    }
    const next = events[index + 1];
    if (next) {
      const gap = (Date.parse(next.start_at) - Date.parse(events[index].end_at)) / MINUTE;
      if (gap >= 0 && gap < 30) insights.push({ kind: "TIGHT_TRANSITION", title: "Tight transition", detail: `Only ${Math.round(gap)} minutes separate ${events[index].title} and ${next.title}.`, event_refs: [events[index].event_ref, next.event_ref] });
    }
    if (/board|review|investor|brief|presentation/i.test(events[index].title)) {
      const priorEnd = index ? Date.parse(events[index - 1].end_at) : Date.parse(snapshot.start_at);
      const prep = (Date.parse(events[index].start_at) - priorEnd) / MINUTE;
      if (prep < 30) insights.push({ kind: "MISSING_PREP", title: "Preparation time is exposed", detail: `${events[index].title} has less than 30 minutes of open preparation time before it.`, event_refs: [events[index].event_ref] });
    }
  }
  return insights;
}

function buildAlternatives(windows: Array<{ start_at: string; end_at: string }>, timezone: string, intent: SchedulingIntent, proposalTitle?: string, moveOwned = false): ProposalAlternative[] {
  return windows.map((window, index) => ({
    alternative_id: randomUUID(),
    title: proposalTitle ? `${moveOwned ? "Move to" : "Propose"} ${new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(window.start_at))}` : index === 0 ? "Protect the earliest opening" : `Alternative ${index + 1}`,
    summary: proposalTitle ? moveOwned ? `Move ${proposalTitle} to this free time and clear its original calendar block.` : `Send the organizer a calendar invitation proposing this time for ${proposalTitle}.` : `Reserve ${new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(window.start_at))} for uninterrupted work.`,
    tradeoffs: proposalTitle ? moveOwned ? ["Original time is cleared", "Existing attendees receive the update"] : ["Original invitation stays unchanged", index === 0 ? "Earliest free option" : "Keeps earlier openings available"] : index === 0 ? ["Acts soonest", "Leaves later openings available"] : ["Preserves the earlier opening", "Defers focused work"],
    recommended: index === 0,
    candidate_block: { title: proposalTitle ? moveOwned ? proposalTitle : `Proposed time · ${proposalTitle}` : intent === "PREPARE_WEEK" ? "Executive preparation" : "Protected focus time", ...window, timezone },
  }));
}

export function proposedTimeTarget(snapshot: CalendarSnapshot, content: string) {
  if (!/\b(?:propose|reschedule|move|another time|new time)\b/i.test(content)) return undefined;
  const overlapping = new Set<string>();
  for (let index = 0; index < snapshot.events.length; index += 1) for (let other = index + 1; other < snapshot.events.length; other += 1) {
    const left = snapshot.events[index];
    const right = snapshot.events[other];
    if (Date.parse(left.start_at) < Date.parse(right.end_at) && Date.parse(left.end_at) > Date.parse(right.start_at)) {
      overlapping.add(left.event_ref);
      overlapping.add(right.event_ref);
    }
  }
  const terms = new Set(content.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3));
  const candidates = snapshot.events.filter((event) => event.source_calendar && overlapping.has(event.event_ref) && (event.owned_by_operator || event.organizer));
  candidates.sort((left, right) => {
    const score = (event: CalendarEventSnapshot) => event.title.toLowerCase().split(/[^a-z0-9]+/).filter((term) => terms.has(term)).length;
    return score(right) - score(left) || Date.parse(left.start_at) - Date.parse(right.start_at);
  });
  const target = candidates[0];
  if (!target?.source_calendar || (!target.owned_by_operator && !target.organizer)) return undefined;
  return {
    event_ref: target.event_ref,
    source_calendar: target.source_calendar,
    title: target.title,
    ...(target.organizer ? { organizer_email: target.organizer } : {}),
    owned_by_operator: target.owned_by_operator,
    provider_version: target.provider_version,
    start_at: target.start_at,
    end_at: target.end_at,
  };
}

export function inferIntent(content: string): SchedulingIntent {
  const value = content.toLowerCase();
  if (/recent|change|notice|disruption/.test(value)) return "REVIEW_RECENT_CHANGES";
  if (/find|window|available|free|propose|reschedule|move|new time/.test(value)) return "FIND_TIME";
  if (/protect|focus|hold|block/.test(value)) return "PROTECT_TIME";
  if (/prepare|week|schedule|conflict/.test(value)) return "PREPARE_WEEK";
  return "UNKNOWN";
}

export function proposalContentHash(proposal: Omit<SchedulingProposal, "proposal_hash"> | SchedulingProposal): string {
  const { proposal_hash: _, ...content } = proposal as SchedulingProposal;
  return hash(content);
}

export function analyzeSchedule(input: { conversationId: string; userId: string; intent: SchedulingIntent; content: string; timezone: string; snapshot: CalendarSnapshot; notices: SafeRecentNotice[]; now: Date; assistantPlan?: SmartAssistantPlan | null; proposalTarget?: ReturnType<typeof proposedTimeTarget> }): SchedulingProposal {
  const target_event = input.proposalTarget ?? proposedTimeTarget(input.snapshot, input.content);
  if (input.assistantPlan) {
    const plan = input.assistantPlan;
    const notice = plan.labeled_email_action ? input.notices.find((item) => item.message_ref === plan.labeled_email_action?.source_message_ref && item.sender_email) : undefined;
    const labeled_email_action = plan.labeled_email_action && notice?.sender_email ? {
      message_ref: notice.message_ref,
      sender_email: notice.sender_email,
      subject: notice.subject,
      kind: plan.labeled_email_action.kind,
      title: plan.labeled_email_action.title,
      duration_minutes: plan.labeled_email_action.duration_minutes,
      constraints_summary: plan.labeled_email_action.constraints_summary,
      importance: plan.labeled_email_action.importance,
    } : undefined;
    const insights = [...plan.insights];
    if (plan.clarification_question && !insights.some((item) => item.detail.includes(plan.clarification_question!))) {
      insights.unshift({ kind: "INFORMATION", title: "One preference needed", detail: plan.clarification_question, event_refs: [] });
    }
    const modelViable = plan.clarification_question ? [] : plan.alternatives.filter((item) => item.candidate_block);
    const emailMeeting = labeled_email_action && ["MEETING_REQUEST", "RESCHEDULE"].includes(labeled_email_action.kind) && labeled_email_action.duration_minutes;
    const fallback = !plan.clarification_question && emailMeeting && modelViable.length === 0
      ? buildAlternatives(availableWindows(input.snapshot, input.timezone, labeled_email_action.duration_minutes!, 3), input.timezone, "FIND_TIME", labeled_email_action.title)
      : [];
    const viable = fallback.length ? fallback.map((item) => ({ ...item, candidate_block: item.candidate_block ?? null })) : modelViable;
    const firstRecommended = viable.findIndex((item) => item.recommended);
    const alternatives: ProposalAlternative[] = viable.map((item, index) => ({
      alternative_id: randomUUID(),
      title: item.title,
      summary: item.summary,
      tradeoffs: item.tradeoffs,
      recommended: firstRecommended >= 0 ? index === firstRecommended : index === 0,
      candidate_block: item.candidate_block!,
    }));
    const source_context_hash = hash(input.notices);
    const summary = plan.clarification_question && !plan.summary.includes(plan.clarification_question)
      ? `${plan.summary} ${plan.clarification_question}`
      : plan.summary;
    const unsigned = {
      schema_version: V2_SCHEMA_VERSION,
      proposal_id: randomUUID(), conversation_id: input.conversationId, user_id: input.userId, version: 1,
      status: "DRAFT" as const, intent: plan.intent, title: plan.title, summary,
      assumptions: plan.assumptions,
      insights, alternatives, ...(target_event ? { target_event } : {}), ...(labeled_email_action ? { labeled_email_action } : {}),
      calendar_snapshot_hash: input.snapshot.snapshot_hash,
      calendar_window: { start_at: input.snapshot.start_at, end_at: input.snapshot.end_at, timezone: input.timezone },
      source_context_hash,
      expires_at: new Date(input.now.getTime() + 15 * MINUTE).toISOString(),
    };
    return { ...unsigned, proposal_hash: proposalContentHash(unsigned) };
  }
  const insights = calendarInsights(input.snapshot);
  if (input.intent === "REVIEW_RECENT_CHANGES") {
    insights.push(...input.notices.map((notice) => ({ kind: "RECENT_CHANGE" as const, title: notice.subject, detail: `Received ${new Intl.DateTimeFormat("en", { timeZone: input.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(notice.received_at))}.`, event_refs: [] })));
  }
  const duration = target_event ? (Date.parse(target_event.end_at) - Date.parse(target_event.start_at)) / MINUTE : durationFrom(input.content);
  const windows = availableWindows(input.snapshot, input.timezone, duration);
  const candidateAlternatives = input.intent === "UNKNOWN" || input.intent === "REVIEW_RECENT_CHANGES" ? [] : buildAlternatives(windows, input.timezone, input.intent, target_event?.title, target_event?.owned_by_operator);
  if (!insights.length) insights.push({ kind: "INFORMATION", title: "No immediate schedule pressure", detail: "Ripple found no overlaps or tight transitions in the bounded review window.", event_refs: [] });
  const title = input.intent === "FIND_TIME" ? "Available time options" : input.intent === "REVIEW_RECENT_CHANGES" ? "Recent changes review" : input.intent === "UNKNOWN" ? "A little more detail will help" : "Your week at a glance";
  const actionableCount = insights.filter((item) => item.kind !== "OPEN_WINDOW" && item.kind !== "INFORMATION").length;
  const attentionCopy = actionableCount === 0 ? "No items need attention" : actionableCount === 1 ? "1 item deserves attention" : `${actionableCount} items deserve attention`;
  const summary = input.intent === "UNKNOWN" ? "Ask Ripple to prepare your week, find time, review recent changes, or protect focus time." : `${attentionCopy}; ${windows.length} protected-time option${windows.length === 1 ? " is" : "s are"} available.`;
  const source_context_hash = hash(input.notices);
  const unsigned = {
    schema_version: V2_SCHEMA_VERSION,
    proposal_id: randomUUID(), conversation_id: input.conversationId, user_id: input.userId, version: 1,
    status: "DRAFT" as const, intent: input.intent, title, summary,
    assumptions: [`Working hours are 09:00–17:00 in ${input.timezone}.`, "Candidate windows include a 15-minute buffer around existing commitments."],
    insights, alternatives: candidateAlternatives, ...(target_event ? { target_event } : {}), calendar_snapshot_hash: input.snapshot.snapshot_hash,
    calendar_window: { start_at: input.snapshot.start_at, end_at: input.snapshot.end_at, timezone: input.timezone }, source_context_hash,
    expires_at: new Date(input.now.getTime() + 15 * MINUTE).toISOString(),
  };
  return { ...unsigned, proposal_hash: proposalContentHash(unsigned) };
}
