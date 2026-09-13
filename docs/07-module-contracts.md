# Module contracts

These contracts are the integration authority. A module may change its internals freely, but it must not change field meaning, state semantics, action ordering, error mapping, or canonicalization without a versioned contract change and updated fixtures.

## Global conventions

- Contract version is semantic and begins at `1.0`.
- JSON field names are `snake_case`; enum values are `UPPER_SNAKE_CASE`.
- Timestamps are RFC 3339 UTC instants; preserve the source IANA timezone in a separate field.
- Durations are integer seconds. Money, if ever introduced, is integer minor units plus ISO 4217 currency.
- IDs are opaque, non-empty strings. Provider payloads never cross an adapter boundary.
- Optional is not the same as `null`: omit unknown optional data; use explicit domain states for consequential unknowns.
- Canonical hashes use UTF-8 JSON with recursively sorted keys, arrays kept in semantic order, no insignificant whitespace, and SHA-256 encoded lowercase hex.
- All module calls carry `trace_id`; all case calls carry `case_id` and `case_version`.

## Canonical aggregate

`RecoveryCase` is the consistency boundary:

```text
case_id, version, status
source_snapshot { message_id, thread_id, source_version, content_hash, received_at }
facts { kind, segments, old/new instants, locations, evidence[], confidence, ambiguities[] }
calendar_snapshot { window, event_refs/etags, snapshot_hash }
impacts[] { event_ref, severity, rule, conflict_window, reason }
plans[] { plan_id, version, strategy, assumptions, actions[], plan_hash }
approval { actor, hashes, issued_at, expires_at, nonce, consumed_at? }
receipts[]
created_at, updated_at
```

Only the orchestrator writes aggregate state, using optimistic locking (`expected_version`).

## Allowed states and transitions

| From | To | Preconditions |
|---|---|---|
| — | `INGESTED` | New unique source/case |
| `INGESTED` | `ANALYZING` | Source normalized |
| `INGESTED`/`ANALYZING` | `NEEDS_CLARIFICATION` | Critical evidence policy fails |
| `NEEDS_CLARIFICATION` | `ANALYZING` | User correction creates new source/fact version |
| `ANALYZING` | `READY_FOR_REVIEW` | Facts and impacts valid; ≥1 policy-valid plan |
| `READY_FOR_REVIEW` | `APPROVED` | Exact unexpired grant persisted |
| `READY_FOR_REVIEW` | `REJECTED` | Authenticated user rejects |
| `APPROVED` | `READY_FOR_REVIEW` | Any bound snapshot changed or grant expired |
| `APPROVED` | `EXECUTING` | Grant consumed atomically; intents persisted |
| `EXECUTING` | `COMPLETED` | All required actions verified/skipped per manifest |
| `EXECUTING` | `PARTIALLY_COMPLETED` | Failure/unknown outcome after any attempt |
| `PARTIALLY_COMPLETED` | `EXECUTING` | Retry only unresolved safe actions under same plan |
| `PARTIALLY_COMPLETED` | `NEEDS_MANUAL_REVIEW` | Unknown/unsafe recovery |

No generic `setStatus()` is exposed outside domain/orchestrator code.

## Ports

### MailReaderPort

`scan({label, after_cursor?, limit}) -> {messages[], next_cursor?}` and `get_message({message_id}) -> SourceMessage`.

Guarantees: bounded/paginated results, normalized addresses, sanitized plain text, stable content hash. Does not classify or send.

### CalendarReaderPort

`snapshot({start_at, end_at, timezone, page_cursor?}) -> CalendarSnapshot`.

Guarantees: recurring instances expanded for the window, UTC instants plus timezone, event ID and ETag/version, visibility/ownership flags, completeness flag. An incomplete snapshot cannot be approved.

### ExtractorPort

`extract(SourceMessage) -> DisruptionFacts` conforming to schema. Each critical fact carries a source locator/excerpt and confidence. The extractor never decides whether execution is safe.

### ImpactEngine

`assess({facts, calendar_snapshot, policy}) -> ImpactAssessment[]`.

Pure/deterministic. The model cannot compute interval overlap or timezone conversion. Each result includes the rule ID and inputs sufficient to reproduce it.

### PlannerPort

`plan({case_snapshot, impacts, policy}) -> RecoveryPlan[]`.

