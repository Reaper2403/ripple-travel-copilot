import type {
  ArtifactAction,
  CalendarAction,
  CalendarSnapshot,
  DisruptionFacts,
  MailAction,
  ProviderWriteResult,
  RecoveryCase,
  RecoveryPlan,
  SourceMessage,
  WriteContext,
} from "./domain/types";

export interface MailReaderPort {
  scan(input: { label: string; limit: number }): Promise<{ message_ids: string[] }>;
  get_message(input: { message_id: string }): Promise<SourceMessage>;
}
export interface CalendarReaderPort {
  snapshot(input: { start_at: string; end_at: string; timezone: string }): Promise<CalendarSnapshot>;
}
export interface ExtractorPort {
  extract(source: SourceMessage): Promise<DisruptionFacts>;
}
export interface PlannerPort {
  plan(input: { case_snapshot: RecoveryCase }): Promise<RecoveryPlan[]>;
}
export interface ArtifactPort {
  upsert_case_brief(context: WriteContext, action: ArtifactAction): Promise<ProviderWriteResult>;
}
export interface CalendarWriterPort {
  apply(context: WriteContext, action: CalendarAction): Promise<ProviderWriteResult>;
}
export interface MailWriterPort {
  send(context: WriteContext, action: MailAction): Promise<ProviderWriteResult>;
}
export interface ProviderPorts {
  mail_reader: MailReaderPort;
  calendar_reader: CalendarReaderPort;
  artifact_writer: ArtifactPort;
  calendar_writer: CalendarWriterPort;
  mail_writer: MailWriterPort;
}
