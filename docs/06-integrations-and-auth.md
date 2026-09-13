# External APIs and authentication

## What the builder must provide

P0 needs one Google Cloud OAuth client, one dedicated Google test account, one Notion internal connection, and one model-provider project API key. No airline, payment, map, weather, or travel-booking credential is required.

| Requirement | Environment values / asset | Required |
|---|---|---|
| Google OAuth web client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Yes |
| Authorized Google user | Encrypted refresh token produced by the app; do not paste into chat/docs | Yes |
| Gmail intake | `GMAIL_INGEST_LABEL=RIPPLE/READY` | Yes |
| Calendar target | `GOOGLE_CALENDAR_ID` (prefer dedicated demo calendar) | Yes |
| Notion recovery artifact | `NOTION_ACCESS_TOKEN`, `NOTION_PARENT_PAGE_ID`, `ARTIFACT_PROVIDER=notion` | Yes |
| Google Docs fallback | Optional `GOOGLE_DRIVE_FOLDER_ID`; otherwise app-created file | Optional |
| OpenAI project | `OPENAI_API_KEY`, `OPENAI_MODEL` | Yes for proposed implementation |
| Token encryption | `APP_ENCRYPTION_KEY` (exactly 32 random bytes, Base64-encoded) | Yes if refresh token persists |
| Session security | `SESSION_SECRET`, exact base/callback URL | Yes |

Never commit values. Provide them through the local secret/environment configuration; `.env.example` contains names only.

## Demo-account assignment

| Account | Role | Authorizes Ripple? | Demo behavior |
|---|---|---:|---|
| `operator@example.com` | Operator/traveller and owner of the Ripple demo data | **Yes** | Owns the source Gmail message, demo Calendar, recovery artifact, approval, and outbound notifications |
| `stakeholder1@example.com` | Meeting stakeholder | No | Receives a controlled meeting/disruption notification |
| `stakeholder2@example.com` | Meeting stakeholder | No | Receives a controlled meeting/disruption notification |
| `stakeholder3@example.com` | Meeting stakeholder | No | Receives a controlled meeting/disruption notification or participates in the additional stakeholder scenario |

Only the operator account is added as an OAuth test user and completes consent. Stakeholder accounts are normal Calendar attendees and Gmail recipients; Ripple must not request their mailbox or calendar access. All three stakeholder addresses are allowlisted in `DEMO_STAKEHOLDER_EMAILS` so the demo executor rejects any unexpected recipient.

## Google APIs: two committed apps plus artifact fallback

### APIs to enable

1. Gmail API — list/get a labeled message/thread and send an approved message.
2. Google Calendar API — list a bounded event window and create/update only permitted events.
3. Google Docs API — optional fallback artifact adapter.
4. Google Drive API — supporting storage/auth for the optional Google Docs fallback.

### Least-privilege scopes

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/drive.file
```

Google Cloud’s **Data Access / Add scopes** picker normally displays the full `https://www.googleapis.com/auth/userinfo.email` URI, with the description “See your primary Google Account email address.” Select that row. In an OpenID Connect authorization request, the application may use the equivalent shorthand `email`; do not select a Cloud Storage or `cloud-platform` scope merely because its description also mentions an email address.

`drive.file` is enough for files the app creates or the user explicitly shares and is preferred to broad Drive access. Do not request `mail.google.com`, full `calendar`, or full `drive`. If implementation needs to edit arbitrary existing Docs rather than app-created/shared files, re-evaluate and document the scope change before requesting it.

Gmail read scopes are restricted; a public production app may require Google verification and, depending on handling/storage, an assessment. For the hackathon, keep the app in Testing and add named test users. Tokens for testing users can expire under Google’s testing rules, so authorize and verify refresh shortly before the event.

### Step-by-step Google setup

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) using the dedicated operator account.
2. Create a new project named `Ripple Hackathon`; record the project ID.
3. In **APIs & Services → Library**, enable Gmail API, Google Calendar API, Google Docs API, and Google Drive API.
4. Open **Google Auth Platform / OAuth consent screen**. Set app name, support email, developer contact, and audience (`External` unless Workspace-internal is appropriate).
5. Keep publishing status **Testing**. Add only the dedicated operator account as a test user. Add a stakeholder only if that account must independently connect Ripple.
6. Add only the scopes listed above. Explain in the consent copy that Ripple reads selected/labeled disruption mail, reads/edits events for approved recovery actions, optionally creates fallback recovery Docs, and sends only previewed notifications.
7. Create an **OAuth client ID → Web application**.
8. Add the exact development origin, for example `http://localhost:3000`.
9. Add the exact callback, for example `http://localhost:3000/auth/google/callback`. Scheme, host, port, path, and trailing slash must match the app configuration exactly.
10. Copy the client ID and secret into local secret storage as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Do not send them in email or commit them.
11. Start Ripple and choose **Connect Google**. Use authorization-code flow with `access_type=offline`, state/PKCE where supported, and explicit consent when a refresh token is needed.
12. Confirm the callback stores the refresh token encrypted and associates it with the authenticated user. Access tokens are short-lived; never treat them as permanent config.
13. In Gmail, create `RIPPLE/READY`; label only sanitized demo messages.
14. In Calendar, create a separate `Ripple Demo` calendar if practical; set `GOOGLE_CALENDAR_ID` to its ID. Ensure demo events are owned by the test user.
15. Optionally create a `Ripple Demo` Drive folder and set `GOOGLE_DRIVE_FOLDER_ID`. With `drive.file`, use an app-created or explicitly selected folder/file flow rather than assuming access to arbitrary files.
16. Run connection health checks: current identity, one labeled-message read, bounded event list, controlled Calendar event create/delete, and Gmail send to the test user. Test Docs create/update only if enabling the fallback adapter.
17. Revoke/delete test artifacts after the smoke test and rehearse reconnect. Never use personal travel mail in recorded demos.

