# REST and WebSocket API

Base URL: `/api`. JSON routes require `Content-Type: application/json`. Use `Authorization: Bearer <accessToken>`. Refresh cookies are managed through `/api/auth`. Resource IDs are UUIDs in live mode.

| Method               | Path                                                       | Purpose                                          |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| POST                 | `/auth/signup`, `/auth/login`                              | Create an owner workspace or sign in             |
| POST                 | `/auth/forgot`, `/auth/reset`, `/auth/verify`              | Email recovery and verification links            |
| POST                 | `/auth/refresh`, `/auth/logout`                            | Rotate or revoke refresh session                 |
| GET                  | `/bootstrap`                                               | Accessible workspace data                        |
| GET / POST           | `/meetings`                                                | List/search or create metadata                   |
| GET / PATCH / DELETE | `/meetings/:id`                                            | Read/edit/delete an accessible meeting           |
| GET                  | `/meetings/:id/status`, `/meetings/:id/audio`              | Pipeline status or recording playback            |
| POST                 | `/meetings/:id/transcript`                                 | Store timestamped segments                       |
| POST                 | `/meetings/:id/uploads`                                    | Start resumable upload: `{filename,size}`        |
| GET / PATCH          | `/uploads/:id`                                             | Read offset or append a raw chunk                |
| POST                 | `/uploads/:id/complete`                                    | Finalize assembled recording                     |
| POST                 | `/meetings/:id/process`, `/reprocess`, `/retry`, `/cancel` | Pipeline controls; suffixes are meeting-relative |
| GET / POST           | `/actions`                                                 | Read or create action items                      |
| PATCH / DELETE       | `/actions/:id`                                             | Update or remove authorized action               |
| PATCH                | `/profile`, `/workspace`                                   | Personal preferences or admin defaults           |
| GET                  | `/workspaces`                                              | Current user’s memberships                       |
| POST                 | `/workspaces/switch`                                       | Set active workspace and return JWT              |
| POST                 | `/team/invites`, `/team/accept`                            | Create/resend or accept email-scoped invite      |
| PATCH                | `/team/members/:id`                                        | Admin role change or removal                     |
| POST                 | `/security/verify-email`                                   | Resend verification email                        |
| POST                 | `/account/delete`, `/workspace/delete`                     | Confirmed account/workspace deletion             |
| GET                  | `/billing/invoices`                                        | Authorized Stripe invoice history                |
| POST                 | `/security/password`, `/security/totp`                     | Password / authenticator management              |
| GET / DELETE         | `/security/sessions`, `/security/sessions/:id`             | Read or revoke own sessions                      |
| POST                 | `/keys`, `/webhooks`                                       | Create scoped key or signed webhook              |
| DELETE               | `/resources/:resource/:id`                                 | Remove keys, invites, webhooks or integration    |
| POST                 | `/integrations/:provider/authorize`                        | Begin OAuth flow                                 |
| GET                  | `/integrations/:provider/callback`                         | OAuth callback                                   |
| PATCH                | `/integrations/:provider`                                  | Configure provider token/settings                |
| GET                  | `/integrations/:provider/recordings`                       | Available cloud recordings                       |
| GET                  | `/integrations/google/calendar`                            | Upcoming Calendar events                         |
| POST                 | `/meetings/:id/import`                                     | Import selected cloud recording                  |
| POST                 | `/integrations/export-action`                              | Create provider task from an action              |
| POST                 | `/meetings/:id/notion`                                     | Export summary as a Notion page                  |
| POST                 | `/billing/checkout`, `/billing/portal`                     | Stripe checkout/customer portal                  |
| POST                 | `/billing/webhook`                                         | Signature-verified Stripe events                 |
| PATCH                | `/notifications/read`                                      | Mark own workspace notifications read            |

Raw upload chunks use `Content-Type: application/octet-stream` and `Upload-Offset: <bytes>`. The response includes the new offset. A 409 indicates a conflicting offset; read the server offset and resume from there. The HTTP body’s declared length must match the received bytes.

Connect Socket.IO with `auth: {token: accessToken}`. Emit `meeting:join` with `{meetingId}` and read the acknowledgement. Listen for `meeting:event` objects containing `{meetingId,stage,status,progress,error?,segments?}`. Re-authenticate on token expiry and rejoin the accessible room. Poll `/meetings/:id/status` if the connection is unavailable.

Webhook events currently include `meeting.completed` and `action.completed`. Completion includes the meeting ID, title and run version; fetch full authorized results with an API key if your receiver needs more detail.