Returns 2–3 ordered plans when possible. Every plan contains an ordered `ActionManifest`; policy strips unsupported or unsafe actions before display. No provider calls.

### ApprovalService

`issue({actor_id, case_version, plan_hash, manifest_hash, source_snapshot_hash, calendar_snapshot_hash, ttl_seconds}) -> ApprovalGrant`.

`consume(grant, current_snapshot) -> ValidatedGrant | ContractError` atomically verifies and records one-time use. Approval is stored server-side; a client token is only a reference.

### ArtifactPort

`upsert_case_brief(WriteContext, ArtifactAction) -> ProviderWriteResult` and `get(ref) -> CanonicalArtifact`.

Upsert keys on `case_id`; updates only case-owned sections. Notion is P0; the Google Docs fallback must pass the same conformance suite.

### CalendarWriterPort

`apply(WriteContext, CalendarAction) -> ProviderWriteResult`.

P0 action allowlist: create/update agent-owned travel-disruption hold/note, attach recovery-brief link, or add reminder. Existing unowned events are read-only. Conditional updates require expected ETag/version.

### MailWriterPort

`send(WriteContext, MailAction) -> ProviderWriteResult`.

Rejects recipient/body/subject mismatch, unauthorized BCC, and non-final saga position. Definite transient errors may retry; unknown outcome requires reconciliation/manual review.

### CaseRepository and ActionJournal

- `get(case_id)`, `create(case)`, `save(case, expected_version)`.
- `plan_actions(manifest)`, `mark_started(action_id, attempt)`, `record_result(action_id, result)`, `list(case_id)`.

Intents are durable before provider calls; records are append-only except controlled status progression.

## Write context

Every provider write receives:

```json
{
  "schema_version": "1.0",
  "trace_id": "opaque",
  "case_id": "opaque",
  "case_version": 4,
  "plan_id": "opaque",
  "plan_hash": "64-char sha256 hex",
  "action_id": "opaque",
  "idempotency_key": "opaque stable key",
  "expected_snapshot_hash": "64-char sha256 hex",
  "dry_run": false
}
```

Adapters must reject a missing or malformed context even if the provider would accept the write.

## Action manifest semantics

The ordered actions use exactly these types for P0:

- `ARTIFACT_UPSERT`: canonical titled sections and optional app-owned document reference.
- `CALENDAR_HOLD_UPSERT`: UTC interval, IANA timezone, title, description, private metadata, expected ETag when updating.
- `CALENDAR_LINK_BRIEF`: app-owned event and artifact references, expected ETag.
- `MAIL_SEND`: explicit `to`/`cc`/`bcc` (BCC normally empty), subject, canonical plain body, optional thread reference.

The planner assigns stable action IDs before review. The executor may skip an optional action only when the manifest encodes that condition; it may never synthesize a new action.

## Provider result and error contract

Success:

```json
{
  "outcome": "SUCCEEDED",
  "provider_ref": "opaque",
  "provider_version": "opaque",
  "verified": true,
  "before_hash": null,
  "after_hash": "sha256",
  "completed_at": "2026-09-13T12:00:00Z"
}
```

Error categories: `AUTH`, `PERMISSION`, `RATE_LIMIT`, `CONFLICT`, `VALIDATION`, `TRANSIENT`, `PERMANENT`, `UNKNOWN_OUTCOME`. Each error provides `retryable`, safe user message, provider status code if non-sensitive, and redacted detail. Adapters never leak provider tokens/payloads or throw raw SDK errors across the port.

## Retry and timeout contract

- Reads: bounded exponential backoff with jitter for rate limits/transient failure; global deadline.
- Writes: retry only when category explicitly permits and idempotency/reconciliation makes it safe.
- Respect provider retry hints. Cap attempts and elapsed budget per action.
- Gmail send timeout after request transmission maps to `UNKNOWN_OUTCOME`, not `TRANSIENT`.
- A retry reuses action ID and idempotency key but increments attempt.

## Compatibility and change process

1. Additive optional fields may ship in a minor version after all consumers tolerate them.
2. Field removal, semantic change, enum removal, hash/canonicalization change, or ordering change is breaking and requires a major version.
3. Update JSON Schema, positive/negative examples, fake adapters, conformance tests, and scenario fixtures in one change.
4. Record architectural changes in [the decision log](09-decisions.md).
