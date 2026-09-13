import type { ConnectionVerifierPort } from "./contracts";

export const FIXTURE_CONNECTION_VERIFIER: ConnectionVerifierPort = {
  mode: "fixture",
  async verifyGmail() {
    return {
      display_name: "Demo Gmail",
      identity: "operator@example.com",
      capabilities: [
        { key: "mail.read", label: "Read labeled messages", verified: true },
        { key: "mail.send", label: "Send approved messages", verified: true },
      ],
    };
  },
  async listCalendars() {
    return [{ selection_token: "fixture-primary", provider_calendar_id: "primary", display_name: "Demo executive calendar", primary: true, writable: true }];
  },
  async verifyCalendar() {
    return {
      display_name: "Demo executive calendar",
      destination_label: "Demo executive calendar",
      capabilities: [
        { key: "calendar.read", label: "Read schedule", verified: true },
        { key: "calendar.write", label: "Create approved holds", verified: true },
      ],
    };
  },
  async verifyNotion() {
    return {
      display_name: "Demo Notion workspace",
      destination_label: "Executive follow-through",
      capabilities: [
        { key: "notion.page.read", label: "Access follow-through destination", verified: true },
        { key: "notion.child.create", label: "Create follow-through pages", verified: true },
      ],
    };
  },
};
