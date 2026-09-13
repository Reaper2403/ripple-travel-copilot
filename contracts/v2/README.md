# Ripple v2 public contracts

The canonical runtime schemas and inferred TypeScript DTOs live in
`src/lib/v2/contracts.ts`. They are intentionally strict: unknown fields are
rejected so credentials and raw provider payloads cannot silently cross the
server/UI boundary.

Contract invariants:

- the only public integration states are `not_started`, `verifying`,
  `verified`, and `needs_attention`;
- a verified connection has a recent validity window and only verified
  capabilities;
- fixture and real verification are always distinguishable;
- provider calendar identifiers remain server-side; clients receive an opaque
  selection token;
- completed onboarding requires an account, three verified connections, and
  the `workspace` step;
- the client cannot declare a connection verified.

API routes return these schemas directly. Failures use the existing redacted
`ApiErrorBody` contract and never include provider responses or credentials.

