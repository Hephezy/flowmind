import { Inject, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { DelayedError } from "bullmq";
import { createHmac } from "node:crypto";
import { Db, checkedFetch, decrypt, safeUrl } from "./core";
import { Queues } from "./queue";
export function quietDelay(settings: any, timezone: string, now = Date.now()) {
  if (!settings.quietHours) return 0;
  const dt = DateTime.fromMillis(now, { zone: timezone }),
    start = Number(settings.quietStart ?? 22),
    end = Number(settings.quietEnd ?? 8);
  if (start === end) return 0;
  const inQuiet =
    start > end
      ? dt.hour >= start || dt.hour < end
      : dt.hour >= start && dt.hour < end;
  if (!inQuiet) return 0;
  let target = dt.set({ hour: end, minute: 0, second: 0, millisecond: 0 });
  if (target <= dt) target = target.plus({ days: 1 });
  return target.toMillis() - now;
}
@Injectable()
export class Notifications {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Queues) private queues: Queues,
  ) {}
  async user(
    userId: string,
    workspaceId: string,
    title: string,
    body: string,
    key: string,
    preference?: string,
  ) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || (preference && (user.settings as any)[preference] === false))
      return;
    const notification = await this.db.notification.upsert({
      where: { dedupeKey: key },
      create: { userId, workspaceId, title, body, dedupeKey: key },
      update: {},
    });
    if (notification.sentAt) return;
    await this.queues.add(
      "notify.send",
      "message",
      { userId, workspaceId, title, body, key },
      "msg-" + key,
    );
  }
  async send(job: any) {
    const d = job.data;
    if (d.kind === "webhook") return this.webhook(d);
    const u = await this.db.user.findUnique({ where: { id: d.userId } });
    if (
      !u ||
      !(await this.db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: d.workspaceId, userId: u.id },
        },
      }))
    )
      return;
    const notification = await this.db.notification.findUnique({
      where: { dedupeKey: d.key },
    });
    if (notification?.sentAt) return;
    const settings: any = u.settings;
    const delay = quietDelay(settings, u.timezone);
    if (delay) {
      await job.moveToDelayed(Date.now() + delay, job.token);
      throw new DelayedError();
    }
    if (settings.email !== false && process.env.RESEND_API_KEY) {
      await checkedFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": d.key,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: u.email,
          subject: d.title,
          text: d.body,
        }),
      });
    }
    const integration = await this.db.integration.findUnique({
      where: {
        workspaceId_provider: { workspaceId: d.workspaceId, provider: "slack" },
      },
    });
    if (integration && settings.slack) {
      const credentials = JSON.parse(decrypt(integration.credentials)),
        config: any = integration.settings;
      await checkedFetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: config.channel,
          text: `*${d.title}*\n${d.body}`,
        }),
      }).then(async (r) => {
        const b: any = await r.json();
        if (!b.ok) throw new Error("Slack: " + b.error);
      });
    }
    if (settings.teams) {
      const teams = await this.db.integration.findUnique({
        where: {
          workspaceId_provider: {
            workspaceId: d.workspaceId,
            provider: "teams",
          },
        },
      });
      if (teams) {
        const credentials = JSON.parse(decrypt(teams.credentials)),
          config: any = teams.settings;
        if (config.teamId && config.channelId)
          await checkedFetch(
            `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(config.teamId)}/channels/${encodeURIComponent(config.channelId)}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                body: { contentType: "text", content: `${d.title}\n${d.body}` },
              }),
            },
          );
      }
    }
    await this.db.notification.updateMany({
      where: { dedupeKey: d.key },
      data: { sentAt: new Date() },
    });
  }
  async emit(workspaceId: string, event: string, payload: any) {
    const hooks = await this.db.webhook.findMany({
      where: { workspaceId, isActive: true },
    });
    for (const hook of hooks)
      if ((hook.events as string[]).includes(event))
        await this.queues.add(
          "notify.send",
          "webhook",
          { kind: "webhook", hookId: hook.id, event, payload },
          `hook-${hook.id}-${payload.id}-${event.replace(/\./g, "-")}-${payload.runVersion || 1}`,
        );
  }
  async webhook(d: any) {
    const w = await this.db.webhook.findUnique({ where: { id: d.hookId } });
    if (!w?.isActive) return;
    const url = await safeUrl(w.url),
      body = JSON.stringify({
        event: d.event,
        data: d.payload,
        timestamp: new Date().toISOString(),
      });
    const signature = createHmac("sha256", decrypt(w.secretEncrypted))
      .update(body)
      .digest("hex");
    let status = 0,
      error = "";
    try {
      const r = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "X-FlowMind-Signature": signature,
        },
        body,
      });
      status = r.status;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e: any) {
      error = e.message;
    }
    await this.db.$transaction([
      this.db.webhookDelivery.create({
        data: {
          webhookId: w.id,
          event: d.event,
          payload: d.payload,
          status,
          error: error || null,
        },
      }),
      this.db.webhook.update({
        where: { id: w.id },
        data: {
          lastTriggeredAt: new Date(),
          ...(error
            ? { failureCount: { increment: 1 } }
            : { successCount: { increment: 1 } }),
        },
      }),
    ]);
    if (error) throw new Error(error);
  }
  async reminders() {
    const now = new Date(),
      actions = await this.db.actionItem.findMany({
        where: {
          status: { not: "done" },
          assignedTo: { not: null },
          dueDate: { lte: new Date(now.getTime() + 24 * 3600000) },
        },
      });
    for (const a of actions) {
      const diff = a.dueDate!.getTime() - now.getTime();
      if (diff < 0) continue;
      const window = diff <= 3600000 ? "1h" : "24h";
      await this.user(
        a.assignedTo!,
        a.workspaceId,
        "Action item due soon",
        `${a.title}\nDue: ${a.dueDate!.toISOString()}`,
        `${a.id}-${a.dueDate!.getTime()}-${window}`,
        "dueReminder",
      );
    }
    const users = await this.db.user.findMany({
      include: { memberships: true },
    });
    for (const u of users) {
      const local = DateTime.fromJSDate(now, { zone: u.timezone });
      if (local.hour !== 8 || local.minute > 5) continue;
      for (const m of u.memberships) {
        const settings: any = u.settings;
        const overdueItems = await this.db.actionItem.findMany({
          where: {
            workspaceId: m.workspaceId,
            assignedTo: u.id,
            status: { not: "done" },
            dueDate: { lt: now },
          },
        });
        if (overdueItems.length && settings.overdueDigest !== false)
          await this.user(
            u.id,
            m.workspaceId,
            "Your overdue action digest",
            overdueItems.map((a) => "- " + a.title).join("\n"),
            `${m.workspaceId}-${u.id}-overdue-${local.toISODate()}`,
            "overdueDigest",
          );
        if (local.weekday === 1 && settings.weeklyDigest !== false) {
          const [meetings, total, done, overdue] = await Promise.all([
            this.db.meeting.count({
              where: {
                workspaceId: m.workspaceId,
                isPrivate: false,
                createdAt: { gte: new Date(now.getTime() - 7 * 86400000) },
              },
            }),
            this.db.actionItem.count({
              where: {
                workspaceId: m.workspaceId,
                OR: [{ meetingId: null }, { meeting: { isPrivate: false } }],
              },
            }),
            this.db.actionItem.count({
              where: {
                workspaceId: m.workspaceId,
                status: "done",
                OR: [{ meetingId: null }, { meeting: { isPrivate: false } }],
              },
            }),
            this.db.actionItem.count({
              where: {
                workspaceId: m.workspaceId,
                status: { not: "done" },
                dueDate: { lt: now },
                OR: [{ meetingId: null }, { meeting: { isPrivate: false } }],
              },
            }),
          ]);
          await this.user(
            u.id,
            m.workspaceId,
            "Your weekly team summary",
            `${meetings} meetings this week · ${total ? Math.round((done / total) * 100) : 0}% actions completed · ${overdue} overdue`,
            `${m.workspaceId}-${u.id}-weekly-${local.toISODate()}`,
          );
        }
      }
    }
  }
}
