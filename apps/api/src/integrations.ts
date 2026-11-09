import {
  Inject,
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import {
  Db,
  Actor,
  admin,
  checkedFetch,
  encrypt,
  decrypt,
  safeUrl,
  getMeeting,
  audit,
} from "./core";
import { Queues } from "./queue";
import { dataRoot } from "./storage";
const providers: Record<
  string,
  { auth: string; token: string; scope: string }
> = {
  google: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope:
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
  },
  zoom: {
    auth: "https://zoom.us/oauth/authorize",
    token: "https://zoom.us/oauth/token",
    scope: "",
  },
  slack: {
    auth: "https://slack.com/oauth/v2/authorize",
    token: "https://slack.com/api/oauth.v2.access",
    scope: "chat:write,channels:read",
  },
  notion: {
    auth: "https://api.notion.com/v1/oauth/authorize",
    token: "https://api.notion.com/v1/oauth/token",
    scope: "",
  },
  linear: {
    auth: "https://linear.app/oauth/authorize",
    token: "https://api.linear.app/oauth/token",
    scope: "read,write",
  },
  asana: {
    auth: "https://app.asana.com/-/oauth_authorize",
    token: "https://app.asana.com/-/oauth_token",
    scope: "default",
  },
  jira: {
    auth: "https://auth.atlassian.com/authorize",
    token: "https://auth.atlassian.com/oauth/token",
    scope: "read:jira-work write:jira-work offline_access",
  },
};
@Injectable()
export class Integrations {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Queues) private queues: Queues,
  ) {}
  config(provider: string) {
    const p = providers[provider],
      prefix = provider.toUpperCase();
    if (!p) throw new BadRequestException("Unsupported OAuth provider");
    const id = process.env[`${prefix}_CLIENT_ID`],
      secret = process.env[`${prefix}_CLIENT_SECRET`];
    if (!id || !secret)
      throw new ServiceUnavailableException(
        `${provider} OAuth credentials are not configured on the server`,
      );
    return {
      ...p,
      id,
      secret,
      redirect: `${process.env.API_PUBLIC_URL}/api/integrations/${provider}/callback`,
    };
  }
  async authorize(a: Actor, provider: string) {
    admin(a);
    const p = this.config(provider),
      state = randomBytes(32).toString("hex"),
      verifier = randomBytes(32).toString("base64url");
    await this.queues.connection.set(
      "oauth:" + state,
      JSON.stringify({ actor: a, provider, verifier }),
      "EX",
      600,
    );
    const u = new URL(p.auth);
    u.searchParams.set("client_id", p.id);
    u.searchParams.set("redirect_uri", p.redirect);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", p.scope);
    u.searchParams.set("state", state);
    if (provider === "google") {
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
    }
    if (provider === "jira") {
      u.searchParams.set("audience", "api.atlassian.com");
      u.searchParams.set("prompt", "consent");
    }
    if (provider === "linear") {
      u.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      u.searchParams.set("code_challenge_method", "S256");
    }
    return { url: u.toString() };
  }
  async callback(provider: string, code: string, state: string) {
    const raw = await this.queues.connection.getdel("oauth:" + state);
    if (!raw) throw new BadRequestException("OAuth state expired");
    const d = JSON.parse(raw);
    if (d.provider !== provider)
      throw new BadRequestException("OAuth provider mismatch");
    const membership = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: d.actor.workspaceId,
          userId: d.actor.id,
        },
      },
    });
    if (!membership || membership.role === "member")
      throw new BadRequestException("Workspace access changed");
    const p = this.config(provider),
      basic = ["zoom", "notion"].includes(provider);
    let body: any = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: p.redirect,
      ...(!basic ? { client_id: p.id, client_secret: p.secret } : {}),
      ...(provider === "linear" ? { code_verifier: d.verifier } : {}),
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (basic)
      headers.Authorization =
        "Basic " + Buffer.from(p.id + ":" + p.secret).toString("base64");
    if (provider === "notion" || provider === "jira") {
      body = JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: p.redirect,
        ...(provider === "jira"
          ? { client_id: p.id, client_secret: p.secret }
          : {}),
      });
      headers["Content-Type"] = "application/json";
    }
    const r = await checkedFetch(p.token, { method: "POST", headers, body }),
      b: any = await r.json();
    if (b.error || !b.access_token)
      throw new BadRequestException("Provider rejected authorization");
    await this.db.integration.upsert({
      where: {
        workspaceId_provider: { workspaceId: d.actor.workspaceId, provider },
      },
      create: {
        workspaceId: d.actor.workspaceId,
        provider,
        credentials: encrypt(
          JSON.stringify({
            accessToken: b.access_token,
            refreshToken: b.refresh_token,
            expiresAt: b.expires_in ? Date.now() + b.expires_in * 1000 : null,
          }),
        ),
        settings: {},
      },
      update: {
        credentials: encrypt(
          JSON.stringify({
            accessToken: b.access_token,
            refreshToken: b.refresh_token,
            expiresAt: b.expires_in ? Date.now() + b.expires_in * 1000 : null,
          }),
        ),
      },
    });
    return `${process.env.WEB_ORIGIN?.split(",")[0]}/#settings/integrations`;
  }
  async credential(a: Actor, provider: string) {
    const i = await this.db.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: a.workspaceId, provider } },
    });
    if (!i) throw new BadRequestException(`${provider} is not connected`);
    let c = JSON.parse(decrypt(i.credentials));
    if (c.expiresAt && c.expiresAt < Date.now() + 60000) {
      if (!c.refreshToken)
        throw new BadRequestException("Integration expired; reconnect it");
      const p = this.config(provider),
        r = await checkedFetch(p.token, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(provider === "zoom"
              ? {
                  Authorization:
                    "Basic " +
                    Buffer.from(p.id + ":" + p.secret).toString("base64"),
                }
              : {}),
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: c.refreshToken,
            ...(provider !== "zoom"
              ? { client_id: p.id, client_secret: p.secret }
              : {}),
          }),
        }),
        b: any = await r.json();
      if (!b.access_token)
        throw new BadRequestException("Refresh failed; reconnect integration");
      c = {
        ...c,
        accessToken: b.access_token,
        refreshToken: b.refresh_token || c.refreshToken,
        expiresAt: Date.now() + Number(b.expires_in || 3600) * 1000,
      };
      await this.db.integration.update({
        where: { id: i.id },
        data: { credentials: encrypt(JSON.stringify(c)) },
      });
    }
    return { token: c.accessToken, settings: i.settings as any };
  }
  async configure(a: Actor, provider: string, b: any) {
    admin(a);
    if (
      ![
        "slack",
        "zoom",
        "google",
        "notion",
        "linear",
        "asana",
        "jira",
        "teams",
        "zapier",
      ].includes(provider)
    )
      throw new BadRequestException("Unsupported integration");
    const existing = await this.db.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: a.workspaceId, provider } },
    });
    if (b.accessToken) {
      if (typeof b.accessToken !== "string" || b.accessToken.length > 4000)
        throw new BadRequestException("Invalid token");
      return this.db.integration
        .upsert({
          where: {
            workspaceId_provider: { workspaceId: a.workspaceId, provider },
          },
          create: {
            workspaceId: a.workspaceId,
            provider,
            credentials: encrypt(
              JSON.stringify({ accessToken: b.accessToken }),
            ),
            settings: b.settings || {},
          },
          update: {
            credentials: encrypt(
              JSON.stringify({ accessToken: b.accessToken }),
            ),
            settings: b.settings || {},
          },
        })
        .then((i) => ({
          id: i.id,
          provider: i.provider,
          settings: i.settings,
        }));
    }
    if (!existing)
      throw new BadRequestException("Connect the integration first");
    await this.db.integration.update({
      where: { id: existing.id },
      data: { settings: b.settings || {} },
    });
    return { ok: true };
  }
  async recordings(a: Actor, provider: string) {
    const { token } = await this.credential(a, provider);
    if (provider === "zoom") {
      const b: any = await checkedFetch(
        "https://api.zoom.us/v2/users/me/recordings?page_size=100",
        { headers: { Authorization: `Bearer ${token}` } },
      ).then((r) => r.json());
      return (b.meetings || []).flatMap((m: any) =>
        (m.recording_files || [])
          .filter((f: any) => f.file_type === "M4A" || f.file_type === "MP4")
          .map((f: any) => ({
            id: f.id,
            meetingId: String(m.id),
            title: m.topic,
            date: m.start_time,
            url: f.download_url,
          })),
      );
    }
    if (provider === "google") {
      const u = new URL("https://www.googleapis.com/drive/v3/files");
      u.searchParams.set(
        "q",
        "trashed = false and (mimeType contains 'video/' or mimeType contains 'audio/')",
      );
      u.searchParams.set("fields", "files(id,name,createdTime),nextPageToken");
      u.searchParams.set("pageSize", "100");
      const b: any = await checkedFetch(u.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      return b.files.map((f: any) => ({
        id: f.id,
        title: f.name,
        date: f.createdTime,
      }));
    }
    if (provider === "teams") {
      const b: any = await checkedFetch(
        "https://graph.microsoft.com/v1.0/me/drive/root:/Recordings:/children",
        { headers: { Authorization: `Bearer ${token}` } },
      ).then((r) => r.json());
      return b.value.map((f: any) => ({
        id: f.id,
        title: f.name,
        date: f.createdDateTime,
      }));
    }
    throw new BadRequestException("This provider does not supply recordings");
  }
  async importRecording(a: Actor, meetingId: string, b: any) {
    await getMeeting(this.db, a, meetingId);
    const { token } = await this.credential(a, b.provider);
    let url: string;
    if (b.provider === "zoom") {
      const recordings = await this.recordings(a, "zoom");
      const file = recordings.find((r: any) => r.id === b.recordingId);
      if (!file) throw new BadRequestException("Recording not found");
      url = await safeUrl(file.url);
    } else if (b.provider === "google")
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(b.recordingId)}?alt=media`;
    else if (b.provider === "teams")
      url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(b.recordingId)}/content`;
    else throw new BadRequestException("Unsupported provider");
    const r = await checkedFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await mkdir(join(dataRoot, "recordings"), { recursive: true });
    let size = 0;
    await pipeline(
      Readable.fromWeb(r.body as any),
      new Transform({
        transform(chunk, _e, cb) {
          size += chunk.length;
          cb(
            size > 2 * 1024 ** 3 ? new Error("Recording exceeds 2GB") : null,
            chunk,
          );
        },
      }),
      createWriteStream(join(dataRoot, "recordings", meetingId + ".media")),
    );
    await this.db.meeting.update({
      where: { id: meetingId },
      data: { storageUrl: `local:${meetingId}.media`, source: b.provider },
    });
    await audit(this.db, a, "meeting.imported", {
      meetingId,
      provider: b.provider,
    });
    return { id: meetingId };
  }
  async export(a: Actor, b: any) {
    const action = await this.db.actionItem.findFirst({
      where: {
        id: b.actionId,
        workspaceId: a.workspaceId,
        OR: [
          { meetingId: null },
          { meeting: { isPrivate: false } },
          { meeting: { uploadedBy: a.id } },
        ],
      },
    });
    if (!action) throw new BadRequestException("Action not found");
    const { token, settings } = await this.credential(a, b.provider);
    let output: any;
    const json = async (url: string, body: any, extra: any = {}) =>
      checkedFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...extra,
        },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    if (b.provider === "linear") {
      output = await json("https://api.linear.app/graphql", {
        query:
          "mutation($input: IssueCreateInput!){issueCreate(input:$input){success issue{id url}}}",
        variables: {
          input: {
            teamId: settings.teamId,
            title: action.title,
            description: action.description,
          },
        },
      });
      if (output.errors || !output.data?.issueCreate?.success)
        throw new BadRequestException("Linear task creation failed");
    } else if (b.provider === "asana")
      output = await json("https://app.asana.com/api/1.0/tasks", {
        data: {
          name: action.title,
          notes: action.description,
          projects: [settings.projectId],
          ...(action.dueDate
            ? { due_on: action.dueDate.toISOString().slice(0, 10) }
            : {}),
        },
      });
    else if (b.provider === "jira")
      output = await json(
        `https://api.atlassian.com/ex/jira/${encodeURIComponent(settings.cloudId)}/rest/api/3/issue`,
        {
          fields: {
            project: { key: settings.projectKey },
            summary: action.title,
            issuetype: { name: "Task" },
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: action.description || action.title },
                  ],
                },
              ],
            },
          },
        },
      );
    else throw new BadRequestException("Select Linear, Asana or Jira");
    await audit(this.db, a, "action.exported", {
      actionId: action.id,
      provider: b.provider,
    });
    return { ok: true, result: output };
  }
  async notion(a: Actor, id: string) {
    const m = await getMeeting(this.db, a, id),
      { token, settings } = await this.credential(a, "notion");
    if (!settings.parentPageId)
      throw new BadRequestException("Configure a Notion parent page ID");
    const r = await checkedFetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: settings.parentPageId },
        properties: { title: { title: [{ text: { content: m.title } }] } },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: (m.summary?.content || "").slice(0, 2000) },
                },
              ],
            },
          },
        ],
      }),
    });
    return r.json();
  }
  async calendar(a: Actor) {
    const { token } = await this.credential(a, "google");
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    url.searchParams.set("timeMin", new Date().toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("orderBy", "startTime");
    return checkedFetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
  }
  async autoImports(start: (actor: Actor, id: string) => Promise<any>) {
    const integrations = await this.db.integration.findMany({
      where: { provider: { in: ["zoom", "google", "teams"] } },
      include: { workspace: true },
    });
    for (const integration of integrations) {
      const settings = integration.settings as any;
      if (!settings.autoImport) continue;
      const actor: Actor = {
        id: integration.workspace.ownerId,
        workspaceId: integration.workspaceId,
        role: "owner",
      };
      const lock = "importer-" + integration.id;
      const acquired = await this.queues.connection.set(
        lock,
        "locked",
        "EX",
        1200,
        "NX",
      );
      if (!acquired) continue;
      try {
        const recordings = await this.recordings(actor, integration.provider);
        const since = Date.parse(
          settings.autoImportSince || integration.createdAt.toISOString(),
        );
        for (const recording of recordings) {
          if (Date.parse(recording.date) < since) continue;
          let meeting = await this.db.meeting.findFirst({
            where: {
              workspaceId: actor.workspaceId,
              source: integration.provider,
              externalId: recording.id,
            },
          });
          if (!meeting)
            meeting = await this.db.meeting.create({
              data: {
                workspaceId: actor.workspaceId,
                uploadedBy: actor.id,
                title: recording.title || "Imported meeting",
                date: new Date(recording.date),
                source: integration.provider,
                externalId: recording.id,
              },
            });
          if (meeting.status !== "pending") continue;
          if (!meeting.storageUrl)
            await this.importRecording(actor, meeting.id, {
              provider: integration.provider,
              recordingId: recording.id,
            });
          await start(actor, meeting.id);
        }
      } catch (e: any) {
        await audit(this.db, actor, "integration.import_failed", {
          provider: integration.provider,
          message: e.message.slice(0, 300),
        });
      } finally {
        await this.queues.connection.del(lock);
      }
    }
  }
}
