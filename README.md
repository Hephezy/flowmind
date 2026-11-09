# FlowMind

AI meeting intelligence with a Next.js 15 frontend, a NestJS API, PostgreSQL/Prisma, Redis/BullMQ, and authenticated Socket.IO updates.

The hosted version is an **interactive browser demo**. It contains labelled sample meetings and saves edits in localStorage. It does not upload recordings, call AI providers, send emails, connect external accounts, or charge payments. The source includes a separate live API and provider adapters.

## Highlights

- **Recording to action items.** Upload a recording (or paste a transcript) and FlowMind transcribes it, extracts decisions, topics and action items with owners and due dates, and writes a summary.
- **Six-stage processing pipeline** on five BullMQ queues, with per-stage retries, cancellation and reprocessing that does not duplicate actions.
- **Grounded AI extraction.** The LLM must return each action item as schema-validated JSON with a verbatim source quote and a confidence score. Items are discarded unless the quote appears word for word in the transcript and the confidence meets the workspace threshold.
- **Large uploads.** Resumable 5 MiB chunks with server-side offsets and per-upload locking, up to 2 GiB per file.
- **Real-time updates** over authenticated Socket.IO with a Redis adapter, so multiple API instances share events.
- **Multi-tenant workspaces** with owner/admin/member roles, private meetings, invitations, TOTP two-factor authentication with one-time backup codes, and scoped, hashed API keys.
- **Security.** AES-256-GCM encryption for stored provider secrets, HMAC-signed outgoing webhooks, and an allowlist for outbound requests.
- **Integrations.** OAuth adapters for Google, Zoom, Slack, Notion, Linear, Asana and Jira, plus Stripe subscription billing.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, TanStack Query, Socket.IO client |
| API | NestJS 11, Prisma 6, PostgreSQL, Redis, BullMQ, Socket.IO, Zod |
| AI | OpenAI speech-to-text (Whisper or a diarization model), Anthropic Claude or OpenAI for extraction and summaries |
| Testing | Vitest, React Testing Library, end-to-end API suite on PGlite and a real Redis server |
| Infrastructure | Turborepo, Docker, GitHub Actions, Vercel (web), Railway (API) |

## Run the demo

Requirements: Node.js 22+ and npm.

```bash
npm ci
npm run db:generate
npm run build -w @flowmind/shared
npm run dev -w @flowmind/web
```

Open `http://localhost:3000`. Leave `NEXT_PUBLIC_API_URL` unset to use demo mode. The initial sample data is dated October 2026. Use **Demo workspace → Reset demo** to restore it.

Explore `/`, `/#meetings`, `/#actions`, `/#team`, `/#settings/profile`, and `/#welcome`. Direct Next.js routes are also provided for the main pages. Meeting links use hash navigation so newly created IDs also work in a static deployment.

## Run the live product

Requirements: Node.js 22+, Docker (or managed PostgreSQL and Redis), and FFmpeg installed on the API host.

```bash
npm ci
cp .env.example apps/api/.env
# Generate and insert separate JWT_SECRET and ENCRYPTION_KEY values:
openssl rand -hex 32
openssl rand -hex 32
# Start local PostgreSQL and Redis:
docker compose up -d
npm run db:generate
npm run db:migrate
npm run build -w @flowmind/shared
```

Create `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

Then run:

```bash
npm run dev
```

Open `http://localhost:3000/#signup` and create an account. API health is at `http://localhost:4000/api/health`. Password recovery is available from sign-in; verification can be resent from Profile settings. Authenticator enrollment reveals one-time backup codes. The API dev/start commands load `apps/api/.env`; Prisma reads the same file. No default production password is shipped. An optional seed can be run with an explicit `SEED_PASSWORD` of at least 12 characters.

### Enable AI

Set `OPENAI_API_KEY` for speech transcription and optionally `ANTHROPIC_API_KEY` for extraction and summaries. Without Anthropic, extraction uses the configured OpenAI chat model. Missing keys produce a real failed stage; the API does not substitute invented results.

`whisper-1` returns timestamped segments but **does not identify speakers**. Use `TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize` for speaker-labelled segments. Long recordings are converted to mono MP3 and segmented into 10-minute provider requests. Diarization labels are kept distinct between chunks; identity mapping across chunks needs speaker references or manual transcript corrections. Configure model names for your provider account. See [OpenAI’s transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text).

### Enable storage and delivery

Local recordings use `LOCAL_STORAGE_PATH` and require a persistent volume. Set `STORAGE_URL`, `STORAGE_KEY`, and `STORAGE_BUCKET` for Supabase Storage. Large uploads use resumable 5 MiB chunks, a server offset, per-upload locking, and a 2 GiB file limit. Completed files stay outside PostgreSQL. Abandoned uploads expire after 24 hours.

Set `RESEND_API_KEY` and a verified `EMAIL_FROM` for email. Notifications use user preferences and local quiet hours. Due reminders are scheduled in 24-hour and 1-hour windows; overdue items are grouped into a daily digest at 08:00 local time. Weekly digests run Monday at 08:00. Delivery jobs retry independently and retain a deduplication record.

### Enable integrations

OAuth adapters are included for Google, Zoom, Slack, Notion, Linear, Asana, and Jira. Set the matching client ID/secret and register this callback URL:

```text
https://your-api-domain/api/integrations/{provider}/callback
```

Use a provider access token for Teams/OneDrive until you register a Microsoft OAuth application. Configure provider scopes and app approval in the provider’s dashboard. Secrets are encrypted with AES-256-GCM.