### Credential-only preparation before the build starts

The following work prepares authorization without implementing the product:

1. Create the Cloud project and enable the four APIs.
2. Configure Branding, Audience (`External`), Data Access scopes, and the operator test user.
3. Create the Web application OAuth client with both local callbacks:

   - `http://localhost:3000/auth/google/callback`
   - `http://127.0.0.1:3000/auth/google/callback`

4. Download the OAuth client JSON once as a recovery copy. Store it outside the repository, for example `/Users/ashutoshchatterjee/.config/ripple/google-oauth-client.json`, with access limited to your macOS user. The application will use environment variables, not read this file directly.
5. Create `/Users/ashutoshchatterjee/Documents/Multi agent Scheduler/.env.local` from `.env.example`. Fill only credentials and fixed account values; `.env.local` is already ignored by Git.
6. Optionally obtain a refresh token before the event using Google OAuth 2.0 Playground with your own client ID/secret:

   - Temporarily add `https://developers.google.com/oauthplayground` to the OAuth client’s authorized redirect URIs.
   - In OAuth Playground settings, enable **Use your own OAuth credentials** and enter the Ripple client ID and secret.
   - Request the exact scopes documented above, use offline access/consent, sign in as the dedicated operator account, and exchange the authorization code.
   - Copy only the refresh token to `GOOGLE_REFRESH_TOKEN` in `.env.local` if the implementation adopts direct refresh-token configuration.
   - Remove the OAuth Playground redirect URI after completion.

The normal application OAuth callback can generate its own refresh token once the application exists, so the Playground step is optional. Do not put an access token in configuration: it is short-lived. Because the app is in Testing and requests Gmail/Calendar scopes, test-user consent and its refresh token expire after seven days; authorize close to the event and be prepared to repeat consent.

### Exact `.env.local` placement

Create this file locally and never share its contents:

```text
/Users/ashutoshchatterjee/Documents/Multi agent Scheduler/.env.local
```

Populate:

```dotenv
APP_ENV=demo
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=<random secret>
APP_ENCRYPTION_KEY=<exactly 32 random bytes encoded as Base64>

GOOGLE_CLIENT_ID=<from Google Cloud OAuth client>
GOOGLE_CLIENT_SECRET=<from Google Cloud OAuth client>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_REFRESH_TOKEN=<optional; omit when the app stores it after OAuth>
GOOGLE_CALENDAR_ID=<dedicated demo calendar ID; primary is acceptable fallback>
GOOGLE_DRIVE_FOLDER_ID=<optional; leave empty so Ripple creates its app-owned demo folder>
GMAIL_INGEST_LABEL=RIPPLE/READY

RIPPLE_OPERATOR_EMAIL=operator@example.com
DEMO_STAKEHOLDER_EMAILS=stakeholder1@example.com,stakeholder2@example.com,stakeholder3@example.com

OPENAI_API_KEY=<OpenAI project key>
OPENAI_MODEL=gpt-5.6-terra
ARTIFACT_PROVIDER=notion
NOTION_ACCESS_TOKEN=<from the Notion internal connection>
NOTION_PARENT_PAGE_ID=<dedicated parent page shared with the connection>
```

Do not paste the real file into chat, screenshots, source control, or the demo recording.

### Google handoff validation

- Consent shows only intended scopes.
- Unlabeled mail is not fetched by app logic.
- Refresh succeeds after access token expiry.
- Workspace admin policies do not block restricted scopes.
- Callback rejects wrong `state` and wrong redirect URI.
- Disconnect revokes/forgets tokens and leaves cases non-write-capable.

Official references: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), and [Docs create](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create).

## OpenAI Responses API: reasoning/extraction provider

