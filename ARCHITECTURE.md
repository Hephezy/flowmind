# Architecture

The Next.js interface switches between a labelled local demo and the NestJS API via `NEXT_PUBLIC_API_URL`. TanStack Query owns cached server data; action status changes update optimistically. A dropped WebSocket connection enables a REST bootstrap fallback every 10 seconds. Socket reconnects rejoin active processing rooms.

## Processing

| Queue               | Jobs                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `upload.process`    | Validate the assembled recording                                          |
| `audio.transcribe`  | Transcription and speaker analysis as separate jobs                       |
| `actions.extract`   | Action extraction and summarisation as separate jobs                      |
| `notify.send`       | Pipeline completion, email/Slack messages, signed webhooks                |
| `reminder.schedule` | Due reminders, daily/weekly digests, provider auto-import, upload cleanup |

Six visible stages share five independent named queues. Each stage gets its own job ID and retry budget; replaying transcription does not redo upload. Attempts use exponential backoff. Stage/run-version IDs prevent an old run from completing a new one. Cancellation is checked before work and writes; an already-issued provider request may still finish and incur its normal cost. Failed meetings retain their failed stage and can retry just that stage. Reprocessing completed meetings refreshes extraction and summaries from the stored transcript.

Audio is normalized using FFmpeg, then submitted in 10-minute chunks. Whisper segment results are pushed progressively. Structured extraction responses are parsed with Zod, filtered by workspace confidence, and checked against an exact source quote and timestamp. A hash of meeting/source/title deduplicates generated actions. Existing user edits remain intact during reprocessing.

## Authentication and isolation

Access JWTs expire in 15 minutes. Opaque refresh tokens expire after 30 days, are stored as SHA256 hashes, and rotate via an atomic update. Cookies are HttpOnly. Every authenticated request verifies an active session and current workspace membership. Switching a workspace updates the refresh session’s workspace. Passwords use bcrypt with cost 12.

Private meetings are visible only to their uploader; shared meetings are scoped to workspace membership. Action queries include the same meeting-privacy condition. Member mutations are limited to their uploads and assigned/created actions. Owners control billing; admins control workspace members and integrations. API keys retain the creator’s access boundaries and explicit read/write permissions. The original secret is returned only at creation; only its hash and prefix persist. Revocation and removed workspace membership invalidate subsequent requests.

TOTP secrets are encrypted. Enrollment requires code verification, and one-use hashed backup codes support account access. A verified current code is required to disable TOTP. Rotating an active authenticator requires disabling it first.

Socket.IO authenticates JWT sessions, joins only accessible meeting rooms, disconnects on token expiry, and rechecks meeting privacy/session/membership on event delivery. The Redis adapter transports events across instances.

## Storage and secrets

Uploads use UUID-based filesystem names, 5 MiB chunks, Content-Length bounds, an offset check, and exclusive locks. Each temporary chunk is appended only after successful receipt. The next attempt truncates bytes beyond the persisted offset after a crash. A persistent local staging volume is required even when Supabase Storage holds completed recordings. Provider credentials use AES-256-GCM; JWT and encryption keys must be distinct random values.

Webhook hosts are explicitly allowlisted. Public-address DNS checks, HTTPS-only endpoints, timeouts, and rejected redirects reduce SSRF exposure. For stronger protection, enforce the same egress rules at the network layer and pin outbound resolution at the HTTP agent.

Notifications persist a dedupe key and delivery timestamp. Email provider idempotency keys further reduce duplicates. A successful email followed by failed Slack delivery can still produce a duplicate Slack message after a retry; external delivery is at least once. Quiet-hour jobs are delayed until the user’s local blackout window ends. Notification preferences are checked when scheduling.

Provider OAuth state lives in Redis for ten minutes and is consumed once. Linear uses PKCE. Integration refresh and provider-specific permissions should be tested against registered provider applications before launch.