| Provider | Required configuration                                                             | Operation                                                        |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Google   | Calendar + Drive read scopes                                                       | List upcoming Calendar events and browse/import Drive recordings |
| Zoom     | Cloud recording read scope; allow exact download hostname                          | Browse/import cloud recordings                                   |
| Slack    | `chat:write`, channel access; `channel` setting                                    | Send meeting and due-date notifications                          |
| Notion   | Access to parent page; `parentPageId`                                              | Export a meeting summary as a page                               |
| Linear   | `teamId`                                                                           | Create an issue from an action                                   |
| Asana    | `projectId`                                                                        | Create a task from an action                                     |
| Jira     | `cloudId`, `projectKey`                                                            | Create a Jira task                                               |
| Teams    | Graph access token with Files.Read; optional ChannelMessage.Send, teamId/channelId | Browse/import OneDrive Recordings; channel notifications         |
| Zapier   | HTTPS Catch Hook and signing secret                                                | Receive FlowMind webhook events                                  |

Set `autoImport: true` in a recording integration’s settings to import new provider recordings through the scheduled worker. `autoImportSince` optionally defines the earliest recording date. The database’s provider/recording unique key prevents duplicate imports. Restrict a Google token to the intended recordings where possible; the default Drive adapter lists accessible audio/video files. This feature depends on provider permissions and recording availability. A Zoom/Meet/Teams call URL alone cannot grant access or make FlowMind join a call.

Webhook URLs and Zoom download hosts must appear explicitly in `EGRESS_ALLOWED_HOSTS`. HTTPS, public DNS addresses, and disabled redirects protect outbound requests. Verify `X-FlowMind-Signature` as the hex HMAC-SHA256 of the exact request body using the one-time signing secret.

External provider calls are implemented but were **not exercised with real accounts or credentials** in this build.

### Enable billing

Set Stripe’s secret key, webhook secret, and Pro/Team price IDs. Register `POST /api/billing/webhook` for `checkout.session.completed` and `customer.subscription.deleted`. Checkout and the billing portal handle subscriptions and invoices. Test in Stripe test mode first. Plan prices in the UI come from the specification; configure matching Stripe prices. Usage is displayed. Optional `PLAN_LIMITS_JSON` configures monthly meeting, member and storage caps per plan; unspecified limits are unlimited. Referral links attach the referring workspace ID to signup. Define your own reward policy.

## Project layout

```text
apps/web/          Next.js, Tailwind, TanStack Query, Socket.IO client
  app/            Page entry points and shared styles
  components/     Dashboard, meetings, actions, team, auth, settings, UI primitives
  lib/            API client, resumable uploader, labelled demo fixtures
  test/           DOM workflow tests
apps/api/         NestJS API and workers
  src/            Auth, meetings/actions, processing, gateway, storage, LLM,
                  reminders, integrations, audit and billing services
  prisma/         Schema, initial PostgreSQL migration, optional seed
  test/           Security and extraction unit tests
packages/shared/  Shared TypeScript types, Zod validation, assignee matching
scripts/          Demo build and API integration test runner
.github/workflows/ CI and opt-in Vercel/Railway deployment
```

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run build:demo
```

`npm test` covers transcript search, manual action creation/editing/persistence, notification settings, scoped demo key disclosure, tenant query scope, RBAC, extraction validation, authenticated encryption, outbound IP restrictions, and quiet hours.

`npm run test:e2e` starts an in-memory PostgreSQL-compatible PGlite server, a real Redis server, and the compiled NestJS API. Install `redis-server` locally or set `REDIS_TEST_BINARY` to its executable. It checks actual HTTP signup, invitations, workspace switching, privacy, action ownership, scoped keys, upload offsets, pipeline failure, key/member revocation, TOTP/backup codes, verification/reset tokens, and account deletion. An explicitly local mock OpenAI endpoint also verifies all successful processing stages and reprocessing deduplication; it does not test real AI quality. This does not replace provider integration tests or load tests against native PostgreSQL.

A supported browser QA tool was unavailable in the build environment. DOM tests and responsive styles are included; visual layout and real microphone permissions still need a browser review on your target devices.

## Deployment

**Frontend:** Set the Vercel project root to `apps/web`, install from the monorepo, build shared types, and set the public API/WebSocket URLs before building. The normal Next.js build supports dynamic meeting IDs. `npm run build:demo` creates a static demo in root `dist/`.

**API:** Build the root checkout with `apps/api/Dockerfile`. Set the service environment, mount a writable persistent volume at `/app/apps/api/data`, and run Prisma migrations before starting. Railway configuration is included. PostgreSQL and Redis must be private managed services. Use HTTPS for frontend and API. Prefer subdomains of the same parent domain for refresh cookies; cross-site cookie mode requires HTTPS and can be blocked by browser third-party-cookie policies.

Socket.IO uses a Redis adapter across API instances. The API verifies room membership and session validity on delivery as well as connection. Processing workers run alongside the API; additional API instances can consume the shared queues.

CI validates PRs. Enable Vercel/Railway deployment by setting `ENABLE_VERCEL_DEPLOY` or `ENABLE_RAILWAY_DEPLOY` repository variables and the corresponding secrets. No GitHub, Vercel, Railway, DNS, or provider account was created or configured by this build. The domain `flowmind.marpel.dev` needs your DNS and hosting configuration.

## Remaining production work

Before a public launch, complete provider account testing, native PostgreSQL/load testing, a supported browser/device review, your plan/referral policies, retention rules, and monitoring. Email verification/recovery, backup codes, profile photo upload, login history, account/workspace deletion, recording cleanup, Teams delivery, referral attribution, and invoice history are included. No external account or payment history is fabricated. Configured quotas need concurrency/load tests for your traffic profile.

See `ARCHITECTURE.md`, `DESIGN.md`, `API.md`, and `FEATURES.md` for implementation details and the specification coverage map.