Ripple uses model output only for schema-constrained extraction and plan explanations; deterministic code owns evidence validation, impact math, approval, and execution. Use the Responses API with Structured Outputs and `store: false` for travel/email inputs unless the team has deliberately chosen an allowed retention posture.

### Step-by-step OpenAI setup

1. Sign in to the OpenAI Platform, create/select a dedicated project, configure billing, and set a small project budget/alert.
2. Create a project-scoped API key for Ripple. Use the narrowest supported project permissions and rotate it after the event.
3. Store once as `OPENAI_API_KEY` in local/deployment secret storage; never expose it to the browser or commit it.
4. Use `gpt-5.6-terra`, which balances intelligence and cost while supporting Structured Outputs and tool-driven workflows; keep the exact model ID configurable through `OPENAI_MODEL`.
5. Run a startup check that makes a minimal schema-constrained response and fails clearly on auth, quota, model access, or invalid schema.
6. Set request timeouts, bounded retries for definite transient failures, token/output caps, and `store: false`.
7. Log response ID, model, latency, usage, and schema/policy result; do not log raw email bodies or hidden reasoning.

Store the key only in `OPENAI_API_KEY` inside the local `.env.local` path above. A project-scoped key is preferred over a personal key because the Ripple project can have its own limits, rotation, and reporting. Official OpenAI documentation supports project/service-account API keys with names, scopes, and optional expiry.

The official [Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) documents JSON outputs, tools, request storage behavior, and API-key usage. Model availability and access are account-dependent; verify the configured ID from the project before the demo.

## Notion artifact adapter: required P0 setup

For the single-workspace hackathon demo, use an internal connection instead of public OAuth:

1. In the [Notion integrations/Creator dashboard](https://www.notion.so/profile/integrations), create an internal connection.
2. Name it `Ripple` and enable only the content capabilities required to read, insert, and update the recovery pages.
3. Copy the installation token to `NOTION_ACCESS_TOKEN` in `.env.local`; never place it in documentation or chat.
4. Create a page named `Ripple Demo Outputs` for synthetic recovery briefs.
5. From that page’s `•••` menu, choose **Add connections** and select Ripple. Without this explicit share, the API returns an error.
6. Copy the parent page ID from its URL to `NOTION_PARENT_PAGE_ID`.
7. Set `ARTIFACT_PROVIDER=notion`.
8. Before implementation begins, verify the token can read the parent page. During Increment 3, run create/read/update/permission-denied and idempotent-upsert contract tests.

Internal connections use a static token and explicitly shared pages; public multi-workspace distribution requires Notion OAuth. Official references: [Notion authorization](https://developers.notion.com/guides/get-started/authorization) and [create a page](https://developers.notion.com/reference/post-page).

## Optional integrations—not P0 credentials

### Google Docs fallback artifact adapter

Keep the existing Google Docs/Drive authorization available behind `ArtifactPort`, but do not implement it before the Notion golden path and reliability bench pass. It exists for recovery if Notion is unavailable during final hardening; the primary submission and recorded demo must still demonstrate the heterogeneous Gmail + Calendar + Notion path.

### Arga validation/twins

No Arga credential is required for the baseline scripted bench. If hackathon access provides compatible Gmail, Calendar, and Docs/Drive twins, create an Arga account/API key, provision isolated twins, route adapter base URLs through configuration, seed the same scenario contract, and compare final state/traces. Do not claim twin coverage for a service that is unavailable. Arga documents stateful twins, isolated sandboxes, scenarios, and captured side effects in its [official docs](https://docs.argalabs.com/).

### Travel search/status provider

Not required. Add only behind `TravelDiscoveryPort` after validating provider terms, coverage, sandbox fidelity, rate limits, attribution, and credentials. Search results must remain suggestions; ticket exchange, refunds, payments, and servicing existing bookings require separate commercial/provider agreements and must not be implied by a search API key.

## Explicitly not required

- Airline username/password, booking portal session, credit card, passport data.
- Stripe/payment credentials.
- Maps, weather, SMS, Slack, or expense APIs.
- Public Notion OAuth.
- Gmail Pub/Sub push setup; P0 is manually triggered polling.
- Service-account domain-wide delegation.

## Example environment contract

```dotenv
APP_ENV=demo
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=
APP_ENCRYPTION_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=
GOOGLE_DRIVE_FOLDER_ID=
GMAIL_INGEST_LABEL=RIPPLE/READY

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra

ARTIFACT_PROVIDER=notion
NOTION_ACCESS_TOKEN=
NOTION_PARENT_PAGE_ID=
```

## Secret-delivery checklist for the user

Provide credentials only through the application’s local secret file or deployment secret manager. Send the development team: the non-secret Google project ID, exact allowed origin/callback, calendar ID, folder ID, label name, model ID, and confirmation that the test user consented. Never paste client secrets, refresh tokens, API keys, session secrets, or encryption keys into issues, repository files, screenshots, chat transcripts, or the demo video.
